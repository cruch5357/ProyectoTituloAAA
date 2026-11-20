// Validación de FILA de la importación de Excel. Pura (nunca toca Prisma):
// recibe las celdas crudas de una fila y el resultado de buscar su ejercicio
// en el catálogo, y devuelve los valores entendidos más los errores, cada uno
// asociado a su columna para poder indicarle al coach la celda exacta.
//
// Los límites son los mismos que el editor de Bloques (blocks/library.dto.ts):
// nombres de hasta 160 caracteres, notas de hasta 2000, carga de 0 a 9999,99
// kg con hasta 2 decimales, repeticiones de 0 a 10000 y RPE de 0 a 10 con un
// decimal. Los mensajes están escritos para el coach, en español.
import {
  EXCEL_COLUMN_LABELS,
  type ExcelTemplateColumn,
} from './excel-template';

export type RawExcelRowValues = Partial<Record<ExcelTemplateColumn, unknown>>;

export interface RowFieldError {
  field: ExcelTemplateColumn;
  message: string;
  // Celda del archivo, ej. "D5". La agrega el servicio, que conoce la
  // posición de cada columna en la hoja.
  cell?: string;
}

// Resultado de buscar el ejercicio de la fila en el catálogo del coach.
export type ExerciseLookup =
  | { found: true; id: string; name: string }
  | { found: false; suggestion?: string };

export const MAX_NAME_LENGTH = 160;
export const MAX_NOTES_LENGTH = 2000;
export const MAX_SETS_PER_ROW = 20;
export const MAX_WEEK_NUMBER = 52;

export interface ValidatedRowValues {
  blockName?: string;
  weekNumber?: number;
  dayName?: string;
  exerciseName?: string;
  exerciseId?: string;
  sets?: number;
  reps?: number;
  weight?: number;
  rpe?: number;
  notes?: string;
}

export interface ValidatedExcelRow {
  errors: RowFieldError[];
  // Lo que se entendió de la fila, aunque tenga errores: ayuda a corregir.
  values: ValidatedRowValues;
}

// exceljs no ejecuta fórmulas: expone su resultado ya calculado como
// `{ formula, result }`. Un texto con formato llega como `{ richText: [...] }`
// y un hipervínculo como `{ text, hyperlink }`.
export function extractCellValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const record = value as Record<string, unknown>;
    if ('result' in record) return extractCellValue(record.result);
    if (Array.isArray(record.richText)) {
      return (record.richText as Array<{ text?: unknown }>)
        .map((part) => String(part.text ?? ''))
        .join('');
    }
    if ('text' in record) return extractCellValue(record.text);
  }
  return value;
}

// Texto de una celda, recortado y con espacios repetidos colapsados; vacío
// si la celda está en blanco.
export function cellText(value: unknown): string {
  const extracted = extractCellValue(value);
  if (extracted === null || extracted === undefined) return '';
  if (extracted instanceof Date) return '';
  return String(extracted).trim().replace(/\s+/g, ' ');
}

// Una fila sin ningún valor en las columnas conocidas se omite en silencio
// (filas en blanco al final de la hoja).
export function isBlankExcelRow(raw: RawExcelRowValues): boolean {
  return Object.values(raw).every((value) => cellText(value) === '');
}

type NumberResult = { value?: number; invalid?: true };

// Acepta números de Excel y textos como "62,5", "60 kg", "7.5".
function parseNumber(raw: unknown, unit?: RegExp): NumberResult {
  const extracted = extractCellValue(raw);
  if (extracted === null || extracted === undefined) return {};
  if (typeof extracted === 'number') {
    return Number.isFinite(extracted)
      ? { value: extracted }
      : { invalid: true };
  }
  let text = cellText(extracted).toLowerCase();
  if (!text) return {};
  if (unit) text = text.replace(unit, '').trim();
  const normalized = text.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return { invalid: true };
  return { value: Number(normalized) };
}

function decimals(value: number): number {
  const [, fraction = ''] = String(value).split('.');
  return fraction.length;
}

