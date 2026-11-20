import {
  isBlankExcelRow,
  RawExcelRowValues,
  validateExcelRow,
} from './excel-row-validation';

const FOUND = { found: true as const, id: 'ex-1', name: 'Sentadilla' };

function row(overrides: RawExcelRowValues = {}): RawExcelRowValues {
  return {
    block_name: 'Fuerza base',
    week_number: 1,
    day_name: 'Día A',
    exercise_name: 'sentadilla',
    sets: 3,
    reps: 8,
    weight: 60,
    rpe: 7,
    notes: 'Bajar lento',
    ...overrides,
  };
}

const fields = (raw: RawExcelRowValues, lookup = FOUND) =>
  validateExcelRow(raw, lookup).errors.map((error) => error.field);

describe('validateExcelRow', () => {
  it('acepta una fila completa y usa el nombre del catálogo', () => {
    const { errors, values } = validateExcelRow(row(), FOUND);
    expect(errors).toEqual([]);
    expect(values).toEqual({
      blockName: 'Fuerza base',
      weekNumber: 1,
      dayName: 'Día A',
      exerciseName: 'Sentadilla',
      exerciseId: 'ex-1',
      sets: 3,
      reps: 8,
      weight: 60,
      rpe: 7,
      notes: 'Bajar lento',
    });
  });

  it('solo exige bloque, semana, día y ejercicio; series vacías = 1', () => {
    const { errors, values } = validateExcelRow(
      row({ sets: null, reps: null, weight: null, rpe: null, notes: null }),
      FOUND,
    );
    expect(errors).toEqual([]);
    expect(values.sets).toBe(1);
    expect(values.weight).toBeUndefined();
  });

  it('pide cada dato obligatorio con un mensaje claro', () => {
    const { errors } = validateExcelRow({ sets: 3 }, null);
    expect(errors.map((error) => error.field)).toEqual([
      'block_name',
      'week_number',
      'day_name',
      'exercise_name',
    ]);
    expect(errors[0].message).toMatch(/nombre del bloque/);
  });

  it('entiende "Semana 2", "S3" y decimales con coma o con "kg"', () => {
    expect(
      validateExcelRow(row({ week_number: 'Semana 2' }), FOUND).values
        .weekNumber,
    ).toBe(2);
    expect(
      validateExcelRow(row({ week_number: 'S3' }), FOUND).values.weekNumber,
    ).toBe(3);
    const { values } = validateExcelRow(
      row({ weight: '62,5 kg', rpe: '7,5' }),
      FOUND,
    );
    expect(values.weight).toBe(62.5);
    expect(values.rpe).toBe(7.5);
  });

  it('rechaza semana, series, reps, carga y RPE fuera de rango', () => {
    expect(fields(row({ week_number: 0 }))).toEqual(['week_number']);
    expect(fields(row({ week_number: 'una' }))).toEqual(['week_number']);
    expect(fields(row({ sets: 0 }))).toEqual(['sets']);
    expect(fields(row({ sets: 2.5 }))).toEqual(['sets']);
    expect(fields(row({ reps: 'ocho' }))).toEqual(['reps']);
    expect(fields(row({ weight: -5 }))).toEqual(['weight']);
    expect(fields(row({ weight: 60.125 }))).toEqual(['weight']);
    expect(fields(row({ rpe: 11 }))).toEqual(['rpe']);
  });

  it('explica que las repeticiones van como un solo número', () => {
    const { errors } = validateExcelRow(row({ reps: '8-10' }), FOUND);
    expect(errors[0]).toMatchObject({ field: 'reps' });
    expect(errors[0].message).toContain('un solo número');
  });

  it('un ejercicio que no existe sugiere el nombre más parecido', () => {
    const { errors } = validateExcelRow(row({ exercise_name: 'Sentadila' }), {
      found: false,
      suggestion: 'Sentadilla',
    });
    expect(errors).toEqual([
      {
        field: 'exercise_name',
        message:
          '"Sentadila" no está en tu catálogo de ejercicios. ¿Quisiste decir "Sentadilla"?',
      },
    ]);
  });

  it('sin sugerencia, indica dónde ver los nombres exactos', () => {
    const { errors } = validateExcelRow(row({ exercise_name: 'Burpee' }), {
      found: false,
    });
    expect(errors[0].message).toContain('hoja "Mis ejercicios"');
  });

  it('lee el resultado de fórmulas y el texto con formato', () => {
    const { values, errors } = validateExcelRow(
      row({
        sets: { formula: '1+2', result: 3 },
        block_name: { richText: [{ text: 'Fuerza ' }, { text: 'base' }] },
      }),
      FOUND,
    );
    expect(errors).toEqual([]);
    expect(values.sets).toBe(3);
    expect(values.blockName).toBe('Fuerza base');
  });
});

describe('isBlankExcelRow', () => {
  it('omite filas sin valores', () => {
    expect(isBlankExcelRow({ block_name: '  ', sets: null })).toBe(true);
    expect(isBlankExcelRow({ notes: 'algo' })).toBe(false);
  });
});
