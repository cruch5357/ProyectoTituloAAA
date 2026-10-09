import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  dateOnly,
  effectiveSessionDate,
} from '../common/training/calendar-date';
import { NotificationsService } from '../notifications/notifications.service';

const REGISTERED =
  'No puedes reprogramar una sesión que ya tiene un entrenamiento registrado.';
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async change(
    coachId: string,
    assignmentId: string,
    sessionId: string,
    input: { scheduledDate: string; reason?: string } | null,
  ) {
    const scheduledDate = input ? dateOnly(input.scheduledDate) : null;
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.programAssignment.findFirst({
        where: { id: assignmentId, program: { coachId }, student: { coachId } },
        include: {
          program: {
            include: {
              blocks: {
                orderBy: { order: 'asc' },
                include: {
                  weeks: {
                    orderBy: { order: 'asc' },
                    include: { sessions: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!assignment) throw new NotFoundException('Asignación no encontrada');
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${assignment.studentId} FOR UPDATE`;
      // Read again after acquiring the lock shared with startDate and workout start.
      const current = await tx.programAssignment.findUniqueOrThrow({
        where: { id: assignmentId },
      });
      const weeks = assignment.program.blocks.flatMap((b) => b.weeks);
      const weekIndex = weeks.findIndex((w) =>
        w.sessions.some((s) => s.id === sessionId),
      );
      const session = weeks[weekIndex]?.sessions.find(
        (s) => s.id === sessionId,
      );
      if (!session) throw new NotFoundException('Sesión no encontrada');
      if (current.status !== 'ACTIVE')
        throw new BadRequestException('La asignación no está activa');
      if (
        await tx.workoutLog.findFirst({
          where: {
            studentId: assignment.studentId,
            sessionId,
            OR: [
              { programAssignmentId: assignmentId },
              { programAssignmentId: null },
            ],
          },
          select: { id: true },
        })
      )
        throw new ConflictException(REGISTERED);
      const where = {
        programAssignmentId_sessionId: {
          programAssignmentId: assignmentId,
          sessionId,
        },
      };
      const existing = await tx.sessionScheduleOverride.findUnique({ where });
      const original = effectiveSessionDate(
        current.startDate,
        weekIndex,
        session.dayOfWeek,
        existing,
      );
      if (!original)
        throw new BadRequestException(
          'Configura fecha de inicio y día de la sesión antes de reprogramar',
        );
      if (scheduledDate) {
        await tx.sessionScheduleOverride.upsert({
          where,
          create: {
            programAssignmentId: assignmentId,
            sessionId,
            originalDate: dateOnly(original),
            scheduledDate,
            reason: input?.reason,
            createdByUserId: coachId,
          },
          update: { scheduledDate, reason: input?.reason ?? null },
        });
      } else {
        await tx.sessionScheduleOverride.deleteMany({
          where: { programAssignmentId: assignmentId, sessionId },
        });
      }
      const date =
        scheduledDate?.toISOString().slice(0, 10) ??
        effectiveSessionDate(current.startDate, weekIndex, session.dayOfWeek);
      const formatted = new Intl.DateTimeFormat('es-CL', {
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(dateOnly(date!));
      await this.notifications.create(
        tx,
        assignment.studentId,
        'SESSION_RESCHEDULED',
        `Tu sesión ${session.name} ${input ? 'fue reprogramada' : 'restableció su programación'} para el ${formatted}.`,
        'Session',
        sessionId,
      );
      await tx.auditLog.create({
        data: {
          actorId: coachId,
          action: input ? 'SESSION_RESCHEDULED' : 'SESSION_SCHEDULE_RESET',
          entityType: 'ProgramAssignment',
          entityId: assignmentId,
          metadata: { sessionId, scheduledDate: date },
        },
      });
      return { assignmentId, sessionId, date };
    });
  }

  async changeStart(coachId: string, id: string, value: string) {
    const startDate = dateOnly(value);
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.programAssignment.findFirst({
        where: { id, program: { coachId }, student: { coachId } },
      });
      if (!assignment) throw new NotFoundException('Asignación no encontrada');
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${assignment.studentId} FOR UPDATE`;
      const current = await tx.programAssignment.findUniqueOrThrow({
        where: { id },
      });
      if (current.startDate?.getTime() !== startDate.getTime()) {
        const [log, override] = await Promise.all([
          tx.workoutLog.findFirst({
            where: {
              studentId: assignment.studentId,
              OR: [{ programAssignmentId: id }, { programAssignmentId: null }],
              session: { week: { block: { programId: assignment.programId } } },
            },
            select: { id: true },
          }),
          tx.sessionScheduleOverride.findFirst({
            where: { programAssignmentId: id },
            select: { id: true },
          }),
        ]);
        if (log || override)
          throw new ConflictException(
            'No puedes cambiar el inicio con entrenamientos o reprogramaciones. Usa la reprogramación por sesión.',
          );
        await tx.programAssignment.update({
          where: { id },
          data: { startDate },
        });
        await tx.auditLog.create({
          data: {
            actorId: coachId,
            action: 'PROGRAM_ASSIGNMENT_START_DATE_CHANGED',
            entityType: 'ProgramAssignment',
            entityId: id,
            metadata: { startDate: value },
          },
        });
      }
      return { id, startDate };
    });
  }
}
