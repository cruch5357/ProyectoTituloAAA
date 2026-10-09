import { duplicatePrescription } from './duplicate-prescription';
import { PrismaService } from '../../prisma/prisma.service';

describe('duplicatePrescription', () => {
  const exercise = {
    id: 'old-e',
    exerciseId: 'catalog',
    order: 1,
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 10,
    targetRpe: '8.5',
    targetRir: 2,
    restSeconds: 90,
    notes: 'tempo',
  };
  const session = {
    id: 's',
    weekId: 'w',
    order: 1,
    name: 'Día 1',
    dayOfWeek: 2,
    sessionExercises: [exercise],
    workoutLogs: [{ id: 'log' }],
  };
  const week = {
    id: 'w',
    blockId: 'b',
    order: 1,
    number: 4,
    sessions: [session],
  };
  let tx: any;
  let prisma: PrismaService;
  beforeEach(() => {
    tx = { $queryRaw: jest.fn(), auditLog: { create: jest.fn() } };
    for (const key of ['program', 'week', 'session'])
      tx[key] = {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'copy' }),
        update: jest.fn(),
      };
    prisma = {
      $transaction: jest.fn((fn) => fn(tx)),
    } as unknown as PrismaService;
  });
  it('deep copies only prescription fields, with unique copy name', async () => {
    tx.program.findFirst.mockResolvedValue({
      name: 'Fuerza',
      description: 'Plan',
      durationWeeks: 4,
      assignments: [{ id: 'assignment' }],
      blocks: [{ id: 'b', name: 'Base', order: 1, weeks: [week] }],
    });
    tx.program.findMany.mockResolvedValue([{ name: 'Fuerza (copia)' }]);
    await duplicatePrescription(prisma, 'coach', 'p', 'program');
    expect(tx.program.findFirst.mock.calls[0][0].where).toEqual({
      id: 'p',
      coachId: 'coach',
    });
    const data = tx.program.create.mock.calls[0][0].data;
    expect(data.name).toBe('Fuerza (copia 2)');
    expect(data.assignments).toBeUndefined();
    const copy = data.blocks.create[0].weeks.create[0].sessions.create[0];
    expect(copy.dayOfWeek).toBe(2);
    expect(copy.workoutLogs).toBeUndefined();
    expect(copy.sessionExercises.create[0]).toEqual({
      ...exercise,
      id: undefined,
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
  it.each(['program', 'week', 'session'] as const)(
    'rejects absent/cross-owner %s before writes',
    async (kind) => {
      tx[kind].findFirst.mockResolvedValue(null);
      await expect(
        duplicatePrescription(prisma, 'other', 'id', kind),
      ).rejects.toMatchObject({ status: 404 });
      expect(tx[kind].create).not.toHaveBeenCalled();
      expect(
        JSON.stringify(tx[kind].findFirst.mock.calls[0][0].where),
      ).toContain('other');
    },
  );
  it.each(['week', 'session'] as const)(
    'inserts %s after original, shifts descending and keeps deep prescription',
    async (kind) => {
      tx[kind].findFirst.mockResolvedValue(kind === 'week' ? week : session);
      tx[kind].findMany.mockResolvedValue([
        { id: 'third', order: 3 },
        { id: 'second', order: 2 },
      ]);
      await duplicatePrescription(prisma, 'coach', 'id', kind);
      expect(tx[kind].update.mock.calls.map((c: any) => c[0])).toEqual([
        { where: { id: 'third' }, data: { order: 4 } },
        { where: { id: 'second' }, data: { order: 3 } },
      ]);
      const data = tx[kind].create.mock.calls[0][0].data;
      expect(data.order).toBe(2);
      expect(data.id).toBeUndefined();
      expect(
        kind === 'week'
          ? data.sessions.create[0].sessionExercises.create
          : data.sessionExercises.create,
      ).toHaveLength(1);
    },
  );
  it('propagates failures out of the transaction, without success audit', async () => {
    tx.session.findFirst.mockResolvedValue(session);
    tx.session.create.mockRejectedValue(new Error('insert failed'));
    await expect(
      duplicatePrescription(prisma, 'coach', 's', 'session'),
    ).rejects.toThrow('insert failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
