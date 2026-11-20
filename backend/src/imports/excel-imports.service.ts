import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ExcelImportBatch, ExcelImportRow, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_EXCEL_IMPORT_BATCH,
} from '../auth/auth.constants';
import {
  sanitizeOriginalFilename,
  validateExcelFile,
} from '../common/imports/excel-file-validation';
import {
  EXCEL_MAX_DATA_ROWS,
  EXCEL_PROCESSING_TIMEOUT_MS,
} from '../common/imports/excel-import.constants';
import {
  columnLetter,
  EXCEL_COLUMN_LABELS,
  EXCEL_MANDATORY_COLUMNS,
  EXCEL_TEMPLATE_COLUMNS,
  ExcelTemplateColumn,
  isLegacyTemplateHeader,
  resolveTemplateColumn,
} from '../common/imports/excel-template';
import { fillDownHierarchy } from '../common/imports/excel-fill-down';
import {
  buildTemplateWorkbook,
  PLAN_SHEET_NAME,
} from '../common/imports/excel-template-workbook';
import {
  cellText,
  extractCellValue,
  isBlankExcelRow,
  RawExcelRowValues,
  RowFieldError,
  validateExcelRow,
  ValidatedRowValues,
} from '../common/imports/excel-row-validation';
import { buildExerciseLookup } from '../common/imports/excel-exercise-lookup';
import {
  buildImportPlan,
  looseKey,
  PlanBlock,
  PlanRowInput,
  summarizePlan,
} from '../common/imports/excel-import-grouping';
import {
  ExcelImportRowWithResult,
  isLegacyRow,
  PublicExcelImportBatch,
  PublicImportBlockSummary,
  toPublicExcelImportBatch,
} from './excel-import.mapper';

const GENERIC_BATCH_NOT_FOUND = 'Importación no encontrada';
const BATCH_ALREADY_FINALIZED =
  'La importación ya fue confirmada o rechazada anteriormente.';
const LEGACY_TEMPLATE_MESSAGE =
  'Este archivo usa la plantilla anterior (con columnas como Programa o Sesión). Descarga la plantilla nueva desde "Importar Excel", copia tu planificación en ella y súbela otra vez.';

const ROW_RESULT_INCLUDE = {
  resultSessionExercise: {
    include: {
      session: {
        include: {
          week: { include: { block: { include: { program: true } } } },
        },
      },
    },
  },
} as const;
const BATCH_WITH_ROWS_INCLUDE = {
  rows: { include: ROW_RESULT_INCLUDE },
} as const;

type BatchWithRows = ExcelImportBatch & { rows: ExcelImportRowWithResult[] };

export interface UploadedExcelFile {
  originalname: string;
  mimetype: string | undefined;
  size: number;
  buffer: Buffer;
}

// Fila leída de la hoja: celdas por columna y la letra de cada columna en el
// archivo, para indicar la celda exacta de cada error.
interface SheetRow {
  rowNumber: number;
  cells: RawExcelRowValues;
  letters: Partial<Record<ExcelTemplateColumn, string>>;
}

interface EvaluatedRow extends SheetRow {
  errors: RowFieldError[];
  values: ValidatedRowValues;
}

