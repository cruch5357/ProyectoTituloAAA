import { TrainingService } from '../block-assignments/training.service';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

import { CompetitionsService } from '../competitions/competitions.service';
import { dateOnly, todayDate } from '../common/training/calendar-date';

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly training: TrainingService,
    private readonly competitions: CompetitionsService,
  ) {}
  async overview(user: AuthenticatedUser, studentId: string, month?: string) {
    const training = await this.training.overview(user, studentId, true);
    const today = todayDate();
    const monthStart = dateOnly(`${month ?? today.slice(0, 7)}-01`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    const [nextCompetition, competitions] = await Promise.all([
      this.prisma.competition.findFirst({
        where: this.competitions.upcomingWhere({ id: studentId }),
        orderBy: [{ eventDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.competition.findMany({
        where: { studentId, eventDate: { gte: monthStart, lt: monthEnd } },
        orderBy: { eventDate: 'asc' },
        take: 201,
      }),
    ]);
    return {
      ...training,
      assignments: training.assignments.filter((a) => a.status === 'ACTIVE'),
      sessions: training.sessions.filter(
        (s) => s.cycleStatus === 'ACTIVE' || s.workoutLogId,
      ),
      nextCompetition,
      competitions: competitions.slice(0, 200),
      competitionsTruncated: competitions.length > 200,
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
          where: {
            actorId: user.id,
            action: { in: ['program_assignments.created', 'BLOCK_ASSIGNED'] },
          },
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
          !s.assignmentsAsStudent.length ? 'Sin ciclo activo' : null,
          !s.workoutLogs.length || s.workoutLogs[0].performedAt < since
            ? 'Sin entrenamiento finalizado en 7 días'
            : null,
        ].filter(Boolean),
      })),
      workoutsThisWeek,
      assignedActivity: assignedActivity.map((entry) => ({
        ...entry,
        title: 'Asignaste un ciclo a un alumno',
      })),
    };
  }
}
