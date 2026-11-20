import { fillDownHierarchy } from './excel-fill-down';

describe('fillDownHierarchy', () => {
  it('repite bloque, semana y día vacíos desde la fila de arriba', () => {
    const rows = fillDownHierarchy([
      {
        block_name: 'Base',
        week_number: 1,
        day_name: 'Día A',
        exercise_name: 'A',
      },
      { exercise_name: 'B' },
      { day_name: 'Día B', exercise_name: 'C' },
      { exercise_name: 'D' },
    ]);
    expect(rows.map((r) => [r.block_name, r.week_number, r.day_name])).toEqual([
      ['Base', 1, 'Día A'],
      ['Base', 1, 'Día A'],
      ['Base', 1, 'Día B'],
      ['Base', 1, 'Día B'],
    ]);
  });

  it('un bloque o semana nueva no hereda los niveles de abajo', () => {
    const rows = fillDownHierarchy([
      { block_name: 'Base', week_number: 1, day_name: 'Día A' },
      { block_name: 'Fuerza', exercise_name: 'B' },
      { block_name: 'Fuerza', week_number: 2, exercise_name: 'C' },
    ]);
    expect(rows[1].week_number).toBeUndefined();
    expect(rows[1].day_name).toBeUndefined();
    expect(rows[2].day_name).toBeUndefined();
  });

  it('la primera fila vacía queda vacía para que se reporte', () => {
    const [first] = fillDownHierarchy([{ exercise_name: 'A' }]);
    expect(first.block_name).toBeUndefined();
  });
});