// ---------------------------------------------------------------------------
// Importación de Excel: archivo -> validación -> vista previa -> confirmar o
// rechazar. Al confirmar, cada bloque del archivo se crea en la biblioteca de
// Bloques del coach (igual que si lo armara en el editor), listo para
// editarlo y asignarlo con "Asignar ciclo".
//
// Nunca crea ni modifica ejercicios del catálogo: un ejercicio que no existe
// es un error de la fila (con sugerencia del nombre más parecido). El archivo
// se procesa en memoria y se descarta; solo se guardan sus filas para la
// vista previa y la trazabilidad.
// ---------------------------------------------------------------------------
@Injectable()
export class ExcelImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // 404 genérico (nunca 403) tanto si no existe como si es de otro coach.
  private ensureOwnedBatch(
    coachId: string,
    batch: BatchWithRows | null,
  ): BatchWithRows {
    if (!batch || batch.coachId !== coachId) {
      throw new NotFoundException(GENERIC_BATCH_NOT_FOUND);
    }
    return batch;
  }

  private async loadOwnedBatch(coachId: string, batchId: string) {
    return this.ensureOwnedBatch(
      coachId,
      await this.prisma.excelImportBatch.findUnique({
        where: { id: batchId },
        include: BATCH_WITH_ROWS_INCLUDE,
      }),
    );
  }

  async getOwnedPreview(
    coachId: string,
    batchId: string,
  ): Promise<PublicExcelImportBatch> {
    return this.toPublic(coachId, await this.loadOwnedBatch(coachId, batchId));
  }

  // Vista pública con el resumen de los bloques que se crearían, solo si la
  // importación sigue pendiente y no tiene errores.
  private async toPublic(
    coachId: string,
    batch: BatchWithRows,
  ): Promise<PublicExcelImportBatch> {
    let plan: PublicImportBlockSummary[] = [];
    const ready =
      batch.status === 'PENDING_REVIEW' &&
      batch.rows.length > 0 &&
      batch.rows.every((row) => row.status === 'VALID') &&
      !batch.rows.some(isLegacyRow);
    if (ready) {
      const { blocks } = buildImportPlan(
        batch.rows.map((row) => this.planInputFromStored(row)),
      );
      const existing = await this.libraryBlockNames(coachId);
      plan = summarizePlan(blocks).map((summary) => ({
        ...summary,
        alreadyExists: existing.has(looseKey(summary.name)),
      }));
    }
    return toPublicExcelImportBatch(batch, plan);
  }

  private async libraryBlockNames(coachId: string): Promise<Set<string>> {
    const blocks = await this.prisma.block.findMany({
      where: { coachId, programId: null },
      select: { name: true },
    });
    return new Set(blocks.map((block) => looseKey(block.name)));
  }

  private planInputFromStored(row: ExcelImportRow): PlanRowInput {
    const normalized = (row.rawData as { normalized?: ValidatedRowValues })
      ?.normalized;
    return {
      rowId: row.id,
      rowNumber: row.rowNumber,
      values: normalized as PlanRowInput['values'],
    };
  }

  // ---------------------------------------------------------------------
  // Confirmación: vuelve a validar todas las filas contra el catálogo
  // ACTUAL (un ejercicio pudo desactivarse desde la vista previa) y, solo si
  // no hay ningún error, crea los bloques en una única transacción. Una
  // importación con errores nunca se confirma a medias: un bloque al que le
  // faltan filas no sería la planificación que el coach escribió.
  // ---------------------------------------------------------------------
  async confirmBatch(
    coachId: string,
    batchId: string,
  ): Promise<PublicExcelImportBatch> {
    const batch = await this.loadOwnedBatch(coachId, batchId);
    if (batch.status !== 'PENDING_REVIEW') {
      throw new ConflictException(BATCH_ALREADY_FINALIZED);
    }
    if (batch.rows.some(isLegacyRow)) {
      throw new UnprocessableEntityException(LEGACY_TEMPLATE_MESSAGE);
    }

    const evaluated = await this.evaluateRows(
      coachId,
      batch.rows
        .slice()
        .sort((a, b) => a.rowNumber - b.rowNumber)
        .map((row) => this.sheetRowFromStored(row)),
    );
    const rowsWithErrors = evaluated.filter((row) => row.errors.length > 0);
    const { blocks } = buildImportPlan(
      evaluated.map((row) => ({
        rowId: this.rowIdByNumber(batch, row.rowNumber),
        rowNumber: row.rowNumber,
        values: row.values as PlanRowInput['values'],
      })),
    );
    if (rowsWithErrors.length > 0 || blocks.length === 0) {
      // Se guardan los errores actuales para que la vista previa los
      // muestre (por ejemplo, un ejercicio desactivado después de subir).
      await this.prisma.$transaction(
        evaluated.map((row) => {
          const id = this.rowIdByNumber(batch, row.rowNumber);
          return this.prisma.excelImportRow.update({
            where: { id },
            data: this.rowState(row),
          });
        }),
      );
      throw new UnprocessableEntityException(
        `No se puede importar: ${rowsWithErrors.length === 1 ? 'hay 1 fila con errores' : `hay ${rowsWithErrors.length} filas con errores`}. Corrígelas en tu Excel y súbelo otra vez.`,
      );
    }

    const confirmedAt = new Date();
    const counts = { blocks: 0, weeks: 0, days: 0, exercises: 0, sets: 0 };
    await this.prisma.$transaction(
      async (tx) => {
        // Guarda atómica como primer paso: si otra petición ya confirmó o
        // rechazó el lote, se aborta sin crear nada (doble clic, dos pestañas).
        const guard = await tx.excelImportBatch.updateMany({
          where: { id: batchId, status: 'PENDING_REVIEW' },
          data: { status: 'CONFIRMED', confirmedAt },
        });
        if (guard.count === 0) {
          throw new ConflictException(BATCH_ALREADY_FINALIZED);
        }
        for (const block of blocks) {
          await this.createLibraryBlock(tx, coachId, block, counts);
        }
      },
      { timeout: 30000 },
    );

    await this.auditService.record({
      actorId: coachId,
      action: AUDIT_ACTIONS.EXCEL_IMPORT_BATCH_CONFIRMED,
      entityType: AUDIT_ENTITY_EXCEL_IMPORT_BATCH,
      entityId: batchId,
      metadata: {
        blocksCreated: counts.blocks,
        weeksCreated: counts.weeks,
        daysCreated: counts.days,
        exercisesCreated: counts.exercises,
        setsCreated: counts.sets,
        rows: evaluated.length,
      },
    });

    return this.toPublic(coachId, await this.loadOwnedBatch(coachId, batchId));
  }

  // Crea un bloque de la biblioteca con la misma forma que guarda el editor
  // de Bloques (blocks/library-tree.ts): semanas numeradas desde 1, días y
  // ejercicios en orden, una ProgrammedSet por serie.
  private async createLibraryBlock(
    tx: Prisma.TransactionClient,
    coachId: string,
    block: PlanBlock,
    counts: Record<'blocks' | 'weeks' | 'days' | 'exercises' | 'sets', number>,
  ) {
    const created = await tx.block.create({
      data: { coachId, name: block.name, order: 1 },
    });
    counts.blocks += 1;
    for (const [weekIndex, week] of block.weeks.entries()) {
      const createdWeek = await tx.week.create({
        data: {
          blockId: created.id,
          number: weekIndex + 1,
          order: weekIndex + 1,
        },
      });
      counts.weeks += 1;
      for (const [dayIndex, day] of week.days.entries()) {
        const session = await tx.session.create({
          data: { weekId: createdWeek.id, name: day.name, order: dayIndex + 1 },
        });
        counts.days += 1;
        for (const [exerciseIndex, exercise] of day.exercises.entries()) {
          const sessionExercise = await tx.sessionExercise.create({
            data: {
              sessionId: session.id,
              exerciseId: exercise.exerciseId,
              order: exerciseIndex + 1,
              notes: exercise.notes,
              modifiers: [],
              targetSets: exercise.sets.length,
              programmedSets: {
                create: exercise.sets.map((set, setIndex) => ({
                  order: setIndex + 1,
                  weight: set.weight,
                  reps: set.reps,
                  rpe: set.rpe,
                })),
              },
            },
          });
          counts.exercises += 1;
          counts.sets += exercise.sets.length;
          await tx.excelImportRow.updateMany({
            where: { id: { in: exercise.rowIds } },
            data: { resultSessionExerciseId: sessionExercise.id },
          });
        }
      }
    }
  }

  private rowIdByNumber(batch: BatchWithRows, rowNumber: number): string {
    return batch.rows.find((row) => row.rowNumber === rowNumber)!.id;
  }

  // Rechazo: descarta un lote pendiente sin crear nada. Conserva sus filas
  // tal cual para la trazabilidad.
  async rejectBatch(
    coachId: string,
    batchId: string,
  ): Promise<PublicExcelImportBatch> {
    const batch = await this.loadOwnedBatch(coachId, batchId);
    if (batch.status !== 'PENDING_REVIEW') {
      throw new ConflictException(BATCH_ALREADY_FINALIZED);
    }
    const guard = await this.prisma.excelImportBatch.updateMany({
      where: { id: batchId, status: 'PENDING_REVIEW' },
      data: { status: 'REJECTED' },
    });
    if (guard.count === 0) {
      throw new ConflictException(BATCH_ALREADY_FINALIZED);
    }
    await this.auditService.record({
      actorId: coachId,
      action: AUDIT_ACTIONS.EXCEL_IMPORT_BATCH_REJECTED,
      entityType: AUDIT_ENTITY_EXCEL_IMPORT_BATCH,
      entityId: batchId,
      metadata: {},
    });
    return this.toPublic(coachId, await this.loadOwnedBatch(coachId, batchId));
  }

  // Plantilla .xlsx con el catálogo activo del coach (lista desplegable de
  // ejercicios y filas de ejemplo importables tal cual).
  async buildTemplate(coachId: string): Promise<Buffer> {
    const exercises = await this.prisma.exercise.findMany({
      where: { coachId, isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return buildTemplateWorkbook(exercises.map((exercise) => exercise.name));
  }

  async createFromUpload(
    coachId: string,
    file: UploadedExcelFile | undefined,
  ): Promise<PublicExcelImportBatch> {
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo .xlsx.');
    }
    const fileErrors = validateExcelFile({
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
    if (fileErrors.length > 0) {
      throw new BadRequestException({
        message: 'El archivo no es un Excel (.xlsx) válido.',
        errors: fileErrors,
      });
    }

    const workbook = await this.loadWorkbook(file.buffer);
    const worksheet =
      workbook.getWorksheet(PLAN_SHEET_NAME) ?? workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException(
        'El archivo no contiene ninguna hoja con datos.',
      );
    }

    const columnsByIndex = this.readAndValidateHeaders(worksheet);
    const sheetRows = this.readRows(worksheet, columnsByIndex);
    if (sheetRows.length === 0) {
      throw new BadRequestException(
        `La hoja "${worksheet.name}" no tiene filas con datos debajo de los encabezados.`,
      );
    }
    const evaluated = await this.evaluateRows(coachId, sheetRows);
    const sanitizedName = sanitizeOriginalFilename(file.originalname);

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.excelImportBatch.create({
        data: { coachId, originalFilename: sanitizedName },
      });
      await tx.excelImportRow.createMany({
        data: evaluated.map((row) => ({
          batchId: created.id,
          rowNumber: row.rowNumber,
          ...this.rowState(row),
        })),
      });
      const rows = await tx.excelImportRow.findMany({
        where: { batchId: created.id },
        include: ROW_RESULT_INCLUDE,
      });
      return { ...created, rows } as BatchWithRows;
    });

    const invalidRows = evaluated.filter((row) => row.errors.length).length;
    await this.auditService.record({
      actorId: coachId,
      action: AUDIT_ACTIONS.EXCEL_IMPORT_BATCH_CREATED,
      entityType: AUDIT_ENTITY_EXCEL_IMPORT_BATCH,
      entityId: batch.id,
      metadata: {
        originalFilename: sanitizedName,
        totalRows: evaluated.length,
        validRows: evaluated.length - invalidRows,
        invalidRows,
      },
    });

    return this.toPublic(coachId, batch);
  }

  // Lo que se guarda de cada fila: celdas (ya completadas con la fila de
  // arriba), letras de columna, valores entendidos y errores con su celda.
  private rowState(row: EvaluatedRow) {
    return {
      rawData: {
        cells: this.toJsonSafeCells(row.cells),
        letters: row.letters,
        normalized: row.values,
      } as unknown as Prisma.InputJsonValue,
      status: row.errors.length > 0 ? ('INVALID' as const) : ('VALID' as const),
      errors:
        row.errors.length > 0
          ? (row.errors as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    };
  }

  // Valida cada fila contra el catálogo del coach y luego las revisa en
  // conjunto (nombres de bloque/día escritos distinto, semanas salteadas,
  // más de 7 días). Cada error queda en su fila con la celda a corregir.
  private async evaluateRows(
    coachId: string,
    sheetRows: SheetRow[],
  ): Promise<EvaluatedRow[]> {
    const exercises = await this.prisma.exercise.findMany({
      where: { coachId, isActive: true },
      select: { id: true, name: true },
    });
    const lookup = buildExerciseLookup(exercises);
    const evaluated: EvaluatedRow[] = sheetRows.map((row) => {
      const name = cellText(row.cells.exercise_name);
      const { errors, values } = validateExcelRow(
        row.cells,
        name ? lookup(name) : null,
      );
      return { ...row, errors, values };
    });
    const { errors } = buildImportPlan(
      evaluated
        .filter((row) => row.errors.length === 0)
        .map((row) => ({
          rowId: String(row.rowNumber),
          rowNumber: row.rowNumber,
          values: row.values as PlanRowInput['values'],
        })),
    );
    for (const error of errors) {
      evaluated
        .find((row) => row.rowNumber === error.rowNumber)!
        .errors.push({ field: error.field, message: error.message });
    }
    for (const row of evaluated) {
      for (const error of row.errors) {
        const letter = row.letters[error.field];
        if (letter) error.cell = `${letter}${row.rowNumber}`;
      }
    }
    return evaluated;
  }

  private sheetRowFromStored(row: ExcelImportRow): SheetRow {
    const raw = row.rawData as {
      cells?: RawExcelRowValues;
      letters?: SheetRow['letters'];
    } | null;
    return {
      rowNumber: row.rowNumber,
      cells: raw?.cells ?? {},
      letters: raw?.letters ?? {},
    };
  }

  // exceljs nunca ejecuta fórmulas ni macros: solo lee valores ya calculados.
  // Un archivo corrupto se traduce siempre a un 400 controlado.
  private async loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException(
        'No se pudo leer el archivo: su estructura interna no es un .xlsx válido o está corrupto.',
      );
    }
    return workbook;
  }

  // Lee la fila 1 como encabezado: columnas obligatorias presentes, ninguna
  // desconocida ni repetida. Acepta los encabezados en español (con o sin
  // tildes), sus alias y los nombres técnicos.
  private readAndValidateHeaders(
    worksheet: ExcelJS.Worksheet,
  ): Map<number, ExcelTemplateColumn> {
    const headerRow = worksheet.getRow(1);
    const columnsByIndex = new Map<number, ExcelTemplateColumn>();
    const seen = new Set<ExcelTemplateColumn>();
    const unknown: string[] = [];
    const duplicated: string[] = [];
    let legacy = false;

    const columnCount = Math.max(
      headerRow.cellCount,
      headerRow.actualCellCount,
    );
    for (let col = 1; col <= columnCount; col += 1) {
      const rawHeader = extractCellValue(headerRow.getCell(col).value);
      const headerText = cellText(rawHeader);
      if (!headerText) continue;
      if (isLegacyTemplateHeader(rawHeader)) {
        legacy = true;
        continue;
      }
      const column = resolveTemplateColumn(rawHeader);
      if (!column) {
        unknown.push(`"${headerText}" (columna ${columnLetter(col)})`);
      } else if (seen.has(column)) {
        duplicated.push(`"${headerText}" (columna ${columnLetter(col)})`);
      } else {
        seen.add(column);
        columnsByIndex.set(col, column);
      }
    }
    if (legacy) throw new BadRequestException(LEGACY_TEMPLATE_MESSAGE);

    const missing = EXCEL_MANDATORY_COLUMNS.filter(
      (column) => !seen.has(column),
    );
    const problems = [
      ...missing.map(
        (column) =>
          `Falta la columna obligatoria "${EXCEL_COLUMN_LABELS[column]}".`,
      ),
      ...(unknown.length
        ? [
            `${unknown.length === 1 ? 'La columna' : 'Las columnas'} ${unknown.join(', ')} no ${unknown.length === 1 ? 'pertenece' : 'pertenecen'} a la plantilla.`,
          ]
        : []),
      ...duplicated.map((header) => `La columna ${header} está repetida.`),
    ];
    if (problems.length > 0) {
      throw new BadRequestException(
        `El archivo no respeta la plantilla (los encabezados van en la fila 1). ${problems.join(' ')} Columnas válidas: ${EXCEL_TEMPLATE_COLUMNS.map((column) => EXCEL_COLUMN_LABELS[column]).join(', ')}.`,
      );
    }
    return columnsByIndex;
  }

  private readRows(
    worksheet: ExcelJS.Worksheet,
    columnsByIndex: Map<number, ExcelTemplateColumn>,
  ): SheetRow[] {
    const letters: SheetRow['letters'] = {};
    for (const [index, column] of columnsByIndex) {
      letters[column] = columnLetter(index);
    }
    const deadline = Date.now() + EXCEL_PROCESSING_TIMEOUT_MS;
    const rows: SheetRow[] = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      if (Date.now() > deadline) {
        throw new BadRequestException(
          'El procesamiento del archivo excedió el tiempo máximo permitido. Reduce el tamaño del archivo e intenta nuevamente.',
        );
      }
      const row = worksheet.getRow(rowNumber);
      const cells: RawExcelRowValues = {};
      for (const [index, column] of columnsByIndex) {
        cells[column] = row.getCell(index).value;
      }
      if (isBlankExcelRow(cells)) continue;
      if (rows.length >= EXCEL_MAX_DATA_ROWS) {
        throw new BadRequestException(
          `El archivo supera el máximo de ${EXCEL_MAX_DATA_ROWS} filas de datos permitidas por importación.`,
        );
      }
      rows.push({ rowNumber, cells, letters });
    }
    const filled = fillDownHierarchy(rows.map((row) => row.cells));
    return rows.map((row, index) => ({ ...row, cells: filled[index] }));
  }

  // Celdas en forma serializable (fórmulas -> su resultado, fechas -> ISO),
  // guardadas para la trazabilidad y para volver a validar al confirmar.
  private toJsonSafeCells(
    raw: RawExcelRowValues,
  ): Record<string, string | number | null> {
    const safe: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(raw)) {
      const extracted = extractCellValue(value);
      if (extracted === null || extracted === undefined) safe[key] = null;
      else if (extracted instanceof Date) safe[key] = extracted.toISOString();
      else if (typeof extracted === 'number' || typeof extracted === 'string')
        safe[key] = extracted;
      else safe[key] = String(extracted);
    }
    return safe;
  }
}