export function validateExcelRow(
  raw: RawExcelRowValues,
  exercise: ExerciseLookup | null,
): ValidatedExcelRow {
  const errors: RowFieldError[] = [];
  const values: ValidatedRowValues = {};
  const fail = (field: ExcelTemplateColumn, message: string) =>
    errors.push({ field, message });

  const text = (field: ExcelTemplateColumn, required: string) => {
    const value = cellText(raw[field]);
    if (!value) {
      fail(field, required);
      return undefined;
    }
    if (value.length > MAX_NAME_LENGTH) {
      fail(
        field,
        `${EXCEL_COLUMN_LABELS[field]} admite hasta ${MAX_NAME_LENGTH} caracteres.`,
      );
    }
    return value;
  };

  values.blockName = text(
    'block_name',
    'Escribe el nombre del bloque (por ejemplo "Fuerza base").',
  );

  // Semana: 1, 2, 3… También se entiende "Semana 2" o "S2".
  const weekText = cellText(raw.week_number);
  if (!weekText) {
    fail('week_number', 'Escribe el número de semana (1, 2, 3…).');
  } else {
    const match = /^(?:semana|sem|s)?\s*(\d+)$/i.exec(weekText);
    const week = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(week) || week < 1 || week > MAX_WEEK_NUMBER) {
      fail(
        'week_number',
        `La semana debe ser un número entero entre 1 y ${MAX_WEEK_NUMBER} (se leyó "${weekText}").`,
      );
    } else {
      values.weekNumber = week;
    }
  }

  values.dayName = text(
    'day_name',
    'Escribe el nombre del día de entrenamiento (por ejemplo "Día A" o "Tren inferior").',
  );

  const exerciseName = cellText(raw.exercise_name);
  if (!exerciseName) {
    fail(
      'exercise_name',
      'Escribe el ejercicio. Debe ser uno de la hoja "Mis ejercicios".',
    );
  } else {
    values.exerciseName = exerciseName;
    if (exercise?.found) {
      values.exerciseId = exercise.id;
      values.exerciseName = exercise.name;
    } else {
      const suggestion =
        exercise?.found === false ? exercise.suggestion : undefined;
      const hint = suggestion
        ? ` ¿Quisiste decir "${suggestion}"?`
        : ' Revisa los nombres exactos en la hoja "Mis ejercicios" o créalo primero en Ejercicios.';
      fail(
        'exercise_name',
        `"${exerciseName}" no está en tu catálogo de ejercicios.${hint}`,
      );
    }
  }

  const sets = parseNumber(raw.sets);
  if (
    sets.invalid ||
    (sets.value !== undefined &&
      (!Number.isInteger(sets.value) ||
        sets.value < 1 ||
        sets.value > MAX_SETS_PER_ROW))
  ) {
    fail(
      'sets',
      `Las series deben ser un número entero entre 1 y ${MAX_SETS_PER_ROW}. Si la dejas vacía se crea 1 serie.`,
    );
  } else {
    values.sets = sets.value ?? 1;
  }

  const repsText = cellText(raw.reps);
  const reps = parseNumber(raw.reps);
  if (/^\d+\s*[-–a]\s*\d+$/.test(repsText)) {
    fail(
      'reps',
      `Escribe un solo número de repeticiones (se leyó "${repsText}"). Si quieres un rango, anótalo en Notas.`,
    );
  } else if (
    reps.invalid ||
    (reps.value !== undefined &&
      (!Number.isInteger(reps.value) || reps.value < 0 || reps.value > 10000))
  ) {
    fail(
      'reps',
      'Las repeticiones deben ser un número entero (por ejemplo 8).',
    );
  } else {
    values.reps = reps.value;
  }

  const weight = parseNumber(raw.weight, /\s*(kg|kgs|kilos?)$/);
  if (
    weight.invalid ||
    (weight.value !== undefined &&
      (weight.value < 0 ||
        weight.value > 9999.99 ||
        decimals(weight.value) > 2))
  ) {
    fail(
      'weight',
      'La carga debe ser un número en kilos, de 0 a 9999,99 (por ejemplo 62,5).',
    );
  } else {
    values.weight = weight.value;
  }

  const rpe = parseNumber(raw.rpe);
  if (
    rpe.invalid ||
    (rpe.value !== undefined &&
      (rpe.value < 0 || rpe.value > 10 || decimals(rpe.value) > 1))
  ) {
    fail('rpe', 'El RPE debe ser un número de 0 a 10 (por ejemplo 7 o 7,5).');
  } else {
    values.rpe = rpe.value;
  }

  const notes = cellText(raw.notes);
  if (notes.length > MAX_NOTES_LENGTH) {
    fail('notes', `Las notas admiten hasta ${MAX_NOTES_LENGTH} caracteres.`);
  } else if (notes) {
    values.notes = notes;
  }

  return { errors, values };
}
