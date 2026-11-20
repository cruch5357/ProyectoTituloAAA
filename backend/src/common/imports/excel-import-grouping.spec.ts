import {
  buildImportPlan,
  PlanRowInput,
  summarizePlan,
} from './excel-import-grouping';

let n = 1;
function row(values: Partial<PlanRowInput['values']> = {}): PlanRowInput {
  n += 1;
  return {
    rowId: `row-${n}`,
    rowNumber: n,
    values: {
      blockName: 'Fuerza base',
      weekNumber: 1,
      dayName: 'Día A',
      exerciseId: 'squat',
      exerciseName: 'Sentadilla',
      sets: 3,
      reps: 8,
      weight: 60,
      rpe: 7,
      ...values,
    },
  };
}

beforeEach(() => {
  n = 1;
});

describe('buildImportPlan', () => {
  it('arma bloque -> semanas -> días -> ejercicios en el orden de las filas', () => {
    const { blocks, errors } = buildImportPlan([
      row(),
      row({ exerciseId: 'bench', exerciseName: 'Press banca' }),
      row({ dayName: 'Día B', exerciseId: 'row' }),
      row({ weekNumber: 2 }),
    ]);
    expect(errors).toEqual([]);
    expect(blocks).toHaveLength(1);
    const [week1, week2] = blocks[0].weeks;
    expect(week1.days.map((day) => day.name)).toEqual(['Día A', 'Día B']);
    expect(week1.days[0].exercises.map((e) => e.exerciseId)).toEqual([
      'squat',
      'bench',
    ]);
    expect(week1.days[0].exercises[0].sets).toEqual([
      { weight: 60, reps: 8, rpe: 7 },
      { weight: 60, reps: 8, rpe: 7 },
      { weight: 60, reps: 8, rpe: 7 },
    ]);
    expect(week2.number).toBe(2);
  });

  it('une filas seguidas del mismo ejercicio en un solo ejercicio (pirámide)', () => {
    const { blocks } = buildImportPlan([
      row({ sets: 1, reps: 10, weight: 50, notes: 'Pirámide' }),
      row({ sets: 1, reps: 8, weight: 55 }),
      row({ sets: 1, reps: 6, weight: 60 }),
    ]);
    const [exercise] = blocks[0].weeks[0].days[0].exercises;
    expect(exercise.sets.map((set) => set.weight)).toEqual([50, 55, 60]);
    expect(exercise.rowIds).toEqual(['row-2', 'row-3', 'row-4']);
    expect(exercise.notes).toBe('Pirámide');
  });

  it('el mismo ejercicio separado por otro queda como dos ejercicios', () => {
    const { blocks } = buildImportPlan([
      row(),
      row({ exerciseId: 'bench' }),
      row(),
    ]);
    expect(blocks[0].weeks[0].days[0].exercises).toHaveLength(3);
  });

  it('exige escribir el bloque exactamente igual e indica la fila original', () => {
    const { errors } = buildImportPlan([
      row({ blockName: 'Adaptación' }),
      row({ blockName: 'adaptacion' }),
    ]);
    expect(errors).toEqual([
      expect.objectContaining({
        rowNumber: 3,
        field: 'block_name',
        message: expect.stringContaining(
          'pero en la fila 2 se escribió "Adaptación"',
        ),
      }),
    ]);
    expect(errors[0].message).toContain('el Excel no se puede importar');
  });

  it('exige escribir el día exactamente igual dentro de la semana', () => {
    const { errors } = buildImportPlan([
      row({ dayName: 'Día A' }),
      row({ dayName: 'Dia A', exerciseId: 'bench' }),
    ]);
    expect(errors).toEqual([
      expect.objectContaining({ rowNumber: 3, field: 'day_name' }),
    ]);
  });

  it('reporta semanas salteadas en la primera fila de la semana siguiente', () => {
    const { errors } = buildImportPlan([
      row({ weekNumber: 1 }),
      row({ weekNumber: 2 }),
      row({ weekNumber: 4 }),
    ]);
    expect(errors).toEqual([
      expect.objectContaining({
        rowNumber: 4,
        field: 'week_number',
        message:
          'El bloque "Fuerza base" tiene las semanas 1, 2 y 4: falta la semana 3. Las semanas deben ir seguidas desde la 1.',
      }),
    ]);
  });

  it('no permite más de 7 días por semana', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ dayName: `Día ${i + 1}` }),
    );
    const { errors } = buildImportPlan(rows);
    expect(errors).toEqual([
      expect.objectContaining({ rowNumber: 9, field: 'day_name' }),
    ]);
  });

  it('separa bloques distintos y los resume', () => {
    const { blocks } = buildImportPlan([
      row({ blockName: 'Base' }),
      row({ blockName: 'Fuerza', sets: 5 }),
      row({ blockName: 'Base', dayName: 'Día B' }),
    ]);
    expect(summarizePlan(blocks)).toEqual([
      { name: 'Base', weeks: 1, days: 2, exercises: 2, sets: 6 },
      { name: 'Fuerza', weeks: 1, days: 1, exercises: 1, sets: 5 },
    ]);
  });
});
