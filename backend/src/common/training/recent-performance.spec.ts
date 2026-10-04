import { computeRecentPerformance } from './workout-metrics';
import { PrismaService } from '../../prisma/prisma.service';

describe('Rendimiento personal reciente', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  it('promedia solo RPE general; impone 15 días inclusive sin ampliar el scope ni los filtros', async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValue({ _count: { _all: 8 }, _max: { performedAt: now } });
    const findMany = jest.fn().mockResolvedValue([
      { performedAt: now, overallRpe: 7 },
      { performedAt: now, overallRpe: 9 },
    ]);
    const prisma = {
      workoutLog: { aggregate, findMany },
    } as unknown as PrismaService;
    const where = {
      studentId: 'student-a',
      session: { week: { block: { programId: 'program-a' } } },
    };
    const result = await computeRecentPerformance(prisma, where, now);
    expect(result.averageOverallRpe).toBe(8);
    expect(result.workoutsRegistered).toBe(8);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            where,
            {
              performedAt: { gte: new Date('2026-09-19T12:00:00Z'), lte: now },
              durationMinutes: { not: null },
              overallRpe: { not: null },
            },
          ],
        },
      }),
    );
    expect(aggregate).toHaveBeenCalledWith({
      where,
      _count: { _all: true },
      _max: { performedAt: true },
    });
  });
  it('no convierte la ausencia de RPE en cero', async () => {
    const prisma = {
      workoutLog: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _max: { performedAt: null },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    expect(
      await computeRecentPerformance(prisma, { studentId: 'student-a' }, now),
    ).toEqual({
      from: new Date('2026-09-19T12:00:00Z'),
      to: now,
      averageOverallRpe: null,
      effortPoints: [],
      workoutsRegistered: 0,
      lastActivityAt: null,
    });
  });
});
