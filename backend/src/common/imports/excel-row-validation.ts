// Validación de FILA para la importación de Excel (PROMPT 13). A propósito
// NO reinventa límites/rangos: construye instancias de los DTOs de creación
// YA EXISTENTES (`CreateProgramDto`, `CreateBlockDto`, `CreateWeekDto`,
// `CreateSessionDto`, `CreateSessionExerciseDto`) con los valores de la fila
// y corre `class-validator` sobre ellas — exactamente la misma validación
// que ya corre el `ValidationPipe` global (`main.ts`) sobre esos mismos
// campos cuando se crean por API normal. Si mañana cambia un rango en algún
// DTO (ej. `targetRpe` pasa a 0-11), este archivo lo hereda automáticamente
// sin tocarlo — es la forma más robusta de cumplir el requisito explícito
// de PROMPT 13 de "no duplicar reglas de validación si ya existe una
// función reutilizable".
//
// Lo que SÍ es propio de este archivo (no existe en ningún DTO porque no
// tiene sentido fuera del contexto de una fila de Excel):
// - Coerción de valores crudos de celda (string/number/Date/objeto de
//   fórmula de exceljs) a los tipos que esos DTOs esperan.
// - Qué columnas de la plantilla son obligatorias como DATO en cada fila
//   (ver excel-template.ts para cuáles son obligatorias como ENCABEZADO).
// - Resolución del ejercicio por nombre (no existe en ningún DTO porque
//   `CreateSessionExerciseDto.exerciseId` normalmente ya viene resuelto por
//   el frontend antes de llegar a la API).
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { CreateProgramDto } from '../../programs/dto/create-program.dto';
import { CreateBlockDto } from '../../blocks/dto/create-block.dto';
import { CreateWeekDto } from '../../weeks/dto/create-week.dto';
import { CreateSessionDto } from '../../sessions/dto/create-session.dto';
import { CreateSessionExerciseDto } from '../../session-exercises/dto/create-session-exercise.dto';
import type { ExcelTemplateColumn } from './excel-template';

export interface RawExcelRowValues {
  program_name?: unknown;
  program_description?: unknown;
  duration_weeks?: unknown;
  block_name?: unknown;
  block_order?: unknown;
  week_number?: unknown;
  week_order?: unknown;
  session_name?: unknown;
  day_of_week?: unknown;
  session_order?: unknown;
  exercise_name?: unknown;
  exercise_order?: unknown;
  target_sets?: unknown;
  target_reps_min?: unknown;
  target_reps_max?: unknown;
  target_rpe?: unknown;
  target_rir?: unknown;
  rest_seconds?: unknown;
  notes?: unknown;
}

export interface RowFieldError {
  field: ExcelTemplateColumn;
  message: string;
}

// cuid con formato válido según el mismo regex de `ExerciseIdParamDto`/
// `CreateSessionExerciseDto.exerciseId`, usado ÚNICAMENTE como valor de
// relleno para poder validar el resto de los campos de
// `CreateSessionExerciseDto` (targetSets/targetRepsMin/.../notes) cuando el
// ejercicio referenciado por nombre todavía no se resolvió o no existe.
// Nunca se persiste ni se usa como id real — ver excel-imports.service.ts.
const PLACEHOLDER_VALID_ID = 'c' + '0'.repeat(24);

const NUMERIC_INVALID = Symbol('NUMERIC_INVALID');
type CoercedNumber = number | undefined | typeof NUMERIC_INVALID;

// exceljs nunca ejecuta fórmulas (lee el resultado ya calculado por Excel),
// pero expone las celdas de fórmula como `{ formula, result }` en vez de un
// valor primitivo — hay que leer `.result`, no el objeto entero. Fechas se
// tratan como "no numérico" para estos fines: ningún campo de la plantilla
// espera una fecha.
function extractCellValue(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    'result' in (value as Record<string, unknown>)
  ) {
    return (value as { result: unknown }).result;
  }
  return value;
}

function coerceExcelString(value: unknown): string | undefined {
  const extracted = extractCellValue(value);
  if (extracted === null || extracted === undefined) return undefined;
  if (extracted instanceof Date) return undefined;
  const str = String(extracted).trim();
  return str.length > 0 ? str : undefined;
}

function coerceExcelNumber(value: unknown): CoercedNumber {
  const extracted = extractCellValue(value);
  if (extracted === null || extracted === undefined) return undefined;
  if (typeof extracted === 'number') {
    return Number.isFinite(extracted) ? extracted : NUMERIC_INVALID;
  }
  if (typeof extracted === 'string') {
    const trimmed = extracted.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : NUMERIC_INVALID;
  }
  return NUMERIC_INVALID;
}

