// Forma de una importación de Excel expuesta por el backend (ver
// backend/src/imports/excel-import.mapper.ts). El frontend nunca inventa un
// campo.
export type ExcelImportRowStatus = 'VALID' | 'INVALID';
export type ExcelImportBatchStatus =
  'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED';

export interface ExcelImportRowFieldError {
  field: string;
  message: string;
  // Celda del archivo a corregir, ej. "D5".
  cell?: string;
}

// Lo que se entendió de cada fila (solo los valores que se pudieron leer).
export interface ExcelImportRowData {
  blockName?: string;
  weekNumber?: number;
  dayName?: string;
  exerciseName?: string;
  sets?: number;
  reps?: number;
  weight?: number;
  rpe?: number;
  notes?: string;
}

export interface ExcelImportRow {
  id: string;
  rowNumber: number;
  status: ExcelImportRowStatus;
  errors: ExcelImportRowFieldError[] | null;
  data: ExcelImportRowData | null;
  resultSessionExerciseId: string | null;
}

// Bloque que se creará al confirmar (solo si el archivo no tiene errores).
export interface ExcelImportPlannedBlock {
  name: string;
  weeks: number;
  days: number;
  exercises: number;
  sets: number;
  alreadyExists: boolean;
}

// Bloque creado al confirmar. `programId` solo existe en importaciones
// antiguas, que creaban Programas.
export interface ExcelImportCreatedBlock {
  id: string;
  name: string;
  programId: string | null;
}

export interface ExcelImportBatch {
  id: string;
  originalFilename: string;
  status: ExcelImportBatchStatus;
  uploadedAt: string; // ISO 8601
  confirmedAt: string | null;
  counts: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
  };
  rows: ExcelImportRow[];
  legacyTemplate: boolean;
  plan: ExcelImportPlannedBlock[];
  createdBlocks: ExcelImportCreatedBlock[];
}
