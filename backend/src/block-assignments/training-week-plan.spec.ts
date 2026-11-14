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

  it('saves three consecutive dates without alerting the coach from dates alone', async () => {
    const { service, tx } = setup();
    const result = await service.saveWeekPlan(student, {
      assignmentId: 'assignment',
      weekIndex: 0,
      revision: 0,
      trainingDates: ['2026-11-10', '2026-11-11', '2026-11-12'],
    });

    expect(result.assessment).toMatchObject({
      level: 'CAUTION',
      code: 'CONCENTRATED_DAYS',
      notifyCoach: false,
    });
    expect(tx.trainingWeekPlan.create).toHaveBeenCalled();
    expect(tx.notification.upsert).not.toHaveBeenCalled();
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

  it('alerts the coach once for a confirmed nearby high-effort muscle conflict', async () => {
    const { service, tx } = setup();
    const exercise = (id: string) => ({
      id,
      targetSets: 1,
      programmedSets: [],
      exercise: {
        name: 'Sentadilla',
        muscleGroups: ['Piernas'],
        muscleGroup: null,
        videoUrl: null,
        instructions: null,
      },
      frozenExercise: null,
    });
    const resolved = await tx.programAssignment.findFirst();
    resolved.program.blocks[0].weeks[0].sessions[0].sessionExercises = [
      exercise('exercise-a'),
    ];
    resolved.program.blocks[0].weeks[0].sessions[1].sessionExercises = [
      exercise('exercise-b'),
    ];
    tx.programAssignment.findFirst.mockResolvedValue(resolved);
    tx.workoutLog.findMany.mockResolvedValue([
      {
        sessionId: 'a',
        performedAt: new Date('2026-11-10T15:00:00.000Z'),
        completionStatus: 'COMPLETED',
        structuredExecution: true,
        finishedAt: new Date('2026-11-10T16:00:00.000Z'),
        durationMinutes: null,
        omittedSets: [],
        overallRpe: 9,
        setLogs: [
          { sessionExerciseId: 'exercise-a', actualRpe: 9, actualRir: 1 },
        ],
        _count: { setLogs: 1 },
      },
      {
        sessionId: 'b',
        performedAt: new Date('2026-11-11T15:00:00.000Z'),
        completionStatus: 'PARTIAL',
        structuredExecution: true,
        finishedAt: new Date('2026-11-11T16:00:00.000Z'),
        durationMinutes: null,
        omittedSets: [],
        overallRpe: null,
        setLogs: [
          { sessionExerciseId: 'exercise-b', actualRpe: 7, actualRir: 3 },
        ],
        _count: { setLogs: 1 },
      },
    ]);

    const result = await service.saveWeekPlan(student, {
      assignmentId: 'assignment',
      weekIndex: 0,
      revision: 0,
      trainingDates: ['2026-11-10', '2026-11-11', '2026-11-13'],
    });

    expect(result.assessment).toMatchObject({
      code: 'CONFIRMED_HIGH_LOAD_CONFLICT',
      notifyCoach: true,
    });
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'coach',
          type: 'TRAINING_PLAN_WARNING',
          resourceType: 'message',
          resourceId: 'student',
        }),
        update: expect.not.objectContaining({ readAt: null }),
      }),
    );
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'student',
          title: 'Tu coach fue informado de esta planificación',
        }),
      }),
    );
    expect(tx.notification.upsert).toHaveBeenCalledTimes(2);
  });
});
