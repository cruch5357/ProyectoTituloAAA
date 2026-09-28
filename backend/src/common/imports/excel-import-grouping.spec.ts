import {
  buildImportPlan,
  countImportPlanEntities,
  NormalizedRowInput,
} from './excel-import-grouping';

function buildRow(overrides: Partial<NormalizedRowInput> = {}): NormalizedRowInput {
  return {
    rowId: overrides.rowId ?? `row-${Math.random()}`,
    rowNumber: overrides.rowNumber ?? 2,
    exerciseId: overrides.exerciseId ?? 'exercise-1',
    values: {
      programName: 'Hipertrofia 8 semanas',
      blockName: 'Bloque 1',
      blockOrder: 1,
      weekNumber: 1,
      weekOrder: 1,
      sessionName: 'Sesión A',
      sessionOrder: 1,
      exerciseOrder: 1,
      targetSets: 4,
      ...overrides.values,
    },
  };
}

describe('buildImportPlan', () => {
  it('agrupa varias filas de la misma sesión en un único Program/Block/Week/Session', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, exerciseId: 'ex-1', values: { exerciseOrder: 1 } as never }),
      buildRow({ rowId: 'r2', rowNumber: 3, exerciseId: 'ex-2', values: { exerciseOrder: 2 } as never }),
    ];

    const result = buildImportPlan(rows);

    expect('plan' in result && result.plan).toBeTruthy();
    if (!('plan' in result) || !result.plan) throw new Error('expected plan');
    expect(result.plan).toHaveLength(1);
    expect(result.plan[0].blocks).toHaveLength(1);
    expect(result.plan[0].blocks[0].weeks).toHaveLength(1);
    expect(result.plan[0].blocks[0].weeks[0].sessions).toHaveLength(1);
    expect(result.plan[0].blocks[0].weeks[0].sessions[0].exercises).toHaveLength(2);
  });

  it('nunca crea un Program nuevo por cada fila cuando comparten program_name', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2 }),
      buildRow({ rowId: 'r2', rowNumber: 3, values: { blockOrder: 2 } as never }),
    ];
    const result = buildImportPlan(rows);
    if (!('plan' in result) || !result.plan) throw new Error('expected plan');
    expect(result.plan).toHaveLength(1);
    expect(result.plan[0].blocks).toHaveLength(2);
  });

  it('nunca crea una Session nueva por cada ejercicio cuando pertenecen a la misma sesión', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, values: { exerciseOrder: 1 } as never }),
      buildRow({ rowId: 'r2', rowNumber: 3, values: { exerciseOrder: 2 } as never }),
      buildRow({ rowId: 'r3', rowNumber: 4, values: { exerciseOrder: 3 } as never }),
    ];
    const result = buildImportPlan(rows);
    if (!('plan' in result) || !result.plan) throw new Error('expected plan');
    expect(result.plan[0].blocks[0].weeks[0].sessions).toHaveLength(1);
    expect(result.plan[0].blocks[0].weeks[0].sessions[0].exercises).toHaveLength(3);
  });

  it('agrupa múltiples programas distintos por program_name', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, values: { programName: 'Programa A' } as never }),
      buildRow({ rowId: 'r2', rowNumber: 3, exerciseId: 'ex-2', values: { programName: 'Programa B', exerciseOrder: 1 } as never }),
    ];
    const result = buildImportPlan(rows);
    if (!('plan' in result) || !result.plan) throw new Error('expected plan');
    expect(result.plan).toHaveLength(2);
    expect(result.plan.map((p) => p.name).sort()).toEqual(['Programa A', 'Programa B']);
  });

  it('respeta block_order/week_order/session_order/exercise_order explícitos', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, values: { blockOrder: 5, weekOrder: 3, sessionOrder: 2, exerciseOrder: 7 } as never }),
    ];
    const result = buildImportPlan(rows);
    if (!('plan' in result) || !result.plan) throw new Error('expected plan');
    expect(result.plan[0].blocks[0].order).toBe(5);
    expect(result.plan[0].blocks[0].weeks[0].order).toBe(3);
    expect(result.plan[0].blocks[0].weeks[0].sessions[0].order).toBe(2);
    expect(result.plan[0].blocks[0].weeks[0].sessions[0].exercises[0].order).toBe(7);
  });

  it('ignora en silencio program_description/duration_weeks distintos entre filas del mismo programa (no son identidad)', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, values: { programDescription: 'Primera', durationWeeks: 8 } as never }),
      buildRow({ rowId: 'r2', rowNumber: 3, values: { blockOrder: 2, programDescription: 'Otra descripción', durationWeeks: 12 } as never }),
    ];
    const result = buildImportPlan(rows);
    if (!('plan' in result) || !result.plan) throw new Error('expected plan');
    expect(result.plan[0].description).toBe('Primera');
    expect(result.plan[0].durationWeeks).toBe(8);
  });

  it('reporta un conflicto cuando dos filas usan el mismo block_order con block_name distinto', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, values: { blockName: 'Bloque 1' } as never }),
      buildRow({ rowId: 'r2', rowNumber: 3, exerciseId: 'ex-2', values: { blockName: 'Bloque Distinto', exerciseOrder: 2 } as never }),
    ];
    const result = buildImportPlan(rows);
    expect('conflicts' in result && result.conflicts).toBeTruthy();
    if (!('conflicts' in result) || !result.conflicts) throw new Error('expected conflicts');
    expect(result.conflicts[0].code).toBe('BLOCK_IDENTITY_CONFLICT');
  });

  it('reporta un conflicto cuando dos filas usan el mismo week_order con week_number distinto', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, values: { weekNumber: 1 } as never }),
      buildRow({ rowId: 'r2', rowNumber: 3, exerciseId: 'ex-2', values: { weekNumber: 2, exerciseOrder: 2 } as never }),
    ];
    const result = buildImportPlan(rows);
    if (!('conflicts' in result) || !result.conflicts) throw new Error('expected conflicts');
    expect(result.conflicts[0].code).toBe('WEEK_IDENTITY_CONFLICT');
  });

  it('reporta un conflicto cuando dos filas usan el mismo session_order con session_name/day_of_week distinto', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, values: { sessionName: 'Sesión A', dayOfWeek: 1 } as never }),
      buildRow({ rowId: 'r2', rowNumber: 3, exerciseId: 'ex-2', values: { sessionName: 'Sesión Distinta', dayOfWeek: 1, exerciseOrder: 2 } as never }),
    ];
    const result = buildImportPlan(rows);
    if (!('conflicts' in result) || !result.conflicts) throw new Error('expected conflicts');
    expect(result.conflicts[0].code).toBe('SESSION_IDENTITY_CONFLICT');
  });

  it('reporta un conflicto cuando dos filas de la misma sesión repiten exercise_order', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, values: { exerciseOrder: 1 } as never }),
      buildRow({ rowId: 'r2', rowNumber: 3, exerciseId: 'ex-2', values: { exerciseOrder: 1 } as never }),
    ];
    const result = buildImportPlan(rows);
    if (!('conflicts' in result) || !result.conflicts) throw new Error('expected conflicts');
    expect(result.conflicts[0].code).toBe('SESSION_EXERCISE_ORDER_CONFLICT');
  });

  it('acumula varios conflictos distintos en una sola pasada', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, values: { blockName: 'Bloque 1' } as never }),
      buildRow({ rowId: 'r2', rowNumber: 3, exerciseId: 'ex-2', values: { blockName: 'Otro', exerciseOrder: 2 } as never }),
      buildRow({ rowId: 'r3', rowNumber: 4, exerciseId: 'ex-3', values: { exerciseOrder: 1 } as never }),
    ];
    const result = buildImportPlan(rows);
    if (!('conflicts' in result) || !result.conflicts) throw new Error('expected conflicts');
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('countImportPlanEntities', () => {
  it('cuenta correctamente programas/bloques/semanas/sesiones/ejercicios del plan', () => {
    const rows = [
      buildRow({ rowId: 'r1', rowNumber: 2, exerciseId: 'ex-1', values: { exerciseOrder: 1 } as never }),
      buildRow({ rowId: 'r2', rowNumber: 3, exerciseId: 'ex-2', values: { exerciseOrder: 2 } as never }),
    ];
    const result = buildImportPlan(rows);
    if (!('plan' in result) || !result.plan) throw new Error('expected plan');
    const counts = countImportPlanEntities(result.plan);
    expect(counts).toEqual({
      programsCreated: 1,
      blocksCreated: 1,
      weeksCreated: 1,
      sessionsCreated: 1,
      sessionExercisesCreated: 2,
    });
  });
});
