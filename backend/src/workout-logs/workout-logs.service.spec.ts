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
    },
    sessionExercise: { findMany: jest.fn() },
    setLog: { create: jest.fn() },
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
