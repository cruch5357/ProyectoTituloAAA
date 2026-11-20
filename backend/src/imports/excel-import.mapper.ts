import {
  Block,
  ExcelImportBatch,
  ExcelImportRow,
  Program,
  Session,
  SessionExercise,
  Week,
} from '@prisma/client';
import type { PlanSummary } from '../common/imports/excel-import-grouping';

// Forma pública de una fila procesada. Nunca expone las celdas crudas del
// Excel (se guardan solo para trazabilidad): expone los valores ya
// entendidos y sus errores, cada uno con su columna y celda (ej. "D5").
export interface PublicExcelImportRow {
  id: string;
  rowNumber: number;
  status: ExcelImportRow['status'];
  errors: unknown;
  data: unknown;
  // Ejercicio del bloque creado a partir de esta fila al confirmar; `null`
  // mientras la importación no esté confirmada.
  resultSessionExerciseId: string | null;
}

export interface ExcelImportPreviewCounts {
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

// Bloque que se creará al confirmar (vista previa sin errores).
export interface PublicImportBlockSummary extends PlanSummary {
  // Ya existe un bloque con ese nombre en la biblioteca: se creará otro.
  alreadyExists: boolean;
}

// Bloque creado por esta importación, derivado de `resultSessionExercise`
// de sus filas. `programId` solo existe en importaciones antiguas, que
// creaban Programas en vez de bloques de la biblioteca.
export interface PublicCreatedBlock {
  id: string;
  name: string;
  programId: string | null;
}

export interface PublicExcelImportBatch {
  id: string;
  originalFilename: string;
  status: ExcelImportBatch['status'];
  uploadedAt: Date;
  confirmedAt: Date | null;
  counts: ExcelImportPreviewCounts;
  rows: PublicExcelImportRow[];
  // Importación subida con la plantilla anterior (Programa/Sesión/...):
  // ya no se puede confirmar; hay que volver a subirla con la nueva.
  legacyTemplate: boolean;
  plan: PublicImportBlockSummary[];
  createdBlocks: PublicCreatedBlock[];
}

export type ExcelImportRowWithResult = ExcelImportRow & {
  resultSessionExercise:
    | (SessionExercise & {
        session: Session & {
          week: Week & { block: Block & { program: Program | null } };
        };
      })
    | null;
};

export function storedNormalized(row: ExcelImportRow): Record<string, unknown> {
  const raw = row.rawData as Record<string, unknown> | null;
  const normalized = raw && typeof raw === 'object' ? raw.normalized : null;
  return normalized && typeof normalized === 'object'
    ? (normalized as Record<string, unknown>)
    : {};
}

// Las filas de la plantilla anterior guardaban `programName`/`sessionName`;
// las actuales guardan `dayName`.
export function isLegacyRow(row: ExcelImportRow): boolean {
  const normalized = storedNormalized(row);
  return 'programName' in normalized || 'sessionName' in normalized;
}

export function toPublicExcelImportRow(
  row: ExcelImportRowWithResult,
): PublicExcelImportRow {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    status: row.status,
    errors: row.errors,
    data: storedNormalized(row),
    resultSessionExerciseId: row.resultSessionExerciseId,
  };
}

export function toPublicExcelImportBatch(
  batch: ExcelImportBatch & { rows: ExcelImportRowWithResult[] },
  plan: PublicImportBlockSummary[] = [],
): PublicExcelImportBatch {
  const validRows = batch.rows.filter((row) => row.status === 'VALID').length;
  const createdBlocks = new Map<string, PublicCreatedBlock>();
  for (const row of batch.rows) {
    const block = row.resultSessionExercise?.session.week.block;
    if (block && !createdBlocks.has(block.id)) {
      createdBlocks.set(block.id, {
        id: block.id,
        name: block.program?.name ?? block.name,
        programId: block.programId,
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
      invalidRows: batch.rows.length - validRows,
    },
    rows: batch.rows
      .slice()
      .sort((a, b) => a.rowNumber - b.rowNumber)
      .map(toPublicExcelImportRow),
    legacyTemplate: batch.rows.some(isLegacyRow),
    plan,
    createdBlocks: [...createdBlocks.values()],
  };
}
