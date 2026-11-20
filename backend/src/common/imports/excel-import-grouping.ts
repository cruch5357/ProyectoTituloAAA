// Agrupa las filas válidas de un Excel en bloques de la biblioteca (Bloque ->
// Semana -> Día -> Ejercicio -> series) y detecta los errores que solo se
// ven mirando varias filas a la vez. Función pura: no toca Prisma.
//
// Reglas:
// - Bloque: se identifica por su nombre. Todas sus filas deben escribirlo
//   EXACTAMENTE igual: si dos filas escriben "Adaptación" y "adaptacion", no
//   se adivina cuál es el correcto, se pide corregirlo (fila y celda).
// - Semana: número dentro del bloque. Deben ir seguidas desde la 1 (como en
//   el editor de Bloques); un salto (1, 2, 4) es un error.
// - Día: se identifica por su nombre dentro de su semana, con la misma regla
//   de escritura exacta que el bloque. Máximo 7 días por semana.
// - Ejercicio: cada fila es un ejercicio del día con N series iguales. Si la
//   fila siguiente repite el mismo ejercicio en el mismo día, sus series se
//   agregan al mismo ejercicio (así se escriben pirámides: 1x10 a 60 kg,
//   1x8 a 70 kg...).
// - Los bloques, semanas, días y ejercicios quedan en el orden de las filas.
import type { ExcelTemplateColumn } from './excel-template';

export interface PlanRowInput {
  rowId: string;
  rowNumber: number;
  values: {
    blockName: string;
    weekNumber: number;
    dayName: string;
    exerciseId: string;
    exerciseName: string;
    sets: number;
    reps?: number;
    weight?: number;
    rpe?: number;
    notes?: string;
  };
}

export interface PlanError {
  rowId: string;
  rowNumber: number;
  field: ExcelTemplateColumn;
  message: string;
}

