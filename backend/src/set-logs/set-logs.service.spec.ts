import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SetLogsService } from './set-logs.service';
import { PrismaService } from '../prisma/prisma.service';

type MockPrisma = {
  setLog: Record<string, jest.Mock>;
};

function buildMockPrisma(): MockPrisma {
  return {
    setLog: { findUnique: jest.fn(), update: jest.fn() },
  };
}

let prisma: MockPrisma;
let service: SetLogsService;

const STUDENT_ID = 'student-123';
const OTHER_STUDENT_ID = 'student-999';
const SET_LOG_ID = 'set-log-1';

function buildSetLogWithWorkoutLog(
  overrides: Partial<Record<string, unknown>> = {},
  workoutLogOverrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: SET_LOG_ID,
    workoutLogId: 'workout-log-1',
    sessionExerciseId: 'session-exercise-1',
    setNumber: 1,
    actualReps: 10,
    actualLoad: 60,
    actualRpe: 8,
    actualRir: 2,
    comments: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    sessionExercise: {
      id: 'session-exercise-1',
      order: 1,
      targetSets: 4,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetRpe: null,
      targetRir: null,
      exercise: {
        id: 'exercise-1',
        name: 'Sentadilla',
        muscleGroup: 'Piernas',
        isActive: true,
      },
    },
    workoutLog: {
      studentId: STUDENT_ID,
      createdAt: new Date(),
      ...workoutLogOverrides,
    },
    ...overrides,
  };
}

beforeEach(() => {
  prisma = buildMockPrisma();
  service = new SetLogsService(prisma as unknown as PrismaService);
});

describe('SetLogsService.update', () => {
  it('edita una serie propia dentro de la ventana de 24 horas', async () => {
    prisma.setLog.findUnique.mockResolvedValue(buildSetLogWithWorkoutLog());
    prisma.setLog.update.mockResolvedValue(
      buildSetLogWithWorkoutLog({ actualReps: 12 }),
    );

    const result = await service.update(STUDENT_ID, SET_LOG_ID, {
      actualReps: 12,
    });

    expect(prisma.setLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SET_LOG_ID },
        data: { actualReps: 12 },
      }),
    );
    expect(result.actualReps).toBe(12);
  });

  it('IDOR: responde 404 ante un SetLog ajeno (WorkoutLog de otro alumno)', async () => {
    prisma.setLog.findUnique.mockResolvedValue(
      buildSetLogWithWorkoutLog({}, { studentId: OTHER_STUDENT_ID }),
    );

    await expect(
      service.update(STUDENT_ID, SET_LOG_ID, { actualReps: 12 }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.setLog.update).not.toHaveBeenCalled();
  });

  it('responde 404 si el SetLog no existe', async () => {
    prisma.setLog.findUnique.mockResolvedValue(null);

    await expect(
      service.update(STUDENT_ID, SET_LOG_ID, { actualReps: 12 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('impide editar fuera de la ventana de 24 horas (RF-24)', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    prisma.setLog.findUnique.mockResolvedValue(
      buildSetLogWithWorkoutLog({}, { createdAt: oldDate }),
    );

    await expect(
      service.update(STUDENT_ID, SET_LOG_ID, { actualReps: 12 }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.setLog.update).not.toHaveBeenCalled();
  });

  it('solo incluye en `data` los campos realmente enviados', async () => {
    prisma.setLog.findUnique.mockResolvedValue(buildSetLogWithWorkoutLog());
    prisma.setLog.update.mockResolvedValue(buildSetLogWithWorkoutLog());

    await service.update(STUDENT_ID, SET_LOG_ID, { comments: 'Ajuste' });

    expect(prisma.setLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { comments: 'Ajuste' } }),
    );
  });
});
