import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrainingService } from './training.service';

const student = {
  id: 'student',
  role: Role.STUDENT,
  email: 'alex@example.com',
  name: 'Alex Demo',
  coachId: 'coach',
};

function setup() {
  const assignment = {
    id: 'assignment',
    studentId: student.id,
    status: 'ACTIVE',
    startDate: new Date('2026-11-10T00:00:00.000Z'),
    scheduleOverrides: [],
    program: {
      blocks: [
        {
          weeks: [
            {
              sessions: [
                { id: 'a', name: 'A', sessionExercises: [] },
                { id: 'b', name: 'B', sessionExercises: [] },
                { id: 'c', name: 'C', sessionExercises: [] },
              ],
            },
          ],
        },
      ],
    },
  };
  const tx = {
    programAssignment: {
      findFirst: jest.fn().mockResolvedValue(assignment),
    },
    trainingWeekPlan: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ revision: 1 }),
      update: jest.fn(),
      delete: jest.fn(),
    },
    workoutLog: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ coachId: 'coach', name: 'Alex Demo' }),
    },
    notification: { upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest
      .fn()
      .mockImplementation((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
  };
  return {
    tx,
    service: new TrainingService(prisma as unknown as PrismaService),
  };
}

describe('TrainingService weekly plan', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-10T15:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  it('saves the active week and alerts the coach for three consecutive days', async () => {
    const { service, tx } = setup();
    const result = await service.saveWeekPlan(student, {
      assignmentId: 'assignment',
      weekIndex: 0,
      revision: 0,
      trainingDates: ['2026-11-10', '2026-11-11', '2026-11-12'],
    });

    expect(result.assessment).toMatchObject({
      level: 'CAUTION',
      code: 'THREE_CONSECUTIVE',
    });
    expect(tx.trainingWeekPlan.create).toHaveBeenCalled();
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'TRAINING_PLAN_WARNING' }),
      }),
    );
  });

  it('rejects dates outside the active assignment week', async () => {
    const { service, tx } = setup();
    await expect(
      service.saveWeekPlan(student, {
        assignmentId: 'assignment',
        weekIndex: 0,
        revision: 0,
        trainingDates: ['2026-11-16'],
      }),
    ).rejects.toThrow('Los días deben pertenecer a la semana activa.');
    expect(tx.trainingWeekPlan.create).not.toHaveBeenCalled();
  });

  it('rejects more planned dates than sessions remaining after real workouts', async () => {
    const { service, tx } = setup();
    tx.workoutLog.findMany.mockResolvedValue([
      {
        sessionId: 'a',
        performedAt: new Date('2026-11-10T15:00:00.000Z'),
        completionStatus: 'COMPLETED',
        structuredExecution: true,
        finishedAt: new Date('2026-11-10T16:00:00.000Z'),
        durationMinutes: null,
        omittedSets: [],
        _count: { setLogs: 0 },
      },
    ]);

    await expect(
      service.saveWeekPlan(student, {
        assignmentId: 'assignment',
        weekIndex: 0,
        revision: 0,
        trainingDates: ['2026-11-11', '2026-11-12', '2026-11-13'],
      }),
    ).rejects.toThrow('más días planificados que sesiones pendientes');
  });
});
