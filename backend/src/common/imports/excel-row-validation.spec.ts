import 'reflect-metadata';
import {
  isBlankExcelRow,
  RawExcelRowValues,
  validateExcelRow,
} from './excel-row-validation';

const VALID_EXERCISE_ID = 'cabcdefghijklmnopqrstuvwx';

function buildValidRow(
  overrides: Partial<RawExcelRowValues> = {},
): RawExcelRowValues {
  return {
    program_name: 'Hipertrofia 8 semanas',
    program_description: 'Programa base',
    duration_weeks: 8,
    block_name: 'Bloque 1',
    block_order: 1,
    week_number: 1,
    week_order: 1,
    session_name: 'Sesión A',
    day_of_week: 1,
    session_order: 1,
    exercise_name: 'Sentadilla',
    exercise_order: 1,
    target_sets: 4,
    target_reps_min: 8,
    target_reps_max: 12,
    target_rpe: 8,
    target_rir: 2,
    rest_seconds: 90,
    notes: 'Tempo controlado',
    ...overrides,
  };
}

describe('isBlankExcelRow', () => {
  it('considera vacía una fila sin ningún valor', () => {
    expect(isBlankExcelRow({})).toBe(true);
    expect(
      isBlankExcelRow({
        program_name: null,
        block_order: undefined,
        notes: '  ',
      }),
    ).toBe(true);
  });

  it('no considera vacía una fila con al menos un valor', () => {
    expect(isBlankExcelRow({ program_name: 'Algo' })).toBe(false);
  });
});

describe('validateExcelRow', () => {
  it('no reporta errores para una fila completamente válida con ejercicio resuelto', () => {
    const { errors } = validateExcelRow(buildValidRow(), VALID_EXERCISE_ID);
    expect(errors).toEqual([]);
  });

  it('reporta tipos incorrectos en campos numéricos', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ target_sets: 'cuatro' }),
      VALID_EXERCISE_ID,
    );
    expect(errors).toContainEqual({
      field: 'target_sets',
      message: 'Debe ser un valor numérico.',
    });
  });

  it('reporta RPE fuera de rango (0-10)', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ target_rpe: 15 }),
      VALID_EXERCISE_ID,
    );
    expect(errors.some((error) => error.field === 'target_rpe')).toBe(true);
  });

  it('reporta RIR inválido (negativo)', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ target_rir: -1 }),
      VALID_EXERCISE_ID,
    );
    expect(errors.some((error) => error.field === 'target_rir')).toBe(true);
  });

  it('reporta repeticiones inválidas (negativas)', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ target_reps_min: -5 }),
      VALID_EXERCISE_ID,
    );
    expect(errors.some((error) => error.field === 'target_reps_min')).toBe(
      true,
    );
  });

  it('reporta series inválidas (cero o negativas)', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ target_sets: 0 }),
      VALID_EXERCISE_ID,
    );
    expect(errors.some((error) => error.field === 'target_sets')).toBe(true);
  });

  it('reporta targetRepsMax menor que targetRepsMin', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ target_reps_min: 12, target_reps_max: 8 }),
      VALID_EXERCISE_ID,
    );
    expect(errors).toContainEqual({
      field: 'target_reps_max',
      message: 'targetRepsMax no puede ser menor que targetRepsMin',
    });
  });

  it('reporta día de la semana fuera de rango (1-7)', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ day_of_week: 9 }),
      VALID_EXERCISE_ID,
    );
    expect(errors.some((error) => error.field === 'day_of_week')).toBe(true);
  });

  it('reporta descanso en segundos inválido (negativo)', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ rest_seconds: -1 }),
      VALID_EXERCISE_ID,
    );
    expect(errors.some((error) => error.field === 'rest_seconds')).toBe(true);
  });

  it('reporta columnas mandatorias faltantes (program_name vacío)', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ program_name: undefined }),
      VALID_EXERCISE_ID,
    );
    expect(errors.some((error) => error.field === 'program_name')).toBe(true);
  });

  it('reporta un ejercicio no encontrado en el catálogo sin inventar ni crear nada', () => {
    const { errors } = validateExcelRow(buildValidRow(), null);
    expect(errors).toContainEqual({
      field: 'exercise_name',
      message:
        'No se encontró un ejercicio activo con ese nombre en tu catálogo.',
    });
  });

  it('reporta exercise_name obligatorio cuando la celda está vacía', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ exercise_name: undefined }),
      null,
    );
    expect(errors).toContainEqual({
      field: 'exercise_name',
      message: 'El nombre del ejercicio es obligatorio.',
    });
  });

  it('acepta un rango fijo de repeticiones (min == max)', () => {
    const { errors } = validateExcelRow(
      buildValidRow({ target_reps_min: 10, target_reps_max: 10 }),
      VALID_EXERCISE_ID,
    );
    expect(errors.some((error) => error.field === 'target_reps_max')).toBe(
      false,
    );
  });

  it('acepta filas sin valores de prescripción opcionales', () => {
    const { errors } = validateExcelRow(
      buildValidRow({
        target_sets: undefined,
        target_reps_min: undefined,
        target_reps_max: undefined,
        target_rpe: undefined,
        target_rir: undefined,
        rest_seconds: undefined,
        notes: undefined,
      }),
      VALID_EXERCISE_ID,
    );
    expect(errors).toEqual([]);
  });

  it('lee el resultado cacheado de una celda de fórmula, nunca la evalúa', () => {
    const { errors, values } = validateExcelRow(
      buildValidRow({ target_sets: { formula: 'A1+A2', result: 4 } as never }),
      VALID_EXERCISE_ID,
    );
    expect(values.targetSets).toBe(4);
    expect(errors.some((error) => error.field === 'target_sets')).toBe(false);
  });
});