export interface PlanSet {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface PlanExercise {
  exerciseId: string;
  exerciseName: string;
  notes: string;
  sets: PlanSet[];
  rowIds: string[];
}

export interface PlanDay {
  name: string;
  exercises: PlanExercise[];
}

export interface PlanWeek {
  number: number;
  days: PlanDay[];
}

export interface PlanBlock {
  name: string;
  weeks: PlanWeek[];
}

export interface ImportPlanResult {
  blocks: PlanBlock[];
  errors: PlanError[];
}

export const MAX_DAYS_PER_WEEK = 7;

// Misma palabra sin importar tildes, mayúsculas ni espacios repetidos.
export function looseKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

const exactName = (value: string) => value.trim().replace(/\s+/g, ' ');

interface MutableDay extends PlanDay {
  firstRow: number;
}
interface MutableWeek {
  number: number;
  days: Map<string, MutableDay>;
  firstRowId: string;
  firstRow: number;
}
interface MutableBlock {
  name: string;
  firstRow: number;
  weeks: Map<number, MutableWeek>;
}

function list(numbers: number[]): string {
  if (numbers.length === 1) return String(numbers[0]);
  return `${numbers.slice(0, -1).join(', ')} y ${numbers[numbers.length - 1]}`;
}

export function buildImportPlan(rows: PlanRowInput[]): ImportPlanResult {
  const errors: PlanError[] = [];
  const blocks = new Map<string, MutableBlock>();
  const sorted = rows.slice().sort((a, b) => a.rowNumber - b.rowNumber);
  let previousRow: { dayKey: string; exercise: PlanExercise } | null = null;

  for (const row of sorted) {
    const v = row.values;
    const blockName = exactName(v.blockName);
    const dayName = exactName(v.dayName);
    const fail = (field: ExcelTemplateColumn, message: string) => {
      errors.push({
        rowId: row.rowId,
        rowNumber: row.rowNumber,
        field,
        message,
      });
      previousRow = null;
    };

    const blockKey = looseKey(blockName);
    let block = blocks.get(blockKey);
    if (!block) {
      block = { name: blockName, firstRow: row.rowNumber, weeks: new Map() };
      blocks.set(blockKey, block);
    } else if (block.name !== blockName) {
      fail(
        'block_name',
        `El bloque está escrito "${blockName}", pero en la fila ${block.firstRow} se escribió "${block.name}". Escribe el nombre del bloque exactamente igual en todas sus filas (mismas tildes, mayúsculas y espacios); si no, el Excel no se puede importar.`,
      );
      continue;
    }

    let week = block.weeks.get(v.weekNumber);
    if (!week) {
      week = {
        number: v.weekNumber,
        days: new Map(),
        firstRowId: row.rowId,
        firstRow: row.rowNumber,
      };
      block.weeks.set(v.weekNumber, week);
    }

    const dayKey = looseKey(dayName);
    let day = week.days.get(dayKey);
    if (!day) {
      if (week.days.size >= MAX_DAYS_PER_WEEK) {
        fail(
          'day_name',
          `La semana ${week.number} del bloque "${block.name}" ya tiene ${MAX_DAYS_PER_WEEK} días: un bloque admite como máximo ${MAX_DAYS_PER_WEEK} días por semana.`,
        );
        continue;
      }
      day = { name: dayName, exercises: [], firstRow: row.rowNumber };
      week.days.set(dayKey, day);
    } else if (day.name !== dayName) {
      fail(
        'day_name',
        `El día está escrito "${dayName}", pero en la fila ${day.firstRow} (misma semana y bloque) se escribió "${day.name}". Escribe el nombre del día exactamente igual en todas sus filas; si no, el Excel no se puede importar.`,
      );
      continue;
    }

    const sets: PlanSet[] = Array.from({ length: v.sets }, () => ({
      weight: v.weight ?? null,
      reps: v.reps ?? null,
      rpe: v.rpe ?? null,
    }));
    const fullDayKey = `${blockKey}\u0000${v.weekNumber}\u0000${dayKey}`;
    const last: { dayKey: string; exercise: PlanExercise } | null = previousRow;
    if (
      last &&
      last.dayKey === fullDayKey &&
      last.exercise.exerciseId === v.exerciseId
    ) {
      last.exercise.sets.push(...sets);
      last.exercise.rowIds.push(row.rowId);
      if (v.notes && !last.exercise.notes.includes(v.notes)) {
        last.exercise.notes = last.exercise.notes
          ? `${last.exercise.notes} · ${v.notes}`
          : v.notes;
      }
      continue;
    }
    const exercise: PlanExercise = {
      exerciseId: v.exerciseId,
      exerciseName: v.exerciseName,
      notes: v.notes ?? '',
      sets,
      rowIds: [row.rowId],
    };
    day.exercises.push(exercise);
    previousRow = { dayKey: fullDayKey, exercise };
  }

  // Las semanas de cada bloque deben ir seguidas desde la 1.
  for (const block of blocks.values()) {
    const numbers = [...block.weeks.keys()].sort((a, b) => a - b);
    const missing: number[] = [];
    for (let n = 1; n <= numbers[numbers.length - 1]; n += 1) {
      if (!block.weeks.has(n)) missing.push(n);
    }
    if (missing.length) {
      const after = block.weeks.get(numbers.find((n) => n > missing[0])!)!;
      errors.push({
        rowId: after.firstRowId,
        rowNumber: after.firstRow,
        field: 'week_number',
        message: `El bloque "${block.name}" tiene las semanas ${list(numbers)}: falta${missing.length > 1 ? 'n' : ''} la${missing.length > 1 ? 's' : ''} semana${missing.length > 1 ? 's' : ''} ${list(missing)}. Las semanas deben ir seguidas desde la 1.`,
      });
    }
  }

  return {
    errors,
    blocks: [...blocks.values()].map((block) => ({
      name: block.name,
      weeks: [...block.weeks.values()]
        .sort((a, b) => a.number - b.number)
        .map((week) => ({
          number: week.number,
          days: [...week.days.values()].map((day) => ({
            name: day.name,
            exercises: day.exercises,
          })),
        })),
    })),
  };
}

export interface PlanSummary {
  name: string;
  weeks: number;
  days: number;
  exercises: number;
  sets: number;
}

export function summarizePlan(blocks: PlanBlock[]): PlanSummary[] {
  return blocks.map((block) => {
    const days = block.weeks.flatMap((week) => week.days);
    const exercises = days.flatMap((day) => day.exercises);
    return {
      name: block.name,
      weeks: block.weeks.length,
      days: days.length,
      exercises: exercises.length,
      sets: exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    };
  });
}
