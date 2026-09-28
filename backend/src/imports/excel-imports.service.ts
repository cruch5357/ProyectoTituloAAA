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
  EXCEL_MANDATORY_COLUMNS,
  EXCEL_TEMPLATE_COLUMNS,
  ExcelTemplateColumn,
  isKnownTemplateColumn,
  normalizeHeaderName,
} from '../common/imports/excel-template';
import {
  isBlankExcelRow,
  RawExcelRowValues,
  validateExcelRow,
} from '../common/imports/excel-row-validation';
import {
  ExcelImportRowWithResult,
  PublicExcelImportBatch,
  toPublicExcelImportBatch,
} from './excel-import.mapper';
import {
  buildImportPlan,
  countImportPlanEntities,
  NormalizedRowInput,
} from '../common/imports/excel-import-grouping';

const GENERIC_BATCH_NOT_FOUND = 'Importación no encontrada';
const BATCH_ALREADY_FINALIZED =
  'La importación ya fue confirmada o rechazada anteriormente.';
const NO_VALID_ROWS_TO_CONFIRM =
  'El archivo no tiene ninguna fila válida para confirmar. Corrige los errores e inténtalo nuevamente.';

// Include reutilizado por cada consulta que necesita devolver la vista
// previa completa (batch + filas) — mismo criterio de "constante local de
// include", no exportada, ya usado en otros servicios (ej.
// `STUDENT_SUMMARY_SELECT` en program-assignments.service.ts). Incluye la
// cadena completa `resultSessionExercise -> session -> week -> block ->
// program` (PROMPT 14) para que `toPublicExcelImportBatch()` pueda derivar
// `createdPrograms` sin una consulta aparte, tanto recién confirmado como en
// cualquier GET posterior sobre el mismo batch.
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

export interface UploadedExcelFile {
  originalname: string;
  mimetype: string | undefined;
  size: number;
  buffer: Buffer;
}

