import { BlockAssignmentsService } from './block-assignments.service';
import { PrismaService } from '../prisma/prisma.service';

const sourceBlock = {
  id: 'block',
  name: 'Fuerza',
  revision: 4,
  weeks: [
    {
      sessions: [
        {
          id: 'session',
          name: 'Día 1',
          dayOfWeek: null,
          sessionExercises: [
            {
              id: 'session-exercise',
              exerciseId: 'exercise',
              notes: null,
              targetRepsMin: 5,
              targetRepsMax: 5,
              targetRpe: 8,
              targetRir: null,
              restSeconds: 120,
              modifiers: [],
              programmedSets: [],
              exercise: {
                name: 'Sentadilla',
                isActive: true,
                muscleGroups: [],
                muscleGroup: null,
                instructions: null,
                videoUrl: null,
              },
            },
          ],
        },
      ],
    },
  ],
};

function setup(blockFixture = sourceBlock) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'student', name: 'Alex Demo' }),
    },
    block: { findFirst: jest.fn().mockResolvedValue(blockFixture) },
    programAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      create: jest.fn().mockResolvedValue({
        id: 'assignment',
        snapshotBlockId: 'snapshot',
      }),
    },
    program: {
      create: jest.fn().mockResolvedValue({
        id: 'program',
        name: 'Fuerza',
        blocks: [{ id: 'snapshot' }],
      }),
    },
    auditLog: { create: jest.fn() },
    notification: { upsert: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  return {
    tx,
    service: new BlockAssignmentsService(prisma as unknown as PrismaService),
  };
}

describe('BlockAssignmentsService: días sugeridos opcionales', () => {
  it('crea una asignación sin exigir dayOffsets ni fijar días', async () => {
    const { service, tx } = setup();

    await service.assign('coach', 'student', {
      blockId: 'cm1234567890123456789012',
      startDate: '2026-11-02',
    });

    const create = tx.program.create.mock.calls[0][0];
    expect(
      create.data.blocks.create.weeks.create[0].sessions.create[0].dayOfWeek,
    ).toBeNull();
    expect(tx.programAssignment.create).toHaveBeenCalledTimes(1);
  });

  it('conserva offsets legacy únicamente como sugerencias', async () => {
    const { service, tx } = setup();

    await service.assign('coach', 'student', {
      blockId: 'cm1234567890123456789012',
      startDate: '2026-11-02',
      dayOffsets: [3],
    });

    const create = tx.program.create.mock.calls[0][0];
    expect(
      create.data.blocks.create.weeks.create[0].sessions.create[0].dayOfWeek,
    ).toBe(3);
  });

  it('avisa al coach cuando prescribe cinco entrenamientos semanales', async () => {
    const sessions = Array.from({ length: 5 }, (_, index) => ({
      ...sourceBlock.weeks[0].sessions[0],
      id: `session-${index}`,
      name: `Día ${index + 1}`,
    }));
    const { service, tx } = setup({
      ...sourceBlock,
      weeks: [{ sessions }],
    });

    await service.assign('coach', 'student', {
      blockId: 'cm1234567890123456789012',
      startDate: '2026-11-02',
    });

    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'coach',
          type: 'TRAINING_PLAN_WARNING',
        }),
      }),
    );
  });
});
