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
  let notifications: { create: jest.Mock };
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
    notifications = { create: jest.fn() };
    service = new ScheduleService(
      { $transaction: (fn: any) => fn(tx) } as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });
  it('stores an in-week suggestion, notifies and audits without modifying the template', async () => {
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
    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      'student',
      'SESSION_RESCHEDULED',
      expect.stringContaining('fecha sugerida el 15 de octubre'),
      'Session',
      's',
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'coach',
        action: 'SESSION_RESCHEDULED',
        entityType: 'ProgramAssignment',
        entityId: 'a',
        metadata: { sessionId: 's', scheduledDate: '2026-10-15' },
      },
    });
  });
  it('preserves originalDate when the suggestion changes inside the same week', async () => {
    tx.sessionScheduleOverride.findUnique.mockResolvedValue({
      originalDate: dateOnly('2026-10-13'),
      scheduledDate: dateOnly('2026-10-15'),
    });
    await service.change('coach', 'a', 's', { scheduledDate: '2026-10-17' });
    expect(tx.sessionScheduleOverride.upsert.mock.calls[0][0].update).toEqual({
      scheduledDate: dateOnly('2026-10-17'),
      reason: null,
    });
  });
  it('allows an optional suggestion when the weekly session has no default day', async () => {
    const flexible = {
      ...assignment,
      program: {
        blocks: [
          {
            weeks: [
              { sessions: [{ id: 's', name: 'Día libre', dayOfWeek: null }] },
            ],
          },
        ],
      },
    };
    tx.programAssignment.findFirst.mockResolvedValue(flexible);
    tx.programAssignment.findUniqueOrThrow.mockResolvedValue(flexible);

    await expect(
      service.change('coach', 'a', 's', { scheduledDate: '2026-10-15' }),
    ).resolves.toMatchObject({ date: '2026-10-15' });
    expect(
      tx.sessionScheduleOverride.upsert.mock.calls[0][0].create.originalDate,
    ).toEqual(dateOnly('2026-10-15'));
  });
  it.each(['2026-10-12', '2026-10-18'])(
    'accepts the inclusive calendar-week boundary %s',
    async (scheduledDate) => {
      await expect(
        service.change('coach', 'a', 's', { scheduledDate }),
      ).resolves.toMatchObject({ date: scheduledDate });
      expect(tx.sessionScheduleOverride.upsert).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['2026-10-11', '2026-10-19'])(
    'rejects suggestion %s outside the prescribed week without side effects',
    async (scheduledDate) => {
      await expect(
        service.change('coach', 'a', 's', { scheduledDate }),
      ).rejects.toThrow(
        'La fecha sugerida debe estar entre 2026-10-12 y 2026-10-18',
      );
      expect(tx.sessionScheduleOverride.upsert).not.toHaveBeenCalled();
      expect(tx.sessionScheduleOverride.deleteMany).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );
  it('clips the first prescribed week at a mid-week assignment start', async () => {
    const partialWeek = {
      ...assignment,
      startDate: dateOnly('2026-08-26'),
    };
    tx.programAssignment.findFirst.mockResolvedValue(partialWeek);
    tx.programAssignment.findUniqueOrThrow.mockResolvedValue(partialWeek);

    await expect(
      service.change('coach', 'a', 's', { scheduledDate: '2026-08-25' }),
    ).rejects.toThrow(
      'La fecha sugerida debe estar entre 2026-08-26 y 2026-08-30',
    );
    await expect(
      service.change('coach', 'a', 's', { scheduledDate: '2026-08-26' }),
    ).resolves.toMatchObject({ date: '2026-08-26' });
    expect(tx.sessionScheduleOverride.upsert).toHaveBeenCalledTimes(1);
  });
  it('reset deletes the override, restores the derived suggestion, notifies and audits', async () => {
    tx.sessionScheduleOverride.findUnique.mockResolvedValue({
      scheduledDate: dateOnly('2026-10-15'),
    });
    await expect(
      service.change('coach', 'a', 's', null),
    ).resolves.toMatchObject({ date: '2026-10-13' });
    expect(tx.sessionScheduleOverride.deleteMany).toHaveBeenCalledWith({
      where: { programAssignmentId: 'a', sessionId: 's' },
    });
    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      'student',
      'SESSION_RESCHEDULED',
      expect.stringContaining('restableció su fecha sugerida al 13 de octubre'),
      'Session',
      's',
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'coach',
        action: 'SESSION_SCHEDULE_RESET',
        entityType: 'ProgramAssignment',
        entityId: 'a',
        metadata: { sessionId: 's', scheduledDate: '2026-10-13' },
      },
    });
  });
  it('removes an optional suggestion without inventing a replacement date', async () => {
    const flexible = {
      ...assignment,
      program: {
        blocks: [
          {
            weeks: [
              { sessions: [{ id: 's', name: 'Día libre', dayOfWeek: null }] },
            ],
          },
        ],
      },
    };
    tx.programAssignment.findFirst.mockResolvedValue(flexible);
    tx.programAssignment.findUniqueOrThrow.mockResolvedValue(flexible);
    tx.sessionScheduleOverride.findUnique.mockResolvedValue({
      originalDate: dateOnly('2026-10-15'),
      scheduledDate: dateOnly('2026-10-15'),
    });

    await expect(service.change('coach', 'a', 's', null)).resolves.toEqual({
      assignmentId: 'a',
      sessionId: 's',
      date: null,
    });
    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      'student',
      'SESSION_RESCHEDULED',
      expect.stringContaining('ya no tiene una fecha sugerida'),
      'Session',
      's',
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'coach',
        action: 'SESSION_SCHEDULE_RESET',
        entityType: 'ProgramAssignment',
        entityId: 'a',
        metadata: { sessionId: 's', scheduledDate: null },
      },
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