// ---------------------------------------------------------------------------
// Importación de Excel — PRIMERA MITAD de RF-17/RF-18/RF-19 (PROMPT 13):
// archivo -> validación -> normalización inicial -> vista previa. Este
// servicio NUNCA escribe en Program/Block/Week/Session/SessionExercise (eso
// es PROMPT 14, al confirmar el batch) y NUNCA crea un Exercise nuevo en el
// catálogo del coach aunque el nombre de la fila no exista — una fila así
// queda simplemente INVALID con un error explicativo, nunca se inventa ni
// se modifica el catálogo desde acá.
//
// El archivo nunca se persiste a disco ni en la base de datos: se procesa
// enteramente en memoria (buffer de multer con `memoryStorage()`) y se
// descarta al terminar el request — coherente con que `ExcelImportBatch`
// (schema.prisma) no tiene ninguna columna de ruta/blob de almacenamiento,
// solo `originalFilename` como metadata.
// ---------------------------------------------------------------------------
@Injectable()
export class ExcelImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // Mismo patrón exacto que `ensureOwnedStudent`/`ensureOwnedExercise`: 404
  // genérico (nunca 403) tanto si el batch no existe como si es de otro
  // coach, para no confirmarle a un coach que un id ajeno corresponde a una
  // importación real de otro coach.
  private ensureOwnedBatch(
    coachId: string,
    batch: (ExcelImportBatch & { rows: ExcelImportRowWithResult[] }) | null,
  ): ExcelImportBatch & { rows: ExcelImportRowWithResult[] } {
    if (!batch || batch.coachId !== coachId) {
      throw new NotFoundException(GENERIC_BATCH_NOT_FOUND);
    }
    return batch;
  }

  async getOwnedPreview(
    coachId: string,
    batchId: string,
  ): Promise<PublicExcelImportBatch> {
    const batch = await this.prisma.excelImportBatch.findUnique({
      where: { id: batchId },
      include: BATCH_WITH_ROWS_INCLUDE,
    });
    return toPublicExcelImportBatch(this.ensureOwnedBatch(coachId, batch));
  }

  // ---------------------------------------------------------------------
  // PROMPT 14 — CONFIRMACIÓN (RF-19/RF-20): transforma las filas VÁLIDAS
  // de un batch PENDING_REVIEW en la jerarquía relacional real
  // (Program -> Block -> Week -> Session -> SessionExercise). Nunca
  // reutiliza un Program ya existente del coach (ver el comentario de
  // cabecera de `excel-import-grouping.ts` para la justificación completa):
  // cada confirmación exitosa crea SIEMPRE uno o más Program nuevos.
  //
  // Re-valida TODAS las filas contra el estado ACTUAL del catálogo de
  // ejercicios del coach (nunca confía ciegamente en el `status`/`errors`
  // guardados en el upload) — reutiliza literalmente `validateExcelRow()`
  // de PROMPT 13 (nunca se reimplementa el parser ni la validación de
  // campos), solo cambia qué `resolvedExerciseId` se le pasa. Esto significa
  // que una fila marcada INVALID en la vista previa por "ejercicio no
  // encontrado" puede confirmarse igual si el coach agregó ese ejercicio a
  // su catálogo entre el upload y la confirmación, sin necesidad de volver a
  // subir el archivo — una fila que YA era válida puede, simétricamente,
  // dejar de serlo si el ejercicio fue desactivado mientras tanto.
  // ---------------------------------------------------------------------
  async confirmBatch(
    coachId: string,
    batchId: string,
  ): Promise<PublicExcelImportBatch> {
    const batch = this.ensureOwnedBatch(
      coachId,
      await this.prisma.excelImportBatch.findUnique({
        where: { id: batchId },
        include: BATCH_WITH_ROWS_INCLUDE,
      }),
    );

    // Chequeo barato antes de re-validar nada: evita todo el trabajo de
    // re-validación si el batch ya no está pendiente.
    if (batch.status !== 'PENDING_REVIEW') {
      throw new ConflictException(BATCH_ALREADY_FINALIZED);
    }

    const exerciseIndex = await this.buildExerciseNameIndex(coachId);
    const freshRows = batch.rows.map((row) => {
      const raw = this.extractStoredCells(row.rawData);
      const exerciseName = this.readPlainString(raw.exercise_name);
      const resolvedExerciseId = exerciseName
        ? (exerciseIndex.get(exerciseName.trim().toLowerCase()) ?? null)
        : null;
      const { errors, values } = validateExcelRow(raw, resolvedExerciseId);
      return { row, errors, values, resolvedExerciseId };
    });

    const validFreshRows = freshRows.filter(
      (fresh) => fresh.errors.length === 0,
    );
    if (validFreshRows.length === 0) {
      throw new UnprocessableEntityException(NO_VALID_ROWS_TO_CONFIRM);
    }

    // Precondición garantizada por `errors.length === 0`: todos los campos
    // obligatorios de la plantilla (ver excel-template.ts) y el ejercicio ya
    // pasaron la validación de `validateExcelRow()`, así que las
    // aserciones `!` de abajo son seguras — nunca se confirma una fila cuyo
    // ejercicio no resolvió o cuyos campos de identidad falten.
    const groupingInput: NormalizedRowInput[] = validFreshRows.map((fresh) => ({
      rowId: fresh.row.id,
      rowNumber: fresh.row.rowNumber,
      exerciseId: fresh.resolvedExerciseId!,
      values: {
        programName: fresh.values.programName!,
        programDescription: fresh.values.programDescription,
        durationWeeks: fresh.values.durationWeeks,
        blockName: fresh.values.blockName!,
        blockOrder: fresh.values.blockOrder!,
        weekNumber: fresh.values.weekNumber!,
        weekOrder: fresh.values.weekOrder!,
        sessionName: fresh.values.sessionName!,
        dayOfWeek: fresh.values.dayOfWeek,
        sessionOrder: fresh.values.sessionOrder!,
        exerciseOrder: fresh.values.exerciseOrder!,
        targetSets: fresh.values.targetSets,
        targetRepsMin: fresh.values.targetRepsMin,
        targetRepsMax: fresh.values.targetRepsMax,
        targetRpe: fresh.values.targetRpe,
        targetRir: fresh.values.targetRir,
        restSeconds: fresh.values.restSeconds,
        notes: fresh.values.notes,
      },
    }));

    const planResult = buildImportPlan(groupingInput);
    if ('conflicts' in planResult) {
      throw new UnprocessableEntityException({
        message:
          'El archivo tiene filas válidas con datos contradictorios entre sí (mismo orden con identidad distinta) y no se puede confirmar.',
        errors: planResult.conflicts,
      });
    }
    const plan = planResult.plan;
    const planRowIds = new Set(groupingInput.map((row) => row.rowId));

    const confirmedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Guarda atómica + cambio de estado terminal, en una sola sentencia y
      // COMO PRIMER PASO de la transacción: si otra petición concurrente ya
      // confirmó/rechazó este batch, `count` da 0 y se aborta toda la
      // transacción (rollback) sin haber creado nada — es la barrera real
      // contra condiciones de carrera de doble confirmación (idempotencia).
      const guard = await tx.excelImportBatch.updateMany({
        where: { id: batchId, status: 'PENDING_REVIEW' },
        data: { status: 'CONFIRMED', confirmedAt },
      });
      if (guard.count === 0) {
        throw new ConflictException(BATCH_ALREADY_FINALIZED);
      }

      for (const program of plan) {
        const createdProgram = await tx.program.create({
          data: {
            coachId,
            name: program.name,
            description: program.description,
            durationWeeks: program.durationWeeks,
          },
        });
        for (const block of program.blocks) {
          const createdBlock = await tx.block.create({
            data: {
              programId: createdProgram.id,
              name: block.name,
              order: block.order,
            },
          });
          for (const week of block.weeks) {
            const createdWeek = await tx.week.create({
              data: {
                blockId: createdBlock.id,
                number: week.number,
                order: week.order,
              },
            });
            for (const session of week.sessions) {
              const createdSession = await tx.session.create({
                data: {
                  weekId: createdWeek.id,
                  name: session.name,
                  dayOfWeek: session.dayOfWeek ?? null,
                  order: session.order,
                },
              });
              for (const exercise of session.exercises) {
                const createdSessionExercise = await tx.sessionExercise.create({
                  data: {
                    sessionId: createdSession.id,
                    exerciseId: exercise.exerciseId,
                    order: exercise.order,
                    targetSets: exercise.targetSets ?? null,
                    targetRepsMin: exercise.targetRepsMin ?? null,
                    targetRepsMax: exercise.targetRepsMax ?? null,
                    targetRpe: exercise.targetRpe ?? null,
                    targetRir: exercise.targetRir ?? null,
                    restSeconds: exercise.restSeconds ?? null,
                    notes: exercise.notes ?? null,
                  },
                });
                await tx.excelImportRow.update({
                  where: { id: exercise.rowId },
                  data: {
                    resultSessionExerciseId: createdSessionExercise.id,
                    status: 'VALID',
                    errors: Prisma.JsonNull,
                  },
                });
              }
            }
          }
        }
      }

      // Refresca las filas que NO entraron al plan (siempre inválidas: si
      // el plan se construyó sin conflictos, toda fila válida quedó
      // incluida) para que la vista previa posterior refleje el resultado
      // exacto de la re-validación de esta confirmación, nunca el estado
      // potencialmente desactualizado del upload original.
      for (const fresh of freshRows) {
        if (planRowIds.has(fresh.row.id)) continue;
        await tx.excelImportRow.update({
          where: { id: fresh.row.id },
          data: {
            status: 'INVALID',
            errors: fresh.errors as unknown as Prisma.InputJsonValue,
          },
        });
      }
    });

    const entityCounts = countImportPlanEntities(plan);
    await this.auditService.record({
      actorId: coachId,
      action: AUDIT_ACTIONS.EXCEL_IMPORT_BATCH_CONFIRMED,
      entityType: AUDIT_ENTITY_EXCEL_IMPORT_BATCH,
      entityId: batchId,
      metadata: entityCounts,
    });

    const confirmedBatch = await this.prisma.excelImportBatch.findUnique({
      where: { id: batchId },
      include: BATCH_WITH_ROWS_INCLUDE,
    });
    return toPublicExcelImportBatch(
      this.ensureOwnedBatch(coachId, confirmedBatch),
    );
  }

  // ---------------------------------------------------------------------
  // PROMPT 14 — RECHAZO: descarta un batch pendiente sin generar ninguna
  // entidad de programación. Nunca toca las filas (se conserva toda la
  // trazabilidad de la vista previa tal cual quedó en PROMPT 13) — solo
  // cambia el estado del batch. `confirmedAt` se deja explícitamente en
  // `null`: ese campo significa "cuándo se CONFIRMÓ" (ver schema.prisma),
  // así que usarlo también para el rechazo sería semánticamente incorrecto.
  // ---------------------------------------------------------------------
  async rejectBatch(
    coachId: string,
    batchId: string,
  ): Promise<PublicExcelImportBatch> {
    const batch = this.ensureOwnedBatch(
      coachId,
      await this.prisma.excelImportBatch.findUnique({
        where: { id: batchId },
        include: BATCH_WITH_ROWS_INCLUDE,
      }),
    );

    if (batch.status !== 'PENDING_REVIEW') {
      throw new ConflictException(BATCH_ALREADY_FINALIZED);
    }

    // Misma guarda atómica que `confirmBatch`: una sola sentencia
    // condicionada por `status: 'PENDING_REVIEW'` es suficiente acá (no
    // hace falta envolverla en `$transaction` porque no hay ninguna otra
    // escritura que deba correr atómicamente junto a ella).
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

    const rejectedBatch = await this.prisma.excelImportBatch.findUnique({
      where: { id: batchId },
      include: BATCH_WITH_ROWS_INCLUDE,
    });
    return toPublicExcelImportBatch(
      this.ensureOwnedBatch(coachId, rejectedBatch),
    );
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
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException(
        'El archivo no contiene ninguna hoja con datos.',
      );
    }

    const columnsByIndex = this.readAndValidateHeaders(worksheet);
    const sanitizedName = sanitizeOriginalFilename(file.originalname);

    const rowsToCreate = await this.parseAndValidateRows(
      coachId,
      worksheet,
      columnsByIndex,
    );

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.excelImportBatch.create({
        data: {
          coachId,
          originalFilename: sanitizedName,
        },
      });

      if (rowsToCreate.length > 0) {
        await tx.excelImportRow.createMany({
          data: rowsToCreate.map((row) => ({
            batchId: created.id,
            rowNumber: row.rowNumber,
            rawData: row.rawData,
            status: row.status,
            errors: row.errors,
          })),
        });
      }

      const rows = await tx.excelImportRow.findMany({
        where: { batchId: created.id },
        include: ROW_RESULT_INCLUDE,
      });

      return { ...created, rows };
    });

    const validRows = batch.rows.filter((row) => row.status === 'VALID').length;

    // Auditoría de la CREACIÓN del batch (punto crítico: nace un artefacto
    // nuevo con datos del coach) — nunca se audita el contenido del archivo,
    // solo metadata ya sanitizada y conteos. Ver auth.constants.ts para el
    // criterio de por qué esta acción SÍ se audita (a diferencia de un
    // simple `create` de Program/Block/Week/Session).
    await this.auditService.record({
      actorId: coachId,
      action: AUDIT_ACTIONS.EXCEL_IMPORT_BATCH_CREATED,
      entityType: AUDIT_ENTITY_EXCEL_IMPORT_BATCH,
      entityId: batch.id,
      metadata: {
        originalFilename: sanitizedName,
        totalRows: batch.rows.length,
        validRows,
        invalidRows: batch.rows.length - validRows,
      },
    });

    return toPublicExcelImportBatch(batch);
  }

  // exceljs nunca ejecuta fórmulas ni macros (solo lee el árbol OOXML y los
  // valores/resultados ya calculados por Excel) — es la razón principal por
  // la que se eligió sobre alternativas como `xlsx`/SheetJS (ver informe de
  // cierre de PROMPT 13 para la comparación completa). Un archivo corrupto
  // o con una estructura interna inválida hace fallar `load()`, que acá se
  // traduce siempre a un 400 controlado, nunca a un 500 con detalles
  // internos.
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

  // Lee la fila 1 como encabezado, valida que estén todas las columnas
  // obligatorias, que no haya columnas desconocidas (plantilla cerrada,
  // mismo espíritu que `forbidNonWhitelisted`) y que ninguna columna
  // reconocida esté duplicada. Devuelve el mapeo índice de columna ->
  // nombre de columna de la plantilla, para leer las filas de datos.
  private readAndValidateHeaders(
    worksheet: ExcelJS.Worksheet,
  ): Map<number, ExcelTemplateColumn> {
    const headerRow = worksheet.getRow(1);
    const columnsByIndex = new Map<number, ExcelTemplateColumn>();
    const seenColumns = new Set<ExcelTemplateColumn>();
    const unknownHeaders: string[] = [];
    const duplicatedHeaders: string[] = [];

    const columnCount = Math.max(
      headerRow.cellCount,
      headerRow.actualCellCount,
    );
    for (let col = 1; col <= columnCount; col += 1) {
      const raw = headerRow.getCell(col).value;
      const normalized = normalizeHeaderName(raw);
      if (!normalized) continue;

      if (!isKnownTemplateColumn(normalized)) {
        unknownHeaders.push(normalized);
        continue;
      }
      if (seenColumns.has(normalized)) {
        duplicatedHeaders.push(normalized);
        continue;
      }
      seenColumns.add(normalized);
      columnsByIndex.set(col, normalized);
    }

    const missingMandatory = EXCEL_MANDATORY_COLUMNS.filter(
      (column) => !seenColumns.has(column),
    );

    if (
      missingMandatory.length > 0 ||
      unknownHeaders.length > 0 ||
      duplicatedHeaders.length > 0
    ) {
      throw new BadRequestException({
        message: 'El archivo no respeta la plantilla de importación esperada.',
        errors: [
          ...missingMandatory.map((column) => ({
            code: 'MISSING_MANDATORY_COLUMN',
            message: `Falta la columna obligatoria "${column}".`,
          })),
          ...unknownHeaders.map((column) => ({
            code: 'UNKNOWN_COLUMN',
            message: `La columna "${column}" no pertenece a la plantilla esperada. Columnas válidas: ${EXCEL_TEMPLATE_COLUMNS.join(', ')}.`,
          })),
          ...duplicatedHeaders.map((column) => ({
            code: 'DUPLICATED_COLUMN',
            message: `La columna "${column}" está repetida.`,
          })),
        ],
      });
    }

    return columnsByIndex;
  }

  // Resuelve TODO el catálogo activo del coach en una única consulta (nunca
  // una consulta por fila) y arma un mapa nombre-en-minúsculas -> id, para
  // que la resolución de `exercise_name` por fila sea una búsqueda en
  // memoria O(1) — el catálogo de un coach es acotado (docenas/cientos de
  // ejercicios), nunca miles, así que esto es más liviano que N consultas
  // repetidas a la base de datos.
  private async buildExerciseNameIndex(
    coachId: string,
  ): Promise<Map<string, string>> {
    const exercises = await this.prisma.exercise.findMany({
      where: { coachId, isActive: true },
      select: { id: true, name: true },
    });
    const index = new Map<string, string>();
    for (const exercise of exercises) {
      index.set(exercise.name.trim().toLowerCase(), exercise.id);
    }
    return index;
  }

  private async parseAndValidateRows(
    coachId: string,
    worksheet: ExcelJS.Worksheet,
    columnsByIndex: Map<number, ExcelTemplateColumn>,
  ): Promise<
    Array<{
      rowNumber: number;
      rawData: Prisma.InputJsonValue;
      status: ExcelImportRow['status'];
      errors: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    }>
  > {
    const exerciseIndex = await this.buildExerciseNameIndex(coachId);
    const lastRowNumber = worksheet.actualRowCount;
    const results: Array<{
      rowNumber: number;
      rawData: Prisma.InputJsonValue;
      status: ExcelImportRow['status'];
      errors: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    }> = [];

    const deadline = Date.now() + EXCEL_PROCESSING_TIMEOUT_MS;
    let dataRowCount = 0;

    for (let rowNumber = 2; rowNumber <= lastRowNumber; rowNumber += 1) {
      if (Date.now() > deadline) {
        throw new BadRequestException(
          'El procesamiento del archivo excedió el tiempo máximo permitido. Reduce el tamaño del archivo e intenta nuevamente.',
        );
      }

      const row = worksheet.getRow(rowNumber);
      const raw: RawExcelRowValues = {};
      for (const [colIndex, column] of columnsByIndex) {
        (raw as Record<string, unknown>)[column] = row.getCell(colIndex).value;
      }

      if (isBlankExcelRow(raw)) {
        continue;
      }

      dataRowCount += 1;
      if (dataRowCount > EXCEL_MAX_DATA_ROWS) {
        throw new BadRequestException(
          `El archivo supera el máximo de ${EXCEL_MAX_DATA_ROWS} filas de datos permitidas por importación.`,
        );
      }

      const exerciseName = this.readPlainString(raw.exercise_name);
      const resolvedExerciseId = exerciseName
        ? (exerciseIndex.get(exerciseName.trim().toLowerCase()) ?? null)
        : null;

      const { errors, values } = validateExcelRow(raw, resolvedExerciseId);

      results.push({
        rowNumber,
        rawData: {
          cells: this.toJsonSafeCells(raw),
          normalized: values as unknown as Prisma.InputJsonValue,
        } as unknown as Prisma.InputJsonValue,
        status: errors.length > 0 ? 'INVALID' : 'VALID',
        errors:
          errors.length > 0
            ? (errors as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      });
    }

    return results;
  }

  private readPlainString(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (
      typeof value === 'object' &&
      'result' in (value as Record<string, unknown>)
    ) {
      return this.readPlainString((value as { result: unknown }).result);
    }
    const str = String(value).trim();
    return str.length > 0 ? str : undefined;
  }

  // Convierte los valores crudos de celda (que pueden incluir objetos de
  // fórmula de exceljs o `Date`) a algo serializable en JSON, guardado ÚNICA
  // Y EXCLUSIVAMENTE para trazabilidad/depuración (comentario de
  // `ExcelImportRow.rawData` en schema.prisma) — nunca se usa como fuente de
  // verdad para ninguna decisión, eso siempre pasa por `values` (normalizado
  // en excel-row-validation.ts).
  private toJsonSafeCells(
    raw: RawExcelRowValues,
  ): Record<string, string | number | null> {
    const safe: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value === null || value === undefined) {
        safe[key] = null;
      } else if (value instanceof Date) {
        safe[key] = value.toISOString();
      } else if (typeof value === 'number' || typeof value === 'string') {
        safe[key] = value;
      } else if (
        typeof value === 'object' &&
        'result' in (value as Record<string, unknown>)
      ) {
        const result = (value as { result: unknown }).result;
        safe[key] =
          typeof result === 'number' || typeof result === 'string'
            ? result
            : String(result ?? '');
      } else {
        safe[key] = String(value);
      }
    }
    return safe;
  }

  // ---------------------------------------------------------------------
  // PROMPT 14 — reconstruye un `RawExcelRowValues` a partir de lo que
  // `parseAndValidateRows` guardó en `ExcelImportRow.rawData` (siempre con
  // forma `{ cells: {...}, normalized: {...} }`, ver más arriba). Se usa
  // ÚNICAMENTE `cells` (los valores crudos ya aplanados a
  // string/number/null por `toJsonSafeCells`) y nunca `normalized`: la
  // confirmación debe re-ejecutar `validateExcelRow()` de punta a punta
  // (incluida la resolución del ejercicio contra el catálogo ACTUAL del
  // coach), no confiar en un resultado de validación potencialmente
  // desactualizado calculado en el momento del upload.
  private extractStoredCells(rawData: Prisma.JsonValue): RawExcelRowValues {
    if (
      rawData &&
      typeof rawData === 'object' &&
      !Array.isArray(rawData) &&
      'cells' in (rawData as Record<string, unknown>)
    ) {
      const cells = (rawData as Record<string, unknown>).cells;
      if (cells && typeof cells === 'object' && !Array.isArray(cells)) {
        return cells as RawExcelRowValues;
      }
    }
    // Estado inesperado (no debería ocurrir: toda fila la crea
    // `parseAndValidateRows` con esta forma) — se trata como fila
    // completamente vacía para que `validateExcelRow` la marque inválida
    // por campos faltantes, en vez de lanzar una excepción no controlada.
    return {};
  }
}
