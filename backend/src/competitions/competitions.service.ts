import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { StudentAccessService } from '../coaching/student-access.service';
import {
  CoachGoalDto,
  CompetitionDto,
  UpdateCompetitionDto,
} from '../coaching/coaching.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { dateOnly, todayDate } from '../common/training/calendar-date';

@Injectable()
export class CompetitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StudentAccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}
  upcomingWhere(student: Prisma.UserWhereInput): Prisma.CompetitionWhereInput {
    return {
      student,
      status: 'UPCOMING',
      eventDate: { gte: dateOnly(todayDate()) },
    };
  }
  async list(user: AuthenticatedUser, studentId: string, page: number) {
    await this.access.require(user, studentId);
    return this.prisma.competition.findMany({
      where: { studentId },
      orderBy: [{ eventDate: 'asc' }, { id: 'asc' }],
      take: 20,
      skip: (page - 1) * 20,
    });
  }
  async get(user: AuthenticatedUser, id: string) {
    const competition = await this.prisma.competition.findFirst({
      where: {
        id,
        student: user.role === 'COACH' ? { coachId: user.id } : { id: user.id },
      },
    });
    if (!competition) throw new NotFoundException('Competición no encontrada');
    return competition;
  }
  async create(user: AuthenticatedUser, dto: CompetitionDto) {
    const student = await this.access.require(user, user.id);
    const competition = await this.prisma.$transaction(async (tx) => {
      const result = await tx.competition.create({
        data: {
          studentId: user.id,
          name: dto.name,
          eventDate: dateOnly(dto.eventDate),
          category: dto.category,
          location: dto.location,
          goal: dto.goal,
          notes: dto.notes,
          status: dto.status,
        },
      });
      if (student.coachId)
        await this.notifications.create(
          tx,
          student.coachId,
          'COMPETITION_CREATED',
          `${student.name} agregó una competición`,
          'student',
          user.id,
        );
      return result;
    });
    await this.audit.record({
      actorId: user.id,
      action: 'COMPETITION_CREATED',
      entityType: 'Competition',
      entityId: competition.id,
    });
    return competition;
  }
  async update(user: AuthenticatedUser, id: string, dto: UpdateCompetitionDto) {
    await this.get(user, id);
    const student = await this.access.require(user, user.id);
    const result = await this.prisma.$transaction(async (tx) => {
      const result = await tx.competition.update({
        where: { id },
        data: {
          name: dto.name,
          eventDate:
            dto.eventDate === undefined ? undefined : dateOnly(dto.eventDate),
          category: dto.category,
          location: dto.location,
          goal: dto.goal,
          notes: dto.notes,
          status: dto.status,
        },
      });
      if (student.coachId)
        await this.notifications.create(
          tx,
          student.coachId,
          'COMPETITION_UPDATED',
          `${student.name} actualizó una competición`,
          'student',
          user.id,
        );
      return result;
    });
    await this.audit.record({
      actorId: user.id,
      action: 'COMPETITION_UPDATED',
      entityType: 'Competition',
      entityId: id,
    });
    return result;
  }
  async coachGoal(user: AuthenticatedUser, id: string, dto: CoachGoalDto) {
    const competition = await this.get(user, id);
    const result = await this.prisma.$transaction(async (tx) => {
      const result = await tx.competition.update({
        where: { id },
        data: { coachGoal: dto.coachGoal },
      });
      await this.notifications.create(
        tx,
        competition.studentId,
        'COMPETITION_GOAL_UPDATED',
        'Tu coach actualizó el objetivo de competición',
        'competition',
        id,
      );
      return result;
    });
    await this.audit.record({
      actorId: user.id,
      action: 'COMPETITION_GOAL_UPDATED',
      entityType: 'Competition',
      entityId: id,
    });
    return result;
  }
}
