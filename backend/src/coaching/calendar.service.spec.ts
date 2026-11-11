import { Role } from '@prisma/client';
import { CalendarService } from './calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrainingService } from '../block-assignments/training.service';
import { CompetitionsService } from '../competitions/competitions.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

const user = {
  id: 'student',
  role: Role.STUDENT,
  email: 'student@example.com',
  name: 'Student',
  coachId: 'coach',
} as AuthenticatedUser;

function session(id: string, blockId: string) {
  return {
    id: `assignment:${id}`,
    assignmentId: 'assignment',
    sessionId: id,
    name: `Sesión ${id}`,
    programName: 'Programa',
    blockName: `Bloque ${blockId}`,
    blockId,
    blockIndex: blockId === 'a' ? 0 : 1,
    weekNumber: 1,
    dayNumber: 1,
    date: '2026-10-07',
    suggestedDate: '2026-10-07',
    actualDate: null,
    completed: false,
    finished: false,
    status: 'NOT_STARTED',
    recordedSets: 0,
    totalSets: 4,
    workoutLogId: null,
    availability: 'AVAILABLE',
    canStart: true,
    readOnly: true,
    cycleStatus: 'ACTIVE',
    muscleGroups: [],
  };
}

describe('CalendarService real workout dates', () => {
  const previousTimezone = process.env.APP_TIMEZONE;

  afterEach(() => {
    if (previousTimezone === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = previousTimezone;
  });

  it('separates flexible suggestions and returns every real log on its local date', async () => {
    process.env.APP_TIMEZONE = 'America/Santiago';
    const sessions = [session('legs', 'a'), session('upper', 'b')];
    const training = {
      overview: jest.fn().mockResolvedValue({
        today: '2026-10-07',
        assignments: [{ id: 'assignment', status: 'ACTIVE' }],
        sessions,
        nextSession: sessions[0],
        pendingSession: null,
        weekPlan: null,
      }),
    };
    const prisma = {
      competition: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      workoutLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'log-legs',
            sessionId: 'legs',
            programAssignmentId: 'assignment',
            performedAt: new Date('2026-10-07T23:30:00.000Z'),
            completionStatus: 'PARTIAL',
            structuredExecution: true,
            finishedAt: new Date('2026-10-08T00:10:00.000Z'),
            durationMinutes: null,
            omittedSets: [],
            _count: { setLogs: 2 },
          },
          {
            id: 'log-upper',
            sessionId: 'upper',
            programAssignmentId: 'assignment',
            performedAt: new Date('2026-10-07T14:00:00.000Z'),
            completionStatus: 'SKIPPED',
            structuredExecution: true,
            finishedAt: new Date('2026-10-07T14:05:00.000Z'),
            durationMinutes: null,
            omittedSets: [],
            _count: { setLogs: 0 },
          },
          {
            id: 'log-local-october',
            sessionId: 'legs',
            programAssignmentId: 'assignment',
            performedAt: new Date('2026-11-01T01:30:00.000Z'),
            completionStatus: 'COMPLETED',
            structuredExecution: true,
            finishedAt: new Date('2026-11-01T02:00:00.000Z'),
            durationMinutes: null,
            omittedSets: [],
            _count: { setLogs: 4 },
          },
        ]),
      },
    };
    const competitions = { upcomingWhere: jest.fn().mockReturnValue({}) };
    const service = new CalendarService(
      prisma as unknown as PrismaService,
      training as unknown as TrainingService,
      competitions as unknown as CompetitionsService,
    );

    const result = await service.overview(user, user.id, '2026-10');

    expect(result.sessions).toEqual(sessions);
    expect(result.workouts).toHaveLength(3);
    expect(result.workouts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'assignment:legs:workout:log-legs',
          actualDate: '2026-10-07',
          status: 'PARTIAL',
          recordedSets: 2,
          blockId: 'a',
        }),
        expect.objectContaining({
          id: 'assignment:upper:workout:log-upper',
          actualDate: '2026-10-07',
          status: 'SKIPPED',
          recordedSets: 0,
          blockId: 'b',
        }),
        expect.objectContaining({
          id: 'assignment:legs:workout:log-local-october',
          actualDate: '2026-10-31',
          status: 'COMPLETED',
        }),
      ]),
    );
  });
});