// Una fila se considera "vacía" (se omite en silencio, no cuenta como fila
// de datos ni genera error) solo si NINGUNA columna conocida tiene
// contenido — el caso típico de una fila en blanco al final de la hoja.
export function isBlankExcelRow(raw: RawExcelRowValues): boolean {
  return Object.values(raw).every((value) => {
    const extracted = extractCellValue(value);
    return (
      extracted === null ||
      extracted === undefined ||
      String(extracted).trim().length === 0
    );
  });
}

// Etiquetas de columna por propiedad del DTO, una tabla por DTO para poder
// traducir el `property` que devuelve `class-validator` (nombre del campo
// del modelo) al nombre de columna de la plantilla (lo que el coach
// reconoce en su archivo).
const PROGRAM_FIELD_COLUMNS: Record<string, ExcelTemplateColumn> = {
  name: 'program_name',
  description: 'program_description',
  durationWeeks: 'duration_weeks',
};
const BLOCK_FIELD_COLUMNS: Record<string, ExcelTemplateColumn> = {
  name: 'block_name',
  order: 'block_order',
};
const WEEK_FIELD_COLUMNS: Record<string, ExcelTemplateColumn> = {
  number: 'week_number',
  order: 'week_order',
};
const SESSION_FIELD_COLUMNS: Record<string, ExcelTemplateColumn> = {
  name: 'session_name',
  dayOfWeek: 'day_of_week',
  order: 'session_order',
};
const SESSION_EXERCISE_FIELD_COLUMNS: Record<string, ExcelTemplateColumn> = {
  order: 'exercise_order',
  targetSets: 'target_sets',
  targetRepsMin: 'target_reps_min',
  targetRepsMax: 'target_reps_max',
  targetRpe: 'target_rpe',
  targetRir: 'target_rir',
  restSeconds: 'rest_seconds',
  notes: 'notes',
  // `exerciseId` NUNCA se traduce a un error de columna acá: cuando el
  // ejercicio no existe/no se pudo resolver, el error correcto ya lo agrega
  // `resolveAndValidateExercise` sobre la columna `exercise_name`.
};

function mapDtoErrors(
  errors: ValidationError[],
  fieldColumns: Record<string, ExcelTemplateColumn>,
): RowFieldError[] {
  const mapped: RowFieldError[] = [];
  for (const error of errors) {
    const column = fieldColumns[error.property];
    if (!column) continue; // exerciseId u otro campo sin columna asociada.
    const messages = error.constraints ? Object.values(error.constraints) : [];
    for (const message of messages) {
      mapped.push({ field: column, message });
    }
  }
  return mapped;
}

// Valida un campo numérico de la fila: si el valor crudo no es numérico
// devuelve un error propio (nunca delegado al DTO, para dar un mensaje claro
// de "debe ser numérico" en vez del genérico de class-validator) y `undefined`
// para que el DTO no vuelva a quejarse del mismo campo por partida doble.
function resolveNumericField(
  raw: unknown,
  field: ExcelTemplateColumn,
  errors: RowFieldError[],
): number | undefined {
  const coerced = coerceExcelNumber(raw);
  if (coerced === NUMERIC_INVALID) {
    errors.push({ field, message: 'Debe ser un valor numérico.' });
    return undefined;
  }
  return coerced;
}

export interface ValidatedExcelRow {
  errors: RowFieldError[];
  // Valores ya tipados/coercionados, útiles para la vista previa aunque la
  // fila tenga errores (mostrar "lo que se entendió" ayuda a corregir).
  values: {
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
  };
}

