import {
  buildWorkoutLogFilterWhere,
  computeExerciseEvolution,
  computeWorkoutSummaryMetrics,
  parseDateFrom,
  parseDateTo,
} from './workout-metrics';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkoutCompletionStatus } from '@prisma/client';

// Pruebas AISLADAS de las funciones puras de métricas (PROMPT 11, RF-25):
// no dependen de WorkoutLogsService ni de ningún controller, así que
// también sirven como la base que reutilizará el futuro dashboard del
// Coach (ver el comentario de cabecera de workout-metrics.ts).
type MockPrisma = {
  workoutLog: { aggregate: jest.Mock };
  setLog: { count: jest.Mock; findMany: jest.Mock };
};

function buildMockPrisma(): MockPrisma {
  return {
    workoutLog: { aggregate: jest.fn() },
    setLog: { count: jest.fn(), findMany: jest.fn() },
  };
}

describe('buildWorkoutLogFilterWhere', () => {
  it('no agrega ninguna clave cuando no hay filtros', () => {
    expect(buildWorkoutLogFilterWhere({})).toEqual({});
  });

  it('arma el rango de fechas solo con los extremos provistos', () => {
    const from = new Date('2026-01-01');
    expect(buildWorkoutLogFilterWhere({ dateFrom: from })).toEqual({
      performedAt: { gte: from },
    });
  });

  it('arma el filtro de programId a través de la cadena Session->Week->Block', () => {
    expect(buildWorkoutLogFilterWhere({ programId: 'program-1' })).toEqual({
      session: { week: { block: { programId: 'program-1' } } },
    });
  });

  it('combina completionStatus y sessionId', () => {
    expect(
      buildWorkoutLogFilterWhere({
        completionStatus: WorkoutCompletionStatus.SKIPPED,
        sessionId: 'session-1',
      }),
    ).toEqual({
      completionStatus: WorkoutCompletionStatus.SKIPPED,
      sessionId: 'session-1',
    });
  });
});

describe('parseDateFrom / parseDateTo', () => {
  it('parseDateFrom devuelve undefined si no se pasa valor', () => {
    expect(parseDateFrom(undefined)).toBeUndefined();
  });

  it('parseDateTo interpreta una fecha sin hora como el FIN de ese día', () => {
    const parsed = parseDateTo('2026-03-15');
    expect(parsed?.toISOString()).toContain('2026-03-15T23:59:59.999Z');
  });

  it('parseDateTo respeta la hora exacta cuando ya viene con hora', () => {
    const parsed = parseDateTo('2026-03-15T10:00:00.000Z');
    expect(parsed?.toISOString()).toBe('2026-03-15T10:00:00.000Z');
  });
});

