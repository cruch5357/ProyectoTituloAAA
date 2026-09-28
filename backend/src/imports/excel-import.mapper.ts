import {
  Block,
  ExcelImportBatch,
  ExcelImportRow,
  Program,
  Session,
  SessionExercise,
  Week,
} from '@prisma/client';

// Forma pública de una fila procesada, expuesta en la vista previa. Nunca
// expone `rawData` completo del Excel tal cual (son datos crudos guardados
// solo para trazabilidad interna, ver schema.prisma) — se reexponen los
// mismos datos ya NORMALIZADOS que se usaron para validar, más legibles
// para el coach que la fila cruda de la hoja.
export interface PublicExcelImportRow {
  id: string;
  rowNumber: number;
  status: ExcelImportRow['status'];
  errors: unknown;
  data: unknown;
  // PROMPT 14: cuál SessionExercise generó esta fila al confirmarse la
  // importación — `null` mientras el batch siga en PENDING_REVIEW/REJECTED,
  // o si la fila nunca fue válida. Permite al frontend responder
  // "qué filas generaron una SessionExercise" (requisito explícito de
  // PROMPT 14) sin adivinar nada a partir del `status`.
  resultSessionExerciseId: string | null;
}

export interface ExcelImportPreviewCounts {
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

// PROMPT 14: identifica los Program creados por ESTA importación al
// confirmarse — derivado siempre de `resultSessionExercise` de las filas
// (nunca de un campo separado a mantener sincronizado a mano), así que se ve
// igual de correcto tanto en la respuesta de `POST .../confirm` como en un
// `GET` posterior sobre el mismo batch ya confirmado.
export interface PublicCreatedProgram {
  id: string;
  name: string;
}

export interface PublicExcelImportBatch {
  id: string;
  originalFilename: string;
  status: ExcelImportBatch['status'];
  uploadedAt: Date;
  confirmedAt: Date | null;
  counts: ExcelImportPreviewCounts;
  rows: PublicExcelImportRow[];
  createdPrograms: PublicCreatedProgram[];
}

// Cadena completa que cuelga de una fila confirmada: SessionExercise ->
// Session -> Week -> Block -> Program. Se usa únicamente para derivar
// `createdPrograms` — nunca se expone tal cual al cliente.
export type ExcelImportRowWithResult = ExcelImportRow & {
  resultSessionExercise:
    | (SessionExercise & {
        session: Session & {
          week: Week & { block: Block & { program: Program } };
        };
      })
    | null;
};

export function toPublicExcelImportRow(
  row: ExcelImportRowWithResult,
): PublicExcelImportRow {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    status: row.status,
    errors: row.errors,
    // `rawData` guarda, además de la fila cruda, los valores ya
    // normalizados bajo la clave `normalized` (ver
    // excel-imports.service.ts) — es lo único que se expone acá.
    data:
      row.rawData &&
      typeof row.rawData === 'object' &&
      'normalized' in (row.rawData as Record<string, unknown>)
        ? (row.rawData as Record<string, unknown>).normalized
        : row.rawData,
    resultSessionExerciseId: row.resultSessionExerciseId,
  };
}

export function toPublicExcelImportBatch(
  batch: ExcelImportBatch & { rows: ExcelImportRowWithResult[] },
): PublicExcelImportBatch {
  const validRows = batch.rows.filter((row) => row.status === 'VALID').length;
  const invalidRows = batch.rows.length - validRows;

  const createdProgramsById = new Map<string, PublicCreatedProgram>();
  for (const row of batch.rows) {
    const program = row.resultSessionExercise?.session.week.block.program;
    if (program && !createdProgramsById.has(program.id)) {
      createdProgramsById.set(program.id, {
        id: program.id,
        name: program.name,
      });
    }
  }

  return {
    id: batch.id,
    originalFilename: batch.originalFilename,
    status: batch.status,
    uploadedAt: batch.uploadedAt,
    confirmedAt: batch.confirmedAt,
    counts: {
      totalRows: batch.rows.length,
      validRows,
      invalidRows,
    },
    rows: batch.rows
      .slice()
      .sort((a, b) => a.rowNumber - b.rowNumber)
      .map(toPublicExcelImportRow),
    createdPrograms: Array.from(createdProgramsById.values()),
  };
}