// `resolvedExerciseId`: null cuando el ejercicio nombrado en la fila no fue
// encontrado en el catálogo del coach autenticado (o la fila no trae
// nombre) — en ese caso SIEMPRE se agrega un error sobre `exercise_name`
// (el llamador, `excel-imports.service.ts`, es quien resuelve el nombre
// contra la base de datos y decide qué pasar acá; esta función nunca toca
// Prisma, se mantiene pura y testeable igual que el resto del módulo).
export function validateExcelRow(
  raw: RawExcelRowValues,
  resolvedExerciseId: string | null,
): ValidatedExcelRow {
  const errors: RowFieldError[] = [];

  const programName = coerceExcelString(raw.program_name);
  const programDescription = coerceExcelString(raw.program_description);
  const durationWeeks = resolveNumericField(
    raw.duration_weeks,
    'duration_weeks',
    errors,
  );
  const blockName = coerceExcelString(raw.block_name);
  const blockOrder = resolveNumericField(
    raw.block_order,
    'block_order',
    errors,
  );
  const weekNumber = resolveNumericField(
    raw.week_number,
    'week_number',
    errors,
  );
  const weekOrder = resolveNumericField(raw.week_order, 'week_order', errors);
  const sessionName = coerceExcelString(raw.session_name);
  const dayOfWeek = resolveNumericField(raw.day_of_week, 'day_of_week', errors);
  const sessionOrder = resolveNumericField(
    raw.session_order,
    'session_order',
    errors,
  );
  const exerciseName = coerceExcelString(raw.exercise_name);
  const exerciseOrder = resolveNumericField(
    raw.exercise_order,
    'exercise_order',
    errors,
  );
  const targetSets = resolveNumericField(
    raw.target_sets,
    'target_sets',
    errors,
  );
  const targetRepsMin = resolveNumericField(
    raw.target_reps_min,
    'target_reps_min',
    errors,
  );
  const targetRepsMax = resolveNumericField(
    raw.target_reps_max,
    'target_reps_max',
    errors,
  );
  const targetRpe = resolveNumericField(raw.target_rpe, 'target_rpe', errors);
  const targetRir = resolveNumericField(raw.target_rir, 'target_rir', errors);
  const restSeconds = resolveNumericField(
    raw.rest_seconds,
    'rest_seconds',
    errors,
  );
  const notes = coerceExcelString(raw.notes);

  // --- Reuso directo de los DTOs de creación ya existentes ---
  const programDto = plainToInstance(CreateProgramDto, {
    name: programName,
    description: programDescription,
    durationWeeks,
  });
  errors.push(...mapDtoErrors(validateSync(programDto), PROGRAM_FIELD_COLUMNS));

  const blockDto = plainToInstance(CreateBlockDto, {
    name: blockName,
    order: blockOrder,
  });
  errors.push(...mapDtoErrors(validateSync(blockDto), BLOCK_FIELD_COLUMNS));

  const weekDto = plainToInstance(CreateWeekDto, {
    number: weekNumber,
    order: weekOrder,
  });
  errors.push(...mapDtoErrors(validateSync(weekDto), WEEK_FIELD_COLUMNS));

  const sessionDto = plainToInstance(CreateSessionDto, {
    name: sessionName,
    dayOfWeek,
    order: sessionOrder,
  });
  errors.push(...mapDtoErrors(validateSync(sessionDto), SESSION_FIELD_COLUMNS));

  if (!exerciseName) {
    errors.push({
      field: 'exercise_name',
      message: 'El nombre del ejercicio es obligatorio.',
    });
  } else if (!resolvedExerciseId) {
    errors.push({
      field: 'exercise_name',
      message:
        'No se encontró un ejercicio activo con ese nombre en tu catálogo.',
    });
  }

  const sessionExerciseDto = plainToInstance(CreateSessionExerciseDto, {
    exerciseId: resolvedExerciseId ?? PLACEHOLDER_VALID_ID,
    order: exerciseOrder,
    targetSets,
    targetRepsMin,
    targetRepsMax,
    targetRpe,
    targetRir,
    restSeconds,
    notes,
  });
  errors.push(
    ...mapDtoErrors(
      validateSync(sessionExerciseDto),
      SESSION_EXERCISE_FIELD_COLUMNS,
    ),
  );

  // Validación cruzada: mismo criterio y mismo mensaje que
  // `SessionExercisesService.ensureValidRepsRange()` (PROMPT 08) — un rango
  // fijo es min == max, un rango real requiere max >= min.
  if (
    targetRepsMin !== undefined &&
    targetRepsMax !== undefined &&
    targetRepsMax < targetRepsMin
  ) {
    errors.push({
      field: 'target_reps_max',
      message: 'targetRepsMax no puede ser menor que targetRepsMin',
    });
  }

  return {
    errors,
    values: {
      programName,
      programDescription,
      durationWeeks,
      blockName,
      blockOrder,
      weekNumber,
      weekOrder,
      sessionName,
      dayOfWeek,
      sessionOrder,
      exerciseName,
      exerciseOrder,
      targetSets,
      targetRepsMin,
      targetRepsMax,
      targetRpe,
      targetRir,
      restSeconds,
      notes,
    },
  };
}
