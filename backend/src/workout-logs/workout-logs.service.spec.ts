import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, WorkoutCompletionStatus } from '@prisma/client';
import { WorkoutLogsService } from './workout-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StudentTrainingService } from '../student-training/student-training.service';
import { AuditService } from '../audit/audit.service';

type MockPrisma = {
  workoutLog: Record<string, jest.Mock>;
  sessionExercise: Record<string, jest.Mock>;
  setLog: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function buildMockPrisma(): MockPrisma {
  return {
    workoutLog: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    sessionExercise: { findMany: jest.fn() },
    setLog: { create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    // WorkoutLogsService.addSetLogs usa la forma "arreglo de operaciones"
    // de $transaction (no la forma callback ya usada en Block/Week/Session):
    // el mock simplemente resuelve todas las promesas ya construidas.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function buildPrismaKnownError(
  code: string,
): Prisma.PrismaClientKnownRequestError {
  return Object.assign(
    Object.create(Prisma.PrismaClientKnownRequestError.prototype),
    { code, message: 'Unique constraint failed', clientVersion: 'test' },
  );
}

let prisma: MockPrisma;
let studentTrainingService: jest.Mocked<StudentTrainingService>;
let auditService: jest.Mocked<AuditService>;
let service: WorkoutLogsService;

const STUDENT_ID = 'student-123';
const OTHER_STUDENT_ID = 'student-999';
const SESSION_ID = 'session-1';
const WORKOUT_LOG_ID = 'workout-log-1';

function buildWorkoutLog(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORKOUT_LOG_ID,
    sessionId: SESSION_ID,
    studentId: STUDENT_ID,
    performedAt: new Date(),
    completionStatus: WorkoutCompletionStatus.PARTIAL,
    overallRpe: null,
    fatigue: null,
    comments: null,
    durationMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  prisma = buildMockPrisma();
  studentTrainingService = {
    findAssignedSessionOrThrow: jest.fn().mockResolvedValue({ id: SESSION_ID }),
  } as unknown as jest.Mocked<StudentTrainingService>;
  auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditService>;

  service = new WorkoutLogsService(
    prisma as unknown as PrismaService,
    studentTrainingService,
    auditService,
  );
});

describe('WorkoutLogsService.start', () => {
  it('inicia un WorkoutLog válido con completionStatus PARTIAL provisional', async () => {
    prisma.workoutLog.create.mockResolvedValue(buildWorkoutLog());

    const result = await service.start(STUDENT_ID, SESSION_ID);

    expect(
      studentTrainingService.findAssignedSessionOrThrow,
    ).toHaveBeenCalledWith(STUDENT_ID, SESSION_ID, { requireActive: true });
    expect(prisma.workoutLog.create).toHaveBeenCalledWith({
      data: {
        sessionId: SESSION_ID,
        studentId: STUDENT_ID,
        completionStatus: WorkoutCompletionStatus.PARTIAL,
      },
    });
    expect(result.completionStatus).toBe(WorkoutCompletionStatus.PARTIAL);
    expect(result.durationMinutes).toBeNull();
    expect(auditService.record).toHaveBeenCalled();
  });

  it('IDOR: impide iniciar una sesión no asignada al alumno (propaga el 404 de StudentTrainingService)', async () => {
    studentTrainingService.findAssignedSessionOrThrow.mockRejectedValue(
      new NotFoundException('Sesión no encontrada'),
    );

    await expect(service.start(STUDENT_ID, SESSION_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.workoutLog.create).not.toHaveBeenCalled();
  });

  it('IDOR: impide iniciar la sesión de otro alumno (el chequeo de asignación se hace siempre con el studentId del token)', async () => {
    studentTrainingService.findAssignedSessionOrThrow.mockRejectedValue(
      new NotFoundException('Sesión no encontrada'),
    );

    await expect(service.start(OTHER_STUDENT_ID, SESSION_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(
      studentTrainingService.findAssignedSessionOrThrow,
    ).toHaveBeenCalledWith(OTHER_STUDENT_ID, SESSION_ID, {
      requireActive: true,
    });
  });
});

describe('WorkoutLogsService.listForSession', () => {
  it('lista únicamente los WorkoutLog propios de esa sesión', async () => {
    prisma.workoutLog.findMany.mockResolvedValue([buildWorkoutLog()]);

    await service.listForSession(STUDENT_ID, SESSION_ID);

    expect(prisma.workoutLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: SESSION_ID, studentId: STUDENT_ID },
      }),
    );
  });
});

describe('WorkoutLogsService.getOwnedByStudent', () => {
  it('consulta el WorkoutLog propio con sus SetLog embebidos', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue({
      ...buildWorkoutLog(),
      setLogs: [],
    });

    const result = await service.getOwnedByStudent(STUDENT_ID, WORKOUT_LOG_ID);

    expect(result.id).toBe(WORKOUT_LOG_ID);
    expect(result.setLogs).toEqual([]);
  });

  it('IDOR: responde 404 ante un WorkoutLog ajeno', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue({
      ...buildWorkoutLog({ studentId: OTHER_STUDENT_ID }),
      setLogs: [],
    });

    await expect(
      service.getOwnedByStudent(STUDENT_ID, WORKOUT_LOG_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('responde 404 si el WorkoutLog no existe', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue(null);

    await expect(
      service.getOwnedByStudent(STUDENT_ID, WORKOUT_LOG_ID),
    ).rejects.toThrow(NotFoundException);
  });

  // PROMPT 11 (RF-25): el detalle ahora embebe sesión/semana/bloque/programa
  // vigentes, sin tocar la lógica de propiedad ya probada arriba.
  it('incluye el contexto de sesión/programa vigente cuando está disponible', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue({
      ...buildWorkoutLog(),
      setLogs: [],
      session: {
        id: SESSION_ID,
        name: 'Sesión A',
        week: {
          id: 'week-1',
          number: 1,
          block: {
            id: 'block-1',
            name: 'Bloque 1',
            program: { id: 'program-1', name: 'Fuerza General' },
          },
        },
      },
    });

    const result = await service.getOwnedByStudent(STUDENT_ID, WORKOUT_LOG_ID);

    expect(result.session).toEqual({
      id: SESSION_ID,
      name: 'Sesión A',
      week: {
        id: 'week-1',
        number: 1,
        block: {
          id: 'block-1',
          name: 'Bloque 1',
          program: { id: 'program-1', name: 'Fuerza General' },
        },
      },
    });
  });
});

describe('WorkoutLogsService.addSetLogs', () => {
  function baseDto() {
    return {
      setLogs: [
        {
          sessionExerciseId: 'session-exercise-1',
          setNumber: 1,
          actualReps: 10,
          actualLoad: 60,
          actualRpe: 8,
          actualRir: 2,
        },
      ],
    };
  }

  it('crea una o más series válidas dentro de una transacción', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue(buildWorkoutLog());
    prisma.sessionExercise.findMany.mockResolvedValue([
      { id: 'session-exercise-1' },
    ]);
    prisma.setLog.create.mockResolvedValue({
      id: 'set-log-1',
      workoutLogId: WORKOUT_LOG_ID,
      sessionExerciseId: 'session-exercise-1',
      setNumber: 1,
      actualReps: 10,
      actualLoad: 60,
      actualRpe: 8,
      actualRir: 2,
      comments: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.addSetLogs(
      STUDENT_ID,
      WORKOUT_LOG_ID,
      baseDto(),
    );

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('IDOR: responde 404 ante un WorkoutLog ajeno', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue(
      buildWorkoutLog({ studentId: OTHER_STUDENT_ID }),
    );

    await expect(
      service.addSetLogs(STUDENT_ID, WORKOUT_LOG_ID, baseDto()),
    ).rejects.toThrow(NotFoundException);
  });

  it('valida que el sessionExerciseId pertenezca a la misma sesión del WorkoutLog', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue(buildWorkoutLog());
    // La sesión no tiene ese ejercicio prescrito (pertenece a otra sesión).
    prisma.sessionExercise.findMany.mockResolvedValue([]);

    await expect(
      service.addSetLogs(STUDENT_ID, WORKOUT_LOG_ID, baseDto()),
    ).rejects.toThrow(NotFoundException);
  });

  it('impide registrar series en un entrenamiento ya finalizado (durationMinutes no nulo)', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue(
      buildWorkoutLog({ durationMinutes: 45 }),
    );

    await expect(
      service.addSetLogs(STUDENT_ID, WORKOUT_LOG_ID, baseDto()),
    ).rejects.toThrow(ConflictException);
    expect(prisma.sessionExercise.findMany).not.toHaveBeenCalled();
  });

  it('traduce una violación de unicidad (P2002) a 409', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue(buildWorkoutLog());
    prisma.sessionExercise.findMany.mockResolvedValue([
      { id: 'session-exercise-1' },
    ]);
    prisma.$transaction.mockRejectedValue(buildPrismaKnownError('P2002'));

    await expect(
      service.addSetLogs(STUDENT_ID, WORKOUT_LOG_ID, baseDto()),
    ).rejects.toThrow(ConflictException);
  });
});

describe('WorkoutLogsService.finish', () => {
  function finishDto(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      completionStatus: WorkoutCompletionStatus.COMPLETED,
      durationMinutes: 50,
      overallRpe: 7,
      fatigue: 6,
      comments: 'Buena sesión',
      ...overrides,
    };
  }

  it('finaliza un entrenamiento propio dentro de la ventana de edición', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue(buildWorkoutLog());
    prisma.workoutLog.update.mockResolvedValue(
      buildWorkoutLog({
        completionStatus: WorkoutCompletionStatus.COMPLETED,
        durationMinutes: 50,
      }),
    );

    const result = await service.finish(
      STUDENT_ID,
      WORKOUT_LOG_ID,
      finishDto(),
    );

    expect(result.completionStatus).toBe(WorkoutCompletionStatus.COMPLETED);
    expect(result.durationMinutes).toBe(50);
    expect(auditService.record).toHaveBeenCalled();
  });

  it('IDOR: responde 404 ante un WorkoutLog ajeno', async () => {
    prisma.workoutLog.findUnique.mockResolvedValue(
      buildWorkoutLog({ studentId: OTHER_STUDENT_ID }),
    );

    await expect(
      service.finish(STUDENT_ID, WORKOUT_LOG_ID, finishDto()),
    ).rejects.toThrow(NotFoundException);
  });

  it('impide finalizar fuera de la ventana de 24 horas (RF-24)', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    prisma.workoutLog.findUnique.mockResolvedValue(
      buildWorkoutLog({ createdAt: oldDate }),
    );

    await expect(
      service.finish(STUDENT_ID, WORKOUT_LOG_ID, finishDto()),
    ).rejects.toThrow(
      'La ventana de 24 horas para editar este registro ya expiró',
    );
    expect(prisma.workoutLog.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PROMPT 11 (RF-25) — Historial y evolución básica. Reutiliza exactamente
// los mismos STUDENT_ID/OTHER_STUDENT_ID/buildWorkoutLog() ya definidos
// arriba; no se elimina ni se reescribe ningún test de PROMPT 10.
// ---------------------------------------------------------------------------

function buildDefaultHistoryQuery(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return { page: 1, limit: 20, ...overrides };
}

describe('WorkoutLogsService.listHistory', () => {
  it('devuelve el historial propio paginado, ordenado por fecha descendente', async () => {
    prisma.workoutLog.findMany.mockResolvedValue([buildWorkoutLog()]);
    prisma.workoutLog.count.mockResolvedValue(1);

    const result = await service.listHistory(
      STUDENT_ID,
      buildDefaultHistoryQuery(),
    );

    expect(prisma.workoutLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: STUDENT_ID },
        orderBy: { performedAt: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ page: 1, limit: 20, total: 1, totalPages: 1 }),
    );
    expect(result.items).toHaveLength(1);
  });

  it('aplica la paginación (page/limit) en skip/take', async () => {
    prisma.workoutLog.findMany.mockResolvedValue([]);
    prisma.workoutLog.count.mockResolvedValue(45);

    const result = await service.listHistory(
      STUDENT_ID,
      buildDefaultHistoryQuery({ page: 3, limit: 10 }),
    );

    expect(prisma.workoutLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(result.totalPages).toBe(5);
  });

  it('filtra por rango de fechas (dateFrom/dateTo)', async () => {
    prisma.workoutLog.findMany.mockResolvedValue([]);
    prisma.workoutLog.count.mockResolvedValue(0);

    await service.listHistory(
      STUDENT_ID,
      buildDefaultHistoryQuery({
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      }),
    );

    const call = prisma.workoutLog.findMany.mock.calls[0][0];
    expect(call.where.studentId).toBe(STUDENT_ID);
    expect(call.where.performedAt.gte.toISOString()).toContain('2026-01-01');
    // dateTo sin hora se interpreta como el FIN del día (ver
    // common/training/workout-metrics.ts, parseDateTo).
    expect(call.where.performedAt.lte.toISOString()).toContain('23:59:59');
  });

  it('filtra por completionStatus y programId', async () => {
    prisma.workoutLog.findMany.mockResolvedValue([]);
    prisma.workoutLog.count.mockResolvedValue(0);

    await service.listHistory(
      STUDENT_ID,
      buildDefaultHistoryQuery({
        completionStatus: WorkoutCompletionStatus.COMPLETED,
        programId: 'program-1',
      }),
    );

    const call = prisma.workoutLog.findMany.mock.calls[0][0];
    expect(call.where.completionStatus).toBe(WorkoutCompletionStatus.COMPLETED);
    expect(call.where.session).toEqual({
      week: { block: { programId: 'program-1' } },
    });
  });

  it('IDOR: el studentId del where siempre es el del alumno autenticado, sin importar los filtros de programId/sessionId recibidos', async () => {
    prisma.workoutLog.findMany.mockResolvedValue([]);
    prisma.workoutLog.count.mockResolvedValue(0);

    await service.listHistory(
      OTHER_STUDENT_ID,
      buildDefaultHistoryQuery({
        programId: 'program-de-otro-alumno',
        sessionId: 'session-de-otro-alumno',
      }),
    );

    const call = prisma.workoutLog.findMany.mock.calls[0][0];
    expect(call.where.studentId).toBe(OTHER_STUDENT_ID);
  });
});

describe('WorkoutLogsService.getEvolution', () => {
  it('evolución con datos: calcula promedios y frecuencia a partir de entrenamientos finalizados', async () => {
    const first = new Date('2026-01-01T00:00:00.000Z');
    const last = new Date('2026-01-15T00:00:00.000Z'); // 2 semanas después
    prisma.workoutLog.aggregate.mockResolvedValue({
      _count: { _all: 4 },
      _avg: { durationMinutes: 50, overallRpe: 7.5, fatigue: 6 },
      _min: { performedAt: first },
      _max: { performedAt: last },
    });
    prisma.setLog.count.mockResolvedValue(32);

    const result = await service.getEvolution(STUDENT_ID, {});

    expect(result.summary.totalWorkouts).toBe(4);
    expect(result.summary.totalSetLogs).toBe(32);
    expect(result.summary.averageDurationMinutes).toBe(50);
    expect(result.summary.averageOverallRpe).toBe(7.5);
    expect(result.summary.averageFatigue).toBe(6);
    // 4 entrenamientos en 2 semanas = 2 por semana.
    expect(result.summary.trainingFrequencyPerWeek).toBeCloseTo(2, 5);
    expect(result.exerciseEvolution).toBeNull();
  });

  it('evolución sin datos: no divide por cero ni inventa valores, todo queda en null/0', async () => {
    prisma.workoutLog.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _avg: { durationMinutes: null, overallRpe: null, fatigue: null },
      _min: { performedAt: null },
      _max: { performedAt: null },
    });
    prisma.setLog.count.mockResolvedValue(0);

    const result = await service.getEvolution(STUDENT_ID, {});

    expect(result.summary).toEqual({
      totalWorkouts: 0,
      totalSetLogs: 0,
      averageDurationMinutes: null,
      averageOverallRpe: null,
      averageFatigue: null,
      trainingFrequencyPerWeek: null,
      firstWorkoutAt: null,
      lastWorkoutAt: null,
    });
  });

  it('incluye la evolución de un ejercicio solo cuando se pide exerciseId', async () => {
    prisma.workoutLog.aggregate.mockResolvedValue({
      _count: { _all: 1 },
      _avg: { durationMinutes: 40, overallRpe: null, fatigue: null },
      _min: { performedAt: new Date() },
      _max: { performedAt: new Date() },
    });
    prisma.setLog.count.mockResolvedValue(3);
    prisma.setLog.findMany.mockResolvedValue([
      {
        workoutLogId: 'wl-1',
        actualLoad: '60.00',
        actualReps: 10,
        workoutLog: { performedAt: new Date('2026-01-01') },
      },
      {
        workoutLogId: 'wl-1',
        actualLoad: '65.00',
        actualReps: 8,
        workoutLog: { performedAt: new Date('2026-01-01') },
      },
    ]);

    const result = await service.getEvolution(STUDENT_ID, {
      exerciseId: 'exercise-1',
    });

    expect(prisma.setLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionExercise: { exerciseId: 'exercise-1' },
        }),
      }),
    );
    expect(result.exerciseEvolution).toEqual([
      {
        workoutLogId: 'wl-1',
        performedAt: new Date('2026-01-01'),
        maxActualLoad: 65,
        totalActualReps: 18,
        setCount: 2,
      },
    ]);
  });

  it('IDOR: el where siempre fija studentId desde el alumno autenticado', async () => {
    prisma.workoutLog.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _avg: { durationMinutes: null, overallRpe: null, fatigue: null },
      _min: { performedAt: null },
      _max: { performedAt: null },
    });
    prisma.setLog.count.mockResolvedValue(0);

    await service.getEvolution(OTHER_STUDENT_ID, {
      programId: 'program-de-otro-alumno',
    });

    const call = prisma.workoutLog.aggregate.mock.calls[0][0];
    expect(call.where.studentId).toBe(OTHER_STUDENT_ID);
  });
});
