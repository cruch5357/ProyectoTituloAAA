import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { StudentAccessService } from './student-access.service';
import { CompetitionsService } from '../competitions/competitions.service';
import {
  dateOnly,
  sessionDate,
  todayDate,
} from '../common/training/calendar-date';

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StudentAccessService,
    private readonly competitions: CompetitionsService,
  ) {}
  async overview(user: AuthenticatedUser, studentId: string, month?: string) {
    await this.access.require(user, studentId);
    const today = todayDate();
    const monthStart = dateOnly(`${month ?? today.slice(0, 7)}-01`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    const [assignments, nextCompetition, recentLogs, competitions] =
      await Promise.all([
        this.prisma.programAssignment.findMany({
          where: { studentId, status: 'ACTIVE', program: { isActive: true } },
          orderBy: { assignedAt: 'desc' },
          include: {
            program: {
              select: {
                id: true,
                name: true,
                blocks: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    name: true,
                    weeks: {
                      orderBy: { order: 'asc' },
                      select: {
                        id: true,
                        number: true,
                        sessions: {
                          orderBy: { order: 'asc' },
                          select: { id: true, name: true, dayOfWeek: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        this.prisma.competition.findFirst({
          where: this.competitions.upcomingWhere({ id: studentId }),
          orderBy: [{ eventDate: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.workoutLog.findMany({
          where: {
            studentId,
            OR: [
              {
                performedAt: {
                  gte: new Date(dateOnly(today).getTime() - 56 * 86400000),
                  lte: new Date(),
                },
              },
              {
                performedAt: {
                  gte: new Date(monthStart.getTime() - 86400000),
                  lt: new Date(monthEnd.getTime() + 86400000),
                },
              },
            ],
            durationMinutes: { not: null },
          },
          select: { sessionId: true, performedAt: true },
          orderBy: { performedAt: 'desc' },
        }),
        this.prisma.competition.findMany({
          where: { studentId, eventDate: { gte: monthStart, lt: monthEnd } },
          orderBy: { eventDate: 'asc' },
          take: 201,
        }),
      ]);
    const completedDates = new Set(
      recentLogs.map((log) => `${log.sessionId}:${todayDate(log.performedAt)}`),
    );
    const sessions = assignments
      .flatMap((assignment) => {
        let weekIndex = 0;
        return assignment.program.blocks.flatMap((block, blockIndex) =>
          block.weeks.flatMap((week) => {
            const index = weekIndex++;
            return week.sessions.map((session) => {
              const date = sessionDate(
                assignment.startDate,
                index,
                session.dayOfWeek,
              );
              return {
                id: `${assignment.id}:${session.id}`,
                assignmentId: assignment.id,
                sessionId: session.id,
                name: session.name,
                programName: assignment.program.name,
                blockName: block.name,
                blockId: block.id,
                blockIndex,
                weekNumber: week.number,
                date,
                completed:
                  date !== null && completedDates.has(`${session.id}:${date}`),
              };
            });
          }),
        );
      })
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
    const nextSession =
      sessions.find((s) => s.date === today && !s.completed) ??
      sessions.find((s) => s.date !== null && s.date > today) ??
      null;
    const pendingSession =
      [...sessions]
        .reverse()
        .find(
          (s) =>
            s.date !== null &&
            s.date < today &&
            s.date >=
              new Date(dateOnly(today).getTime() - 56 * 86400000)
                .toISOString()
                .slice(0, 10) &&
            !s.completed,
        ) ?? null;
    return {
      today,
      nextSession,
      pendingSession,
      nextCompetition,
      sessions,
      competitions: competitions.slice(0, 200),
      competitionsTruncated: competitions.length > 200,
      assignments: assignments.map((a) => {
        const index = a.startDate
          ? Math.floor(
              (dateOnly(today).getTime() - a.startDate.getTime()) /
                (7 * 86400000),
            )
          : -1;
        const weeks = a.program.blocks.flatMap((block) =>
          block.weeks.map((week) => ({
            blockName: block.name,
            weekNumber: week.number,
          })),
        );
        return {
          id: a.id,
          programId: a.programId,
          name: a.program.name,
          startDate: a.startDate,
          currentWeek: weeks[index] ?? null,
        };
      }),
    };
  }
  async coach(user: AuthenticatedUser) {
    const since = new Date(Date.now() - 7 * 86400000);
    const [competitions, attention, workoutsThisWeek, assignedActivity] =
      await Promise.all([
        this.prisma.competition.findMany({
          where: this.competitions.upcomingWhere({ coachId: user.id }),
          take: 20,
          orderBy: { eventDate: 'asc' },
          include: { student: { select: { id: true, name: true } } },
        }),
        this.prisma.user.findMany({
          where: {
            coachId: user.id,
            role: 'STUDENT',
            isActive: true,
            OR: [
              { assignmentsAsStudent: { none: { status: 'ACTIVE' } } },
              {
                workoutLogs: {
                  none: {
                    durationMinutes: { not: null },
                    performedAt: { gte: since },
                  },
                },
              },
            ],
          },
          take: 20,
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            assignmentsAsStudent: {
              where: { status: 'ACTIVE' },
              select: { id: true },
              take: 1,
            },
            workoutLogs: {
              where: { durationMinutes: { not: null } },
              orderBy: { performedAt: 'desc' },
              take: 1,
              select: { performedAt: true },
            },
          },
        }),
        this.prisma.workoutLog.count({
          where: { student: { coachId: user.id }, performedAt: { gte: since } },
        }),
        this.prisma.auditLog.findMany({
          where: { actorId: user.id, action: 'program_assignments.created' },
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: { id: true, createdAt: true },
        }),
      ]);
    return {
      competitions,
      attention: attention.map((s) => ({
        id: s.id,
        name: s.name,
        reasons: [
          !s.assignmentsAsStudent.length ? 'Sin programa activo' : null,
          !s.workoutLogs.length || s.workoutLogs[0].performedAt < since
            ? 'Sin entrenamiento finalizado en 7 días'
            : null,
        ].filter(Boolean),
      })),
      workoutsThisWeek,
      assignedActivity: assignedActivity.map((entry) => ({
        ...entry,
        title: 'Asignaste un programa a un alumno',
      })),
    };
  }
}
