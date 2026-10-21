import {
  plannedSets,
  trainingStatus,
  validatePerformed,
  exerciseInfo,
  ExerciseWithSets,
} from './training-state';
import { dateOnly, sessionDate } from '../common/training/calendar-date';

const exercise = {
  id: 'e1',
  targetSets: 4,
  programmedSets: [],
  targetRepsMin: 5,
  targetRepsMax: 5,
  targetRpe: 7,
} as unknown as ExerciseWithSets;
describe('Cumplimiento de bloques asignados', () => {
  it.each([
    [4, 0, 0, false, 'NOT_STARTED'],
    [4, 0, 4, true, 'SKIPPED'],
    [4, 3, 4, true, 'PARTIAL'],
    [4, 4, 4, true, 'COMPLETED'],
    [0, 0, 0, true, 'SKIPPED'],
  ] as const)(
    'clasifica %s/%s/%s/%s',
    (total, recorded, decided, finish, expected) =>
      expect(trainingStatus(total, recorded, decided, finish)).toBe(expected),
  );
  it('permite menos series y resultados distintos sin modificar lo prescrito', () => {
    expect(
      validatePerformed(
        [exercise],
        [
          {
            sessionExerciseId: 'e1',
            setNumber: 1,
            status: 'RECORDED',
            weight: 97.5,
            reps: 4,
            rpe: 8,
          },
        ],
      ),
    ).toBe(4);
    expect(plannedSets(exercise)[0]).toMatchObject({ reps: 5, rpe: 7 });
  });
  it('rechaza series adicionales, ajenas y duplicadas', () => {
    for (const [id, n] of [
      ['e1', 5],
      ['other', 1],
    ] as const)
      expect(() =>
        validatePerformed(
          [exercise],
          [{ sessionExerciseId: id, setNumber: n, status: 'RECORDED' }],
        ),
      ).toThrow();
    const set = {
      sessionExerciseId: 'e1',
      setNumber: 1,
      status: 'SKIPPED' as const,
    };
    expect(() => validatePerformed([exercise], [set, set])).toThrow();
  });
  it('conserva metadata congelada aunque cambie el catálogo', () => {
    const e = {
      ...exercise,
      frozenExercise: { name: 'Original', muscleGroups: ['quads'] },
      exercise: { name: 'Editado' },
    } as unknown as ExerciseWithSets;
    expect(exerciseInfo(e).name).toBe('Original');
  });
  it('proyecta posiciones 1 y 3 desde miércoles y atraviesa meses y semanas vacías', () => {
    const start = dateOnly('2026-10-28');
    expect(sessionDate(start, 0, 3)).toBe('2026-10-28');
    expect(sessionDate(start, 0, 5)).toBe('2026-10-30');
    expect(sessionDate(start, 2, 3)).toBe('2026-11-11');
  });
});
