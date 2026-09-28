// Forma de una importación de Excel expuesta por el backend (ver
// backend/src/imports/excel-import.mapper.ts, PROMPT 13/14). Refleja
// exactamente lo que el backend devuelve: el frontend nunca inventa un
// campo.
export type ExcelImportRowStatus = 'VALID' | 'INVALID';
export type ExcelImportBatchStatus = 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED';

export interface ExcelImportRowFieldError {
  field: string;
  message: string;
}

// Valores ya normalizados de una fila (ver
// common/imports/excel-row-validation.ts en el backend) — solo los que
// pudieron coercionarse a un tipo válido; un campo ausente/ilegible
// simplemente no aparece.
export interface ExcelImportRowData {
  programName?: string;
  programDescription?: string;
  durationWeeks?: number;
  blockName?: string;
  blockOrder?: number;
  weekNumber?: number;
  weekOrder?: number;
  sessionName?: string;
  dayOfWeek?: number;
  sessionOrder?: number;
  exerciseName?: string;
  exerciseOrder?: number;
  targetSets?: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  targetRpe?: number;
  targetRir?: number;
  restSeconds?: number;
  notes?: string;
}

export interface ExcelImportRow {
  id: string;
  rowNumber: number;
  status: ExcelImportRowStatus;
  errors: ExcelImportRowFieldError[] | null;
  data: ExcelImportRowData | null;
  // PROMPT 14: id del SessionExercise real que esta fila generó al
  // confirmarse la importación — `null` mientras el batch siga en
  // PENDING_REVIEW/REJECTED, o si la fila nunca fue válida.
  resultSessionExerciseId: string | null;
}

// PROMPT 14: un Program creado por ESTA importación al confirmarse.
export interface ExcelImportCreatedProgram {
  id: string;
  name: string;
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
  // PROMPT 14: Program(s) creados por la confirmación de este batch —
  // siempre `[]` mientras el batch no esté CONFIRMED.
  createdPrograms: ExcelImportCreatedProgram[];
}
