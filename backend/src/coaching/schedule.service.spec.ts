import { ScheduleService } from './schedule.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  dateOnly,
  effectiveSessionDate,
} from '../common/training/calendar-date';

describe('ScheduleService', () => {
  let tx: any;
  let service: ScheduleService;
  const assignment = {
    id: 'a',
    studentId: 'student',
    programId: 'p',
    status: 'ACTIVE',
    startDate: dateOnly('2026-10-12'),
    program: {
      blocks: [
        { weeks: [{ sessions: [{ id: 's', name: 'Día 2', dayOfWeek: 2 }] }] },
      ],
    },
  };
  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(),
      programAssignment: {
        findFirst: jest.fn().mockResolvedValue(assignment),
        findUniqueOrThrow: jest.fn().mockResolvedValue(assignment),
        update: jest.fn(),
      },
      workoutLog: { findFirst: jest.fn().mockResolvedValue(null) },
      sessionScheduleOverride: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    service = new ScheduleService(
      { $transaction: (fn: any) => fn(tx) } as unknown as PrismaService,
      { create: jest.fn() } as unknown as NotificationsService,
    );
  });
  it('creates one assignment/session override without modifying template, then preserves originalDate', async () => {
    await expect(
      service.change('coach', 'a', 's', {
        scheduledDate: '2026-10-15',
        reason: 'Viaje',
      }),
    ).resolves.toMatchObject({ date: '2026-10-15' });
    expect(
      tx.sessionScheduleOverride.upsert.mock.calls[0][0].create,
    ).toMatchObject({
      originalDate: dateOnly('2026-10-13'),
      programAssignmentId: 'a',
      sessionId: 's',
    });
    tx.sessionScheduleOverride.findUnique.mockResolvedValue({
      originalDate: dateOnly('2026-10-13'),
      scheduledDate: dateOnly('2026-10-15'),
    });
    await service.change('coach', 'a', 's', { scheduledDate: '2026-10-17' });
    expect(tx.sessionScheduleOverride.upsert.mock.calls[1][0].update).toEqual({
      scheduledDate: dateOnly('2026-10-17'),
      reason: null,
    });
  });
  it('reset deletes override and resolves derived date', async () => {
    tx.sessionScheduleOverride.findUnique.mockResolvedValue({
      scheduledDate: dateOnly('2026-10-15'),
    });
    await expect(
      service.change('coach', 'a', 's', null),
    ).resolves.toMatchObject({ date: '2026-10-13' });
    expect(tx.sessionScheduleOverride.deleteMany).toHaveBeenCalledWith({
      where: { programAssignmentId: 'a', sessionId: 's' },
    });
  });
  it.each([null, 40])(
    'blocks any registered workout (duration %s), including reset',
    async (durationMinutes) => {
      tx.workoutLog.findFirst.mockResolvedValue({ id: 'log', durationMinutes });
      await expect(
        service.change('coach', 'a', 's', { scheduledDate: '2026-10-15' }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        service.change('coach', 'a', 's', null),
      ).rejects.toMatchObject({ status: 409 });
    },
  );
  it('rejects cross-owner assignment with generic 404', async () => {
    tx.programAssignment.findFirst.mockResolvedValue(null);
    await expect(service.change('other', 'a', 's', null)).rejects.toMatchObject(
      { status: 404 },
    );
    expect(tx.programAssignment.findFirst.mock.calls[0][0].where).toEqual({
      id: 'a',
      program: { coachId: 'other' },
      student: { coachId: 'other' },
    });
  });
  it('rejects a session from another program and uncalculable dates', async () => {
    await expect(
      service.change('coach', 'a', 'foreign', null),
    ).rejects.toMatchObject({ status: 404 });
    tx.programAssignment.findUniqueOrThrow.mockResolvedValue({
      ...assignment,
      startDate: null,
    });
    await expect(
      service.change('coach', 'a', 's', { scheduledDate: '2026-10-15' }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects invalid calendar dates', async () => {
    await expect(
      service.change('coach', 'a', 's', { scheduledDate: '2026-02-30' }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each(['workoutLog', 'sessionScheduleOverride'])(
    'protects startDate when %s exists',
    async (key) => {
      tx[key].findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.changeStart('coach', 'a', '2026-10-14'),
      ).rejects.toMatchObject({ status: 409 });
      expect(tx.programAssignment.update).not.toHaveBeenCalled();
    },
  );
  it('allows unchanged startDate and changes only an unused assignment', async () => {
    await service.changeStart('coach', 'a', '2026-10-12');
    expect(tx.programAssignment.update).not.toHaveBeenCalled();
    await service.changeStart('coach', 'a', '2026-10-14');
    expect(tx.programAssignment.update).toHaveBeenCalled();
  });
  it('central resolver handles overrides and missing schedule', () => {
    expect(
      effectiveSessionDate(assignment.startDate, 0, 2, {
        scheduledDate: dateOnly('2026-10-17'),
      }),
    ).toBe('2026-10-17');
    expect(effectiveSessionDate(null, 0, 2)).toBeNull();
  });
});