describe('computeWorkoutSummaryMetrics', () => {
  it('evolución sin datos: no divide por cero, todo null/0 en vez de valores inventados', async () => {
    const prisma = buildMockPrisma();
    prisma.workoutLog.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _avg: { durationMinutes: null, overallRpe: null, fatigue: null },
      _min: { performedAt: null },
      _max: { performedAt: null },
    });
    prisma.setLog.count.mockResolvedValue(0);

    const result = await computeWorkoutSummaryMetrics(
      prisma as unknown as PrismaService,
      { studentId: 'student-1' },
    );

    expect(result.totalWorkouts).toBe(0);
    expect(result.trainingFrequencyPerWeek).toBeNull();
    expect(result.averageDurationMinutes).toBeNull();
  });

  it('con un único entrenamiento no calcula frecuencia (no hay rango real que promediar)', async () => {
    const prisma = buildMockPrisma();
    const onlyDate = new Date('2026-01-01');
    prisma.workoutLog.aggregate.mockResolvedValue({
      _count: { _all: 1 },
      _avg: { durationMinutes: 45, overallRpe: 8, fatigue: 5 },
      _min: { performedAt: onlyDate },
      _max: { performedAt: onlyDate },
    });
    prisma.setLog.count.mockResolvedValue(5);

    const result = await computeWorkoutSummaryMetrics(
      prisma as unknown as PrismaService,
      { studentId: 'student-1' },
    );

    expect(result.totalWorkouts).toBe(1);
    expect(result.trainingFrequencyPerWeek).toBeNull();
    expect(result.averageDurationMinutes).toBe(45);
  });

  it('evolución con datos: calcula la frecuencia semanal a partir del rango real de fechas', async () => {
    const prisma = buildMockPrisma();
    prisma.workoutLog.aggregate.mockResolvedValue({
      _count: { _all: 4 },
      _avg: { durationMinutes: 50, overallRpe: 7.5, fatigue: 6 },
      _min: { performedAt: new Date('2026-01-01T00:00:00.000Z') },
      _max: { performedAt: new Date('2026-01-15T00:00:00.000Z') },
    });
    prisma.setLog.count.mockResolvedValue(32);

    const result = await computeWorkoutSummaryMetrics(
      prisma as unknown as PrismaService,
      { studentId: 'student-1' },
    );

    // 4 entrenamientos repartidos en 2 semanas exactas = 2/semana.
    expect(result.trainingFrequencyPerWeek).toBeCloseTo(2, 5);
    expect(result.totalSetLogs).toBe(32);
  });

  it('cuenta las series (SetLog) sin excluir entrenamientos aún no finalizados', async () => {
    const prisma = buildMockPrisma();
    prisma.workoutLog.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _avg: { durationMinutes: null, overallRpe: null, fatigue: null },
      _min: { performedAt: null },
      _max: { performedAt: null },
    });
    prisma.setLog.count.mockResolvedValue(7);

    const result = await computeWorkoutSummaryMetrics(
      prisma as unknown as PrismaService,
      { studentId: 'student-1' },
    );

    // totalWorkouts cuenta solo entrenamientos FINALIZADOS (durationMinutes
    // != null), pero totalSetLogs cuenta toda serie real registrada, incluso
    // la de un entrenamiento todavía en curso.
    expect(result.totalWorkouts).toBe(0);
    expect(result.totalSetLogs).toBe(7);
    const aggregateCall = prisma.workoutLog.aggregate.mock.calls[0][0];
    expect(aggregateCall.where.durationMinutes).toEqual({ not: null });
    const setLogCountCall = prisma.setLog.count.mock.calls[0][0];
    expect(setLogCountCall.where.workoutLog.durationMinutes).toBeUndefined();
  });
});

describe('computeExerciseEvolution', () => {
  it('devuelve un arreglo vacío cuando el alumno nunca registró ese ejercicio', async () => {
    const prisma = buildMockPrisma();
    prisma.setLog.findMany.mockResolvedValue([]);

    const result = await computeExerciseEvolution(
      prisma as unknown as PrismaService,
      { studentId: 'student-1' },
      'exercise-1',
    );

    expect(result).toEqual([]);
  });

  it('agrupa las series por entrenamiento: carga máxima y reps totales por WorkoutLog', async () => {
    const prisma = buildMockPrisma();
    prisma.setLog.findMany.mockResolvedValue([
      {
        workoutLogId: 'wl-1',
        actualLoad: '60.00',
        actualReps: 10,
        workoutLog: { performedAt: new Date('2026-01-01') },
      },
      {
        workoutLogId: 'wl-1',
        actualLoad: '65.50',
        actualReps: 8,
        workoutLog: { performedAt: new Date('2026-01-01') },
      },
      {
        workoutLogId: 'wl-2',
        actualLoad: '70.00',
        actualReps: 6,
        workoutLog: { performedAt: new Date('2026-01-08') },
      },
    ]);

    const result = await computeExerciseEvolution(
      prisma as unknown as PrismaService,
      { studentId: 'student-1' },
      'exercise-1',
    );

    expect(result).toEqual([
      {
        workoutLogId: 'wl-1',
        performedAt: new Date('2026-01-01'),
        maxActualLoad: 65.5,
        totalActualReps: 18,
        setCount: 2,
      },
      {
        workoutLogId: 'wl-2',
        performedAt: new Date('2026-01-08'),
        maxActualLoad: 70,
        totalActualReps: 6,
        setCount: 1,
      },
    ]);
  });

  it('tolera series sin carga o sin repeticiones registradas (nulls reales, no inventados)', async () => {
    const prisma = buildMockPrisma();
    prisma.setLog.findMany.mockResolvedValue([
      {
        workoutLogId: 'wl-1',
        actualLoad: null,
        actualReps: null,
        workoutLog: { performedAt: new Date('2026-01-01') },
      },
    ]);

    const result = await computeExerciseEvolution(
      prisma as unknown as PrismaService,
      { studentId: 'student-1' },
      'exercise-1',
    );

    expect(result).toEqual([
      {
        workoutLogId: 'wl-1',
        performedAt: new Date('2026-01-01'),
        maxActualLoad: null,
        totalActualReps: null,
        setCount: 1,
      },
    ]);
  });
});
