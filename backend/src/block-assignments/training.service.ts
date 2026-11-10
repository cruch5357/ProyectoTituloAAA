import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import {
  assignmentWeekBounds,
  assignmentWeekIndex,
  assignmentWeekState,
  dateOnly,
  effectiveSessionDate,
  todayDate,
} from '../common/training/calendar-date';
import { computeAdherence } from '../common/training/adherence';
import {
  assessTrainingWeek,
  recommendTrainingDates,
} from '../common/training/week-plan';
import { capturePrescription } from '../common/training/workout-prescription';
import {
  RequestWorkoutCorrectionDto,
  SaveTrainingDto,
  SaveTrainingWeekPlanDto,
} from './block-assignment.dto';
import {
  exerciseInfo,
  plannedSets,
  setKey,
  trainingSessionInclude,
  trainingStatus,
  validatePerformed,
} from './training-state';

const assignmentTree = {
  scheduleOverrides: true,
  program: {
    include: {
      blocks: {
        orderBy: { order: 'asc' as const },
        include: {
          weeks: {
            orderBy: { order: 'asc' as const },
            include: {
              sessions: {
                orderBy: { order: 'asc' as const },
                include: {
                  sessionExercises: {
                    orderBy: { order: 'asc' as const },
                    include: {
                      exercise: true,
                      programmedSets: { orderBy: { order: 'asc' as const } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProgramAssignmentInclude;

type AssignmentSchedule = {
  id: string;
  studentId: string;
  status: string;
  startDate: Date | null;
  scheduleOverrides: { sessionId: string; scheduledDate: Date }[];
  program: {
    blocks: {
      weeks: { sessions: { id: string; dayOfWeek: number | null }[] }[];
    }[];
  };
};

type WorkoutClosure = {
  structuredExecution: boolean;
  finishedAt: Date | null;
  durationMinutes: number | null;
};

function isWorkoutFinished(log: WorkoutClosure | null | undefined) {
  if (!log) return false;
  return log.structuredExecution
    ? log.finishedAt != null
    : log.durationMinutes != null;
}

@Injectable()
export class TrainingService {
  constructor(private readonly prisma: PrismaService) {}
  async student(user: AuthenticatedUser, studentId: string) {
    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: 'STUDENT',
        ...(user.role === Role.COACH
          ? { coachId: user.id }
          : { id: user.id === studentId ? studentId : '' }),
      },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Alumno no encontrado');
  }
  async overview(
    user: AuthenticatedUser,
    studentId: string,
    includeClosed = false,
  ) {
    await this.student(user, studentId);
    const assignments = await this.prisma.programAssignment.findMany({
      where: {
        studentId,
        ...(includeClosed ? {} : { status: 'ACTIVE' as const }),
        program: { isActive: true },
      },
      orderBy: { assignedAt: 'desc' },
      include: assignmentTree,
    });
    const dismissedSessions = await this.prisma.$queryRaw<
      { assignmentId: string; sessionId: string }[]
    >`SELECT "program_assignment_id" AS "assignmentId", "session_id" AS "sessionId"
      FROM "training_session_dismissals"
      WHERE "student_id" = ${studentId}`;
    const dismissedSessionKeys = new Set(
      dismissedSessions.map((item) => `${item.assignmentId}:${item.sessionId}`),
    );
    const logs = await this.prisma.workoutLog.findMany({
      where: {
        studentId,
        OR: [
          { programAssignmentId: { in: assignments.map((a) => a.id) } },
          {
            programAssignmentId: null,
            sessionId: {
              in: assignments.flatMap((a) =>
                a.program.blocks.flatMap((b) =>
                  b.weeks.flatMap((w) => w.sessions.map((s) => s.id)),
                ),
              ),
            },
            durationMinutes: { not: null },
          },
        ],
      },
      select: {
        id: true,
        sessionId: true,
        programAssignmentId: true,
        completionStatus: true,
        structuredExecution: true,
        finishedAt: true,
        durationMinutes: true,
        performedAt: true,
        omittedSets: true,
        _count: { select: { setLogs: true } },
      },
      orderBy: { performedAt: 'desc' },
    });
    const recentWorkoutHistory = await this.prisma.workoutLog.findMany({
      where: {
        studentId,
        OR: [{ finishedAt: { not: null } }, { durationMinutes: { not: null } }],
      },
      select: { performedAt: true },
      orderBy: { performedAt: 'desc' },
      take: 12,
    });
    const weekPlans = await this.prisma.trainingWeekPlan.findMany({
      where: {
        studentId,
        programAssignmentId: {
          in: assignments.map((assignment) => assignment.id),
        },
      },
    });
    // Unscoped history signals uncertainty; it must never count for a cycle.
    const ambiguousSessions = new Set(
      logs
        .filter((l) => l.programAssignmentId === null && isWorkoutFinished(l))
        .map((l) => l.sessionId),
    );
    const today = todayDate();
    const baseSessions = assignments
      .flatMap((a) => {
        let wi = 0;
        return a.program.blocks.flatMap((b, bi) =>
          b.weeks.flatMap((w) => {
            const index = wi++;
            return w.sessions.map((s) => {
              const ownLogs = logs.filter(
                (l) => l.programAssignmentId === a.id && l.sessionId === s.id,
              );
              // Historical sessions can have multiple logs. A later open log
              // does not erase an already finalized occurrence in this cycle.
              const log = ownLogs.find(isWorkoutFinished) ?? ownLogs[0];
              const finished = isWorkoutFinished(log);
              const total = s.sessionExercises.reduce(
                (n, e) => n + plannedSets(e).length,
                0,
              );
              const recorded = log?._count.setLogs ?? 0;
              const override = a.scheduleOverrides.find(
                (o) => o.sessionId === s.id,
              );
              const scheduledDate = effectiveSessionDate(
                a.startDate,
                index,
                s.dayOfWeek,
                override,
              );
              const week = assignmentWeekBounds(a.startDate, index);
              const weekState = assignmentWeekState(a.startDate, index, today);
              const expired = weekState === 'EXPIRED';
              const activeWeek = weekState === 'ACTIVE';
              let status = log
                ? finished
                  ? log.completionStatus
                  : trainingStatus(
                      total,
                      recorded,
                      recorded +
                        (Array.isArray(log.omittedSets)
                          ? log.omittedSets.length
                          : 0),
                      finished,
                    )
                : 'NOT_STARTED';
              if (expired && status === 'NOT_STARTED') status = 'SKIPPED';
              const availability = finished
                ? ('COMPLETED' as const)
                : a.status !== 'ACTIVE'
                  ? ('HISTORICAL' as const)
                  : expired
                    ? ('EXPIRED' as const)
                    : activeWeek
                      ? log
                        ? log.structuredExecution
                          ? ('IN_PROGRESS' as const)
                          : ('HISTORICAL' as const)
                        : ('AVAILABLE' as const)
                      : week
                        ? ('FUTURE' as const)
                        : ('UNSCHEDULED' as const);
              return {
                id: `${a.id}:${s.id}`,
                assignmentId: a.id,
                sessionId: s.id,
                name: s.name,
                programName: a.program.name,
                blockName: b.name,
                blockId: b.id,
                blockIndex: bi,
                weekNumber: index + 1,
                prescribedWeekIndex: index,
                dayNumber: s.order,
                date: scheduledDate,
                suggestedDate: scheduledDate,
                weekStart: week?.weekStart ?? null,
                availableFrom: week?.availableFrom ?? null,
                weekEnd: week?.weekEnd ?? null,
                originalDate:
                  override?.originalDate.toISOString().slice(0, 10) ?? null,
                rescheduled: Boolean(override),
                completed: finished && status === 'COMPLETED',
                historyAmbiguous: ambiguousSessions.has(s.id),
                status,
                recordedSets: recorded,
                totalSets: total,
                finished,
                actualDate: log ? todayDate(log.performedAt) : null,
                availability,
                canStart: availability === 'AVAILABLE',
                startBlockedReason:
                  availability === 'FUTURE'
                    ? 'Disponible cuando comience su semana.'
                    : availability === 'EXPIRED'
                      ? 'La semana de esta sesión ya terminó.'
                      : availability === 'HISTORICAL'
                        ? 'Este ciclo está cerrado.'
                        : availability === 'COMPLETED'
                          ? 'Este entrenamiento ya está finalizado.'
                          : availability === 'UNSCHEDULED'
                            ? 'Esta sesión no tiene una semana disponible.'
                            : null,
                readOnly: availability !== 'IN_PROGRESS',
                canRequestCorrection: expired || finished,
                workoutLogId: log?.id ?? null,
                muscleGroups: [
                  ...new Set(
                    s.sessionExercises.flatMap(
                      (e) => exerciseInfo(e).muscleGroups,
                    ),
                  ),
                ],
                exerciseCount: s.sessionExercises.length,
                legacy: !a.snapshotBlockId,
                cycleStatus: a.status,
              };
            });
          }),
        );
      })
      .sort(
        (a, b) =>
          a.prescribedWeekIndex - b.prescribedWeekIndex ||
          a.dayNumber - b.dayNumber,
      );
    // Keep overview and detail coherent with the existing single-open-workout
    // rule. The in-progress session remains actionable; its weekly siblings
    // are visible but cannot advertise a start that the backend will reject.
    const assignmentsWithOpenWorkout = new Set(
      baseSessions
        .filter((session) => session.availability === 'IN_PROGRESS')
        .map((session) => session.assignmentId),
    );
    const sessions = baseSessions.map((session) =>
      assignmentsWithOpenWorkout.has(session.assignmentId) &&
      session.availability === 'AVAILABLE'
        ? {
            ...session,
            availability: 'BLOCKED' as const,
            canStart: false,
            startBlockedReason:
              'Finaliza u omite el entrenamiento activo antes de iniciar otro.',
            readOnly: true,
          }
        : session,
    );
    const active = sessions.filter((s) => s.cycleStatus === 'ACTIVE');
    const nextSession =
      active.find((s) => s.availability === 'IN_PROGRESS') ??
      active.find((s) => s.availability === 'AVAILABLE') ??
      null;
    const pendingSession =
      [...active]
        .reverse()
        .find(
          (s) =>
            s.availability === 'EXPIRED' &&
            !s.finished &&
            s.status !== 'COMPLETED' &&
            !dismissedSessionKeys.has(`${s.assignmentId}:${s.sessionId}`),
        ) ?? null;
    const assignmentRows = assignments.map((a) => {
      let globalWeek = 0;
      const weeks = a.program.blocks.flatMap((b) =>
        b.weeks.map((week) => ({
          blockName: b.name,
          weekNumber: ++globalWeek,
          prescribedSessions: week.sessions.length,
        })),
      );
      const index = assignmentWeekIndex(a.startDate, today);
      const currentBounds =
        index >= 0 ? assignmentWeekBounds(a.startDate, index) : null;
      const own = sessions.filter((s) => s.assignmentId === a.id);
      return {
        id: a.id,
        programId: a.programId,
        name: a.program.name,
        sourceBlockId: a.sourceBlockId,
        snapshotBlockId: a.snapshotBlockId,
        startDate: a.startDate,
        status: a.status,
        legacy: !a.snapshotBlockId,
        weekCount: weeks.length,
        currentWeek:
          weeks[index] && currentBounds
            ? { ...weeks[index], ...currentBounds }
            : null,
        finishedSessions: own.filter((s) => s.finished).length,
        totalSessions: own.length,
        // Adherence measures finalized scheduled sessions (including partial
        // and skipped), separately from full prescription completion.
        adherence: {
          ...computeAdherence(
            a.startDate,
            own.map((s) => ({
              ...s,
              completed: s.finished,
              weekEnd: s.weekEnd,
            })),
            today,
          ),
          fullyCompletedSessions: own.filter(
            (s) => s.weekEnd && s.weekEnd < today && s.status === 'COMPLETED',
          ).length,
          skippedSessions: own.filter(
            (s) => s.weekEnd && s.weekEnd < today && s.status === 'SKIPPED',
          ).length,
          expiredPartialSessions: own.filter(
            (s) => s.weekEnd && s.weekEnd < today && s.status === 'PARTIAL',
          ).length,
          actionableSessions: own.filter(
            (s) =>
              s.availability === 'AVAILABLE' ||
              s.availability === 'IN_PROGRESS',
          ).length,
        },
      };
    });
    const activeAssignment = assignmentRows.find(
      (assignment) => assignment.status === 'ACTIVE' && assignment.currentWeek,
    );
    const activeWeekIndex = activeAssignment
      ? assignmentWeekIndex(activeAssignment.startDate, today)
      : -1;
    const storedPlan = activeAssignment
      ? weekPlans.find(
          (plan) =>
            plan.programAssignmentId === activeAssignment.id &&
            plan.weekIndex === activeWeekIndex,
        )
      : null;
    const trainingDates = Array.isArray(storedPlan?.trainingDates)
      ? storedPlan.trainingDates.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const prescribedSessions =
      activeAssignment?.currentWeek?.prescribedSessions ?? 0;
    const weekPlan =
      activeAssignment?.currentWeek && activeWeekIndex >= 0
        ? {
            assignmentId: activeAssignment.id,
            weekIndex: activeWeekIndex,
            weekStart: activeAssignment.currentWeek.weekStart,
            availableFrom: activeAssignment.currentWeek.availableFrom,
            weekEnd: activeAssignment.currentWeek.weekEnd,
            prescribedSessions,
            trainingDates,
            revision: storedPlan?.revision ?? 0,
            recommendedDates: recommendTrainingDates(
              activeAssignment.currentWeek.availableFrom,
              activeAssignment.currentWeek.weekEnd,
              prescribedSessions,
              today,
            ),
            assessment: assessTrainingWeek(
              trainingDates,
              prescribedSessions,
              recentWorkoutHistory
                .filter((log) => log.performedAt instanceof Date)
                .map((log) => todayDate(log.performedAt)),
            ),
          }
        : null;
    return {
      today,
      sessions,
      nextSession,
      pendingSession,
      assignments: assignmentRows,
      weekPlan,
    };
  }

  async saveWeekPlan(user: AuthenticatedUser, dto: SaveTrainingWeekPlanDto) {
    if (user.role !== Role.STUDENT)
      throw new NotFoundException('Plan semanal no encontrado');
    const today = todayDate();
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.programAssignment.findFirst({
        where: {
          id: dto.assignmentId,
          studentId: user.id,
          status: 'ACTIVE',
          program: { isActive: true },
        },
        include: assignmentTree,
      });
      if (!assignment)
        throw new NotFoundException('Plan semanal no encontrado');
      const currentWeekIndex = assignmentWeekIndex(assignment.startDate, today);
      const bounds = assignmentWeekBounds(
        assignment.startDate,
        currentWeekIndex,
      );
      if (
        currentWeekIndex < 0 ||
        dto.weekIndex !== currentWeekIndex ||
        !bounds ||
        assignmentWeekState(assignment.startDate, currentWeekIndex, today) !==
          'ACTIVE'
      )
        throw new BadRequestException(
          'Solo puedes organizar la semana que está activa.',
        );
      const weeks = assignment.program.blocks.flatMap((block) => block.weeks);
      const prescribedSessions = weeks[currentWeekIndex]?.sessions.length ?? 0;
      const trainingDates = [...new Set(dto.trainingDates)].sort();
      if (trainingDates.length !== dto.trainingDates.length)
        throw new BadRequestException('No repitas días de entrenamiento.');
      if (trainingDates.length > prescribedSessions)
        throw new BadRequestException(
          'No puedes planificar más días que sesiones prescritas.',
        );
      if (
        trainingDates.some(
          (date) => date < bounds.availableFrom || date > bounds.weekEnd,
        )
      )
        throw new BadRequestException(
          'Los días deben pertenecer a la semana activa.',
        );
      const current = await tx.trainingWeekPlan.findUnique({
        where: {
          programAssignmentId_weekIndex: {
            programAssignmentId: assignment.id,
            weekIndex: currentWeekIndex,
          },
        },
      });
      if ((current?.revision ?? 0) !== dto.revision)
        throw new ConflictException(
          'El plan semanal cambió. Recarga antes de guardar nuevamente.',
        );
      let saved = null;
      if (trainingDates.length) {
        saved = current
          ? await tx.trainingWeekPlan.update({
              where: { id: current.id },
              data: {
                trainingDates,
                revision: { increment: 1 },
              },
            })
          : await tx.trainingWeekPlan.create({
              data: {
                programAssignmentId: assignment.id,
                studentId: user.id,
                weekIndex: currentWeekIndex,
                trainingDates,
              },
            });
      } else if (current) {
        await tx.trainingWeekPlan.delete({ where: { id: current.id } });
      }
      const recentLogs = await tx.workoutLog.findMany({
        where: {
          studentId: user.id,
          OR: [
            { finishedAt: { not: null } },
            { durationMinutes: { not: null } },
          ],
        },
        select: { performedAt: true },
        orderBy: { performedAt: 'desc' },
        take: 12,
      });
      const assessment = assessTrainingWeek(
        trainingDates,
        prescribedSessions,
        recentLogs.map((log) => todayDate(log.performedAt)),
      );
      const student = await tx.user.findUnique({
        where: { id: user.id },
        select: { coachId: true, name: true },
      });
      if (
        student?.coachId &&
        (assessment.level === 'CAUTION' || assessment.level === 'HIGH')
      ) {
        const dedupeKey = `training-plan:${assignment.id}:${currentWeekIndex}:${assessment.code}`;
        await tx.notification.upsert({
          where: { dedupeKey },
          create: {
            userId: student.coachId,
            type: 'TRAINING_PLAN_WARNING',
            title: `Revisar organización de ${student.name}`,
            body: assessment.message,
            resourceType: 'training-week-plan',
            resourceId: assignment.id,
            dedupeKey,
          },
          update: { body: assessment.message, readAt: null },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: trainingDates.length
            ? 'TRAINING_WEEK_PLAN_SAVED'
            : 'TRAINING_WEEK_PLAN_CLEARED',
          entityType: 'ProgramAssignment',
          entityId: assignment.id,
          metadata: {
            weekIndex: currentWeekIndex,
            trainingDates,
            assessment: assessment.code,
          },
        },
      });
      return {
        assignmentId: assignment.id,
        weekIndex: currentWeekIndex,
        weekStart: bounds.weekStart,
        availableFrom: bounds.availableFrom,
        weekEnd: bounds.weekEnd,
        prescribedSessions,
        trainingDates,
        revision: saved?.revision ?? 0,
        recommendedDates: recommendTrainingDates(
          bounds.availableFrom,
          bounds.weekEnd,
          prescribedSessions,
          today,
        ),
        assessment,
      };
    });
  }
  private async sessionContext(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    sessionId: string,
    assignmentId?: string,
  ) {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: trainingSessionInclude,
    });
    if (!session?.week.block.programId)
      throw new NotFoundException('Sesión no encontrada');
    const assignment = await tx.programAssignment.findFirst({
      where: {
        programId: session.week.block.programId,
        ...(assignmentId ? { id: assignmentId } : {}),
        ...(user.role === Role.STUDENT
          ? { studentId: user.id }
          : { program: { coachId: user.id }, student: { coachId: user.id } }),
      },
      orderBy: [{ status: 'asc' }, { assignedAt: 'desc' }],
      include: assignmentTree,
    });
    if (!assignment) throw new NotFoundException('Sesión no encontrada');
    return { session, assignment };
  }
  private schedule(assignment: AssignmentSchedule) {
    let weekIndex = 0;
    return assignment.program.blocks
      .flatMap((block) =>
        block.weeks.flatMap((week) => {
          const index = weekIndex++;
          return week.sessions.map((session) => ({
            sessionId: session.id,
            weekIndex: index,
            ...assignmentWeekBounds(assignment.startDate, index),
            date: effectiveSessionDate(
              assignment.startDate,
              index,
              session.dayOfWeek,
              assignment.scheduleOverrides.find(
                (override) => override.sessionId === session.id,
              ),
            ),
          }));
        }),
      )
      .sort((a, b) => a.weekIndex - b.weekIndex);
  }
  private sessionTiming(
    assignment: AssignmentSchedule,
    sessionId: string,
    today = todayDate(),
  ) {
    const timing = this.schedule(assignment).find(
      (item) => item.sessionId === sessionId,
    );
    if (!timing) return { ...timing, state: 'UNSCHEDULED' as const };
    return {
      ...timing,
      state:
        assignmentWeekState(assignment.startDate, timing.weekIndex, today) ??
        ('UNSCHEDULED' as const),
    };
  }
  private async otherActiveWorkout(
    tx: Prisma.TransactionClient,
    assignment: AssignmentSchedule,
    sessionId: string,
    today: string,
  ) {
    const activeSessionIds = this.schedule(assignment)
      .filter(
        (item) =>
          item.availableFrom &&
          item.weekEnd &&
          item.availableFrom <= today &&
          item.weekEnd >= today &&
          item.sessionId !== sessionId,
      )
      .map((item) => item.sessionId);
    if (!activeSessionIds.length) return null;
    return tx.workoutLog.findFirst({
      where: {
        studentId: assignment.studentId,
        programAssignmentId: assignment.id,
        sessionId: { in: activeSessionIds },
        structuredExecution: true,
        finishedAt: null,
      },
      select: { id: true },
    });
  }
  async detail(user: AuthenticatedUser, id: string, assignmentId?: string) {
    const { session, assignment } = await this.sessionContext(
      this.prisma,
      user,
      id,
      assignmentId,
    );
    const log = await this.prisma.workoutLog.findFirst({
      where: {
        studentId: assignment.studentId,
        sessionId: id,
        programAssignmentId: assignment.id,
      },
      orderBy: { performedAt: 'desc' },
      include: { setLogs: true, prescriptions: true },
    });
    const omitted = (
      Array.isArray(log?.omittedSets) ? log.omittedSets : []
    ) as { sessionExerciseId: string; setNumber: number }[];
    const exercises = session.sessionExercises.map((e) => {
      const info = exerciseInfo(e);
      const modifiers = (Array.isArray(e.modifiers) ? e.modifiers : []) as {
        name: string;
      }[];
      const sets = plannedSets(e).map((p) => {
        const performed = log?.setLogs.find(
          (s) => s.sessionExerciseId === e.id && s.setNumber === p.setNumber,
        );
        const skipped = omitted.some(
          (s) => s.sessionExerciseId === e.id && s.setNumber === p.setNumber,
        );
        return {
          ...p,
          status: performed ? 'RECORDED' : skipped ? 'SKIPPED' : 'PENDING',
          actual: performed
            ? {
                weight:
                  performed.actualLoad === null
                    ? null
                    : Number(performed.actualLoad),
                reps: performed.actualReps,
                rpe:
                  performed.actualRpe === null
                    ? null
                    : Number(performed.actualRpe),
              }
            : { weight: null, reps: null, rpe: null },
        };
      });
      return {
        id: e.id,
        exerciseId: e.exerciseId,
        name: [...modifiers.map((m) => m.name), info.name].join(' '),
        baseName: info.name,
        modifiers,
        muscleGroups: info.muscleGroups,
        notes: log?.prescriptionCapturedAt
          ? (log.prescriptions.find((p) => p.sessionExerciseId === e.id)
              ?.notes ?? null)
          : e.notes,
        videoUrl: info.videoUrl,
        instructions: info.instructions,
        sets,
        status: trainingStatus(
          sets.length,
          sets.filter((s) => s.status === 'RECORDED').length,
          sets.filter((s) => s.status !== 'PENDING').length,
          isWorkoutFinished(log),
        ),
      };
    });
    const allSets = exercises.flatMap((e) => e.sets);
    const today = todayDate();
    const timing = this.sessionTiming(assignment, id, today);
    const scheduledDate = timing?.date ?? null;
    const finished = isWorkoutFinished(log);
    const expired = timing?.state === 'EXPIRED';
    const calculatedStatus = trainingStatus(
      allSets.length,
      allSets.filter((s) => s.status === 'RECORDED').length,
      allSets.filter((s) => s.status !== 'PENDING').length,
      finished,
    );
    const status =
      expired && calculatedStatus === 'NOT_STARTED'
        ? 'SKIPPED'
        : calculatedStatus;
    const otherwiseStartable =
      user.role === Role.STUDENT &&
      assignment.status === 'ACTIVE' &&
      timing?.state === 'ACTIVE' &&
      !log;
    const otherOpen = otherwiseStartable
      ? await this.otherActiveWorkout(this.prisma, assignment, id, today)
      : null;
    const canStart = otherwiseStartable && !otherOpen;
    const availability = finished
      ? ('COMPLETED' as const)
      : assignment.status !== 'ACTIVE'
        ? ('HISTORICAL' as const)
        : timing?.state === 'EXPIRED'
          ? ('EXPIRED' as const)
          : timing?.state === 'FUTURE'
            ? ('FUTURE' as const)
            : timing?.state !== 'ACTIVE'
              ? ('UNSCHEDULED' as const)
              : log
                ? ('IN_PROGRESS' as const)
                : otherOpen
                  ? ('BLOCKED' as const)
                  : ('AVAILABLE' as const);
    const startBlockedReason =
      availability === 'FUTURE'
        ? 'Esta sesión se habilitará cuando comience su semana.'
        : availability === 'EXPIRED'
          ? 'La semana de esta sesión ya terminó.'
          : availability === 'BLOCKED'
            ? 'Finaliza u omite el entrenamiento activo antes de iniciar otro.'
            : availability === 'HISTORICAL'
              ? 'Este ciclo está cerrado.'
              : availability === 'COMPLETED'
                ? 'Este entrenamiento ya está finalizado.'
                : availability === 'UNSCHEDULED'
                  ? 'Esta sesión no tiene una semana disponible.'
                  : null;
    return {
      id: session.id,
      name: session.name,
      blockName: session.week.block.name,
      assignmentId: assignment.id,
      studentId: assignment.studentId,
      weekNumber: session.week.number,
      dayNumber: session.order,
      cycleStatus: assignment.status,
      legacy: !assignment.snapshotBlockId,
      revision: log?.revision ?? 0,
      workoutLogId: log?.id ?? null,
      durationMinutes: log?.durationMinutes ?? null,
      finishedAt: log?.finishedAt ?? null,
      finished,
      scheduledDate,
      suggestedDate: scheduledDate,
      weekStart: timing?.weekStart ?? null,
      availableFrom: timing?.availableFrom ?? null,
      weekEnd: timing?.weekEnd ?? null,
      actualDate: log ? todayDate(log.performedAt) : null,
      exercises,
      status,
      canRequestCorrection: expired || finished,
      availability,
      canStart,
      canStartEarly: false,
      startBlockedReason,
      readOnly:
        user.role === Role.COACH ||
        assignment.status !== 'ACTIVE' ||
        timing?.state !== 'ACTIVE' ||
        finished ||
        !log ||
        (!!log && !log.structuredExecution),
    };
  }
  async start(user: AuthenticatedUser, id: string, assignmentId?: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const { session, assignment } = await this.sessionContext(
        tx,
        user,
        id,
        assignmentId,
      );
      if (assignment.status !== 'ACTIVE')
        throw new ConflictException('Este ciclo está cerrado');
      const today = todayDate();
      const timing = this.sessionTiming(assignment, id, today);
      if (timing?.state === 'EXPIRED')
        throw new ConflictException(
          'Este entrenamiento ya está cerrado y no puede iniciarse',
        );
      if (timing?.state !== 'ACTIVE')
        throw new ConflictException(
          'Este entrenamiento todavía no está disponible',
        );
      const existing = await tx.workoutLog.findFirst({
        where: {
          studentId: user.id,
          sessionId: id,
          programAssignmentId: assignment.id,
        },
        orderBy: { performedAt: 'desc' },
      });
      if (isWorkoutFinished(existing))
        throw new ConflictException('Este entrenamiento ya está finalizado');
      if (existing && !existing.structuredExecution)
        throw new ConflictException(
          'Este registro es histórico. Consulta su detalle en el historial.',
        );
      const otherOpen = await this.otherActiveWorkout(
        tx,
        assignment,
        id,
        today,
      );
      if (otherOpen)
        throw new ConflictException(
          'Finaliza u omite el entrenamiento activo antes de iniciar otro',
        );
      if (!existing)
        await tx.workoutLog.create({
          data: {
            studentId: user.id,
            sessionId: id,
            programAssignmentId: assignment.id,
            structuredExecution: true,
            completionStatus: 'PARTIAL',
            durationMinutes: null,
            prescriptionCapturedAt: new Date(),
            prescriptions: {
              create: session.sessionExercises.map((exercise) => ({
                ...capturePrescription(exercise),
                exerciseName: exerciseInfo(exercise).name,
              })),
            },
          },
        });
    });
    return this.detail(user, id, assignmentId);
  }

  async dismissExpired(
    user: AuthenticatedUser,
    id: string,
    assignmentId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const { assignment } = await this.sessionContext(
        tx,
        user,
        id,
        assignmentId,
      );
      if (assignment.studentId !== user.id)
        throw new NotFoundException('Sesión no encontrada');
      const today = todayDate();
      const timing = this.sessionTiming(assignment, id, today);
      if (timing?.state !== 'EXPIRED')
        throw new ConflictException(
          'Solo puedes omitir este aviso para un entrenamiento vencido',
        );
      await tx.$executeRaw`INSERT INTO "training_session_dismissals"
        ("id", "program_assignment_id", "session_id", "student_id")
        VALUES (${randomUUID()}, ${assignment.id}, ${id}, ${user.id})
        ON CONFLICT ("program_assignment_id", "session_id") DO NOTHING`;
    });
    return { dismissed: true };
  }

  async closeExpired(
    user: AuthenticatedUser,
    id: string,
    assignmentId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const { session, assignment } = await this.sessionContext(
        tx,
        user,
        id,
        assignmentId,
      );
      if (assignment.studentId !== user.id)
        throw new NotFoundException('Sesión no encontrada');
      const timing = this.sessionTiming(assignment, id);
      const existing = await tx.workoutLog.findFirst({
        where: {
          studentId: user.id,
          sessionId: id,
          programAssignmentId: assignment.id,
        },
        orderBy: { performedAt: 'desc' },
        include: { setLogs: true },
      });
      if (timing?.state !== 'EXPIRED')
        throw new ConflictException(
          'Solo puedes cerrar rápidamente un entrenamiento vencido',
        );
      if (isWorkoutFinished(existing)) return;

      const prescribed = session.sessionExercises.flatMap((exercise) =>
        plannedSets(exercise).map((set) => ({
          sessionExerciseId: exercise.id,
          setNumber: set.setNumber,
        })),
      );
      const recordedKeys = new Set(
        existing?.setLogs.map((set) =>
          setKey(set.sessionExerciseId, set.setNumber),
        ) ?? [],
      );
      const omittedSets = prescribed.filter(
        (set) =>
          !recordedKeys.has(setKey(set.sessionExerciseId, set.setNumber)),
      );
      const status = trainingStatus(
        prescribed.length,
        recordedKeys.size,
        prescribed.length,
        true,
      );
      const finishedAt = new Date();
      if (!existing) {
        await tx.workoutLog.create({
          data: {
            studentId: user.id,
            sessionId: id,
            programAssignmentId: assignment.id,
            structuredExecution: true,
            // This is an omission closed now, not a workout performed on its
            // former suggested day.
            performedAt: finishedAt,
            finishedAt,
            durationMinutes: null,
            revision: 1,
            completionStatus: 'SKIPPED',
            omittedSets,
            prescriptionCapturedAt: finishedAt,
            prescriptions: {
              create: session.sessionExercises.map((exercise) => ({
                ...capturePrescription(exercise),
                exerciseName: exerciseInfo(exercise).name,
              })),
            },
          },
        });
        return;
      }
      const annotationDates = existing.setLogs
        .map((set) => set.createdAt)
        .sort((a, b) => a.getTime() - b.getTime());
      const first = annotationDates.at(0);
      const last = annotationDates.at(-1);
      await tx.workoutLog.update({
        where: { id: existing.id },
        data: {
          revision: { increment: 1 },
          finishedAt,
          durationMinutes:
            first && last && last.getTime() > first.getTime()
              ? Math.round((last.getTime() - first.getTime()) / 60000)
              : null,
          completionStatus:
            status === 'NOT_STARTED' ? ('SKIPPED' as const) : status,
          omittedSets,
        },
      });
    });
    return this.detail(user, id, assignmentId);
  }

  async save(user: AuthenticatedUser, id: string, dto: SaveTrainingDto) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        const { session, assignment } = await this.sessionContext(
          tx,
          user,
          id,
          dto.assignmentId,
        );
        if (user.role !== Role.STUDENT || assignment.studentId !== user.id)
          throw new NotFoundException('Sesión no encontrada');
        if (assignment.status !== 'ACTIVE')
          throw new ConflictException(
            'Este ciclo está cerrado; el historial es de solo lectura',
          );
        // Old assignments are available in the new interface, but their original logs are never rewritten.
        const existing = await tx.workoutLog.findFirst({
          where: {
            studentId: user.id,
            sessionId: id,
            programAssignmentId: assignment.id,
          },
          orderBy: { performedAt: 'desc' },
        });
        const today = todayDate();
        const timing = this.sessionTiming(assignment, id, today);
        if (timing?.state === 'EXPIRED')
          throw new ConflictException(
            'Este entrenamiento ya está cerrado. Solicita una corrección a tu coach.',
          );
        if (timing?.state !== 'ACTIVE')
          throw new ConflictException(
            'Este entrenamiento todavía no está disponible',
          );
        if (isWorkoutFinished(existing))
          throw new ConflictException(
            'Un entrenamiento finalizado solo puede cambiar mediante una corrección autorizada',
          );
        if (!existing)
          throw new ConflictException(
            'Inicia expresamente el entrenamiento antes de registrar series',
          );
        const otherOpen = await this.otherActiveWorkout(
          tx,
          assignment,
          id,
          today,
        );
        if (otherOpen)
          throw new ConflictException(
            'Finaliza u omite el entrenamiento activo antes de modificar otro',
          );
        if (existing && !existing.structuredExecution)
          throw new ConflictException(
            'Este registro es histórico. Consulta su detalle en el historial.',
          );
        if ((existing?.revision ?? 0) !== dto.revision)
          throw new ConflictException(
            'El registro cambió en otra pestaña. Recarga antes de continuar.',
          );
        const total = validatePerformed(session.sessionExercises, dto.sets);
        const sets = [...dto.sets];
        const finishing = dto.finish || isWorkoutFinished(existing);
        if (finishing) {
          const decided = new Set(
            sets.map((s) => setKey(s.sessionExerciseId, s.setNumber)),
          );
          for (const e of session.sessionExercises)
            for (const s of plannedSets(e)) {
              if (!decided.has(setKey(e.id, s.setNumber)))
                sets.push({
                  sessionExerciseId: e.id,
                  setNumber: s.setNumber,
                  status: 'SKIPPED',
                });
            }
        }
        if (!sets.length && !dto.finish && !existing)
          throw new BadRequestException(
            'Registra u omite una serie antes de guardar',
          );
        const performed = sets.filter((s) => s.status === 'RECORDED');
        const status = trainingStatus(
          total,
          performed.length,
          sets.length,
          finishing,
        );
        const omittedSets = sets
          .filter((s) => s.status === 'SKIPPED')
          .map((s) => ({
            sessionExerciseId: s.sessionExerciseId,
            setNumber: s.setNumber,
          }));
        const log = existing
          ? existing
          : await tx.workoutLog.create({
              data: {
                studentId: user.id,
                sessionId: id,
                programAssignmentId: assignment.id,
                structuredExecution: true,
                completionStatus:
                  status === 'NOT_STARTED' ? ('PARTIAL' as const) : status,
                omittedSets,
                prescriptionCapturedAt: new Date(),
                prescriptions: {
                  create: session.sessionExercises.map((e) => ({
                    ...capturePrescription(e),
                    exerciseName: exerciseInfo(e).name,
                  })),
                },
              },
            });
        // Keep identity/creation time of recorded sets when saving another set.
        // Only an explicit omission or return to pending removes a SetLog.
        await tx.setLog.deleteMany({
          where: {
            workoutLogId: log.id,
            ...(performed.length
              ? {
                  NOT: {
                    OR: performed.map((s) => ({
                      sessionExerciseId: s.sessionExerciseId,
                      setNumber: s.setNumber,
                    })),
                  },
                }
              : {}),
          },
        });
        for (const s of performed) {
          const identity = {
            workoutLogId: log.id,
            sessionExerciseId: s.sessionExerciseId,
            setNumber: s.setNumber,
          };
          const actual = {
            actualLoad: s.weight ?? null,
            actualReps: s.reps ?? null,
            actualRpe: s.rpe ?? null,
          };
          await tx.setLog.upsert({
            where: { workoutLogId_sessionExerciseId_setNumber: identity },
            create: { ...identity, ...actual },
            update: actual,
          });
        }
        const annotations = await tx.setLog.findMany({
          where: { workoutLogId: log.id },
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
        });
        const firstAnnotation = annotations.at(0)?.createdAt;
        const lastAnnotation = annotations.at(-1)?.createdAt;
        const durationMinutes =
          annotations.length >= 2 &&
          firstAnnotation instanceof Date &&
          lastAnnotation instanceof Date &&
          lastAnnotation.getTime() > firstAnnotation.getTime()
            ? Math.round(
                (lastAnnotation.getTime() - firstAnnotation.getTime()) / 60000,
              )
            : null;
        await tx.workoutLog.update({
          where: { id: log.id },
          data: {
            revision: (existing?.revision ?? 0) + 1,
            completionStatus:
              status === 'NOT_STARTED' ? ('PARTIAL' as const) : status,
            omittedSets,
            durationMinutes,
            finishedAt: finishing ? (existing?.finishedAt ?? new Date()) : null,
          },
        });
      },
      { timeout: 30000 },
    );
    return this.detail(user, id, dto.assignmentId);
  }

  async requestCorrection(
    user: AuthenticatedUser,
    sessionId: string,
    dto: RequestWorkoutCorrectionDto,
  ) {
    const proposedFields = (['weight', 'reps', 'rpe'] as const).filter(
      (field) => dto[field] !== undefined,
    );
    if (!proposedFields.length)
      throw new BadRequestException('Indica al menos un valor para corregir');
    if (dto.reason && dto.reason.trim().length > 500)
      throw new BadRequestException('El motivo es demasiado largo');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM program_assignments WHERE id = ${dto.assignmentId} FOR UPDATE`;
      const { session, assignment } = await this.sessionContext(
        tx,
        user,
        sessionId,
        dto.assignmentId,
      );
      if (!assignment.program.coachId)
        throw new ConflictException('La asignación no tiene un coach válido');
      const timing = this.sessionTiming(assignment, sessionId);
      const scheduledDate = timing?.date ?? null;
      const log = await tx.workoutLog.findFirst({
        where: {
          studentId: user.id,
          sessionId,
          programAssignmentId: assignment.id,
        },
        orderBy: { performedAt: 'desc' },
        include: { setLogs: true },
      });
      const closed = timing?.state === 'EXPIRED' || isWorkoutFinished(log);
      const correctionReferenceDate = scheduledDate ?? timing?.weekEnd ?? null;
      if (!closed || !correctionReferenceDate)
        throw new ConflictException(
          'Solo puedes solicitar correcciones para entrenamientos cerrados',
        );
      const exercise = session.sessionExercises.find(
        (item) => item.id === dto.sessionExerciseId,
      );
      const prescribed = exercise
        ? plannedSets(exercise).find((set) => set.setNumber === dto.setNumber)
        : null;
      if (!exercise || !prescribed)
        throw new BadRequestException(
          'Solo puedes corregir una serie prescrita por tu coach',
        );
      const performed = log?.setLogs.find(
        (set) =>
          set.sessionExerciseId === exercise.id &&
          set.setNumber === dto.setNumber,
      );
      if (!performed && proposedFields.every((field) => dto[field] === null))
        throw new BadRequestException(
          'La corrección de una serie sin registro debe proponer algún valor',
        );
      const duplicate = await tx.workoutCorrectionRequest.findFirst({
        where: {
          programAssignmentId: assignment.id,
          sessionId,
          sessionExerciseId: exercise.id,
          setNumber: dto.setNumber,
          status: 'PENDING',
        },
      });
      if (duplicate)
        throw new ConflictException(
          'Ya existe una solicitud pendiente para esta serie',
        );
      const info = exerciseInfo(exercise);
      const message = await tx.message.create({
        data: {
          senderId: user.id,
          receiverId: assignment.program.coachId,
          sessionId,
          sessionExerciseId: exercise.id,
          body: `Solicitud de corrección de entrenamiento\n${session.name} · ${info.name} · Serie ${dto.setNumber}`,
        },
      });
      const request = await tx.workoutCorrectionRequest.create({
        data: {
          programAssignmentId: assignment.id,
          workoutLogId: log?.id ?? null,
          sessionId,
          sessionExerciseId: exercise.id,
          setNumber: dto.setNumber,
          studentId: user.id,
          coachId: assignment.program.coachId,
          messageId: message.id,
          sessionName: session.name,
          exerciseName: info.name,
          scheduledDate: dateOnly(correctionReferenceDate),
          originalStatus: performed ? 'RECORDED' : 'NO_DATA',
          originalLoad: performed?.actualLoad ?? null,
          originalReps: performed?.actualReps ?? null,
          originalRpe: performed?.actualRpe ?? null,
          proposedLoad: dto.weight ?? null,
          proposedReps: dto.reps ?? null,
          proposedRpe: dto.rpe ?? null,
          proposedFields,
          reason: dto.reason?.trim() || null,
        },
      });
      await tx.notification.create({
        data: {
          userId: assignment.program.coachId,
          type: 'NEW_MESSAGE',
          title: 'Solicitud de corrección de entrenamiento',
          body: `${user.id} solicitó corregir ${session.name}`,
          resourceType: 'message',
          resourceId: user.id,
          dedupeKey: `workout-correction:${request.id}:requested`,
        },
      });
      return request;
    });
  }

  async decideCorrection(
    user: AuthenticatedUser,
    requestId: string,
    decision: 'APPROVE' | 'REJECT',
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM workout_correction_requests WHERE id = ${requestId} FOR UPDATE`;
      const request = await tx.workoutCorrectionRequest.findUnique({
        where: { id: requestId },
        include: {
          session: { include: trainingSessionInclude },
          workoutLog: { include: { setLogs: true } },
        },
      });
      if (!request || request.coachId !== user.id)
        throw new NotFoundException('Solicitud no encontrada');
      if (request.status !== 'PENDING')
        throw new ConflictException('Esta solicitud ya fue procesada');
      const exercise = request.session.sessionExercises.find(
        (item) => item.id === request.sessionExerciseId,
      );
      if (
        !exercise ||
        !plannedSets(exercise).some(
          (set) => set.setNumber === request.setNumber,
        )
      )
        throw new ConflictException('La prescripción original ya no es válida');
      const reviewedAt = new Date();
      if (decision === 'REJECT') {
        const updated = await tx.workoutCorrectionRequest.update({
          where: { id: request.id },
          data: {
            status: 'REJECTED',
            reviewedById: user.id,
            reviewedAt,
          },
        });
        await this.recordCorrectionDecision(tx, request, user.id, false);
        return updated;
      }
      let log = request.workoutLog;
      if (!log) {
        const omittedSets = request.session.sessionExercises.flatMap((item) =>
          plannedSets(item)
            .filter(
              (set) =>
                item.id !== request.sessionExerciseId ||
                set.setNumber !== request.setNumber,
            )
            .map((set) => ({
              sessionExerciseId: item.id,
              setNumber: set.setNumber,
            })),
        );
        log = await tx.workoutLog.create({
          data: {
            studentId: request.studentId,
            sessionId: request.sessionId,
            programAssignmentId: request.programAssignmentId,
            structuredExecution: true,
            // No original execution timestamp exists. Use the real approval
            // instant instead of fabricating one from a suggested date.
            performedAt: reviewedAt,
            finishedAt: reviewedAt,
            durationMinutes: null,
            completionStatus: 'PARTIAL',
            omittedSets,
            prescriptionCapturedAt: reviewedAt,
            prescriptions: {
              create: request.session.sessionExercises.map((item) => ({
                ...capturePrescription(item),
                exerciseName: exerciseInfo(item).name,
              })),
            },
          },
          include: { setLogs: true },
        });
      }
      const current = log.setLogs.find(
        (set) =>
          set.sessionExerciseId === request.sessionExerciseId &&
          set.setNumber === request.setNumber,
      );
      const fields = new Set(request.proposedFields);
      await tx.setLog.upsert({
        where: {
          workoutLogId_sessionExerciseId_setNumber: {
            workoutLogId: log.id,
            sessionExerciseId: request.sessionExerciseId,
            setNumber: request.setNumber,
          },
        },
        create: {
          workoutLogId: log.id,
          sessionExerciseId: request.sessionExerciseId,
          setNumber: request.setNumber,
          actualLoad: fields.has('weight')
            ? request.proposedLoad
            : (current?.actualLoad ?? null),
          actualReps: fields.has('reps')
            ? request.proposedReps
            : (current?.actualReps ?? null),
          actualRpe: fields.has('rpe')
            ? request.proposedRpe
            : (current?.actualRpe ?? null),
        },
        update: {
          actualLoad: fields.has('weight')
            ? request.proposedLoad
            : (current?.actualLoad ?? null),
          actualReps: fields.has('reps')
            ? request.proposedReps
            : (current?.actualReps ?? null),
          actualRpe: fields.has('rpe')
            ? request.proposedRpe
            : (current?.actualRpe ?? null),
        },
      });
      const recorded = await tx.setLog.findMany({
        where: { workoutLogId: log.id },
        select: { sessionExerciseId: true, setNumber: true },
      });
      const recordedKeys = new Set(
        recorded.map((set) => setKey(set.sessionExerciseId, set.setNumber)),
      );
      const omittedSets = request.session.sessionExercises.flatMap((item) =>
        plannedSets(item)
          .filter((set) => !recordedKeys.has(setKey(item.id, set.setNumber)))
          .map((set) => ({
            sessionExerciseId: item.id,
            setNumber: set.setNumber,
          })),
      );
      const total = request.session.sessionExercises.reduce(
        (sum, item) => sum + plannedSets(item).length,
        0,
      );
      const correctedStatus = trainingStatus(
        total,
        recorded.length,
        total,
        true,
      );
      await tx.workoutLog.update({
        where: { id: log.id },
        data: {
          revision: { increment: 1 },
          finishedAt: log.finishedAt ?? reviewedAt,
          completionStatus:
            correctedStatus === 'NOT_STARTED' ? 'PARTIAL' : correctedStatus,
          omittedSets,
        },
      });
      const updated = await tx.workoutCorrectionRequest.update({
        where: { id: request.id },
        data: {
          workoutLogId: log.id,
          status: 'APPROVED',
          reviewedById: user.id,
          reviewedAt,
        },
      });
      await this.recordCorrectionDecision(tx, request, user.id, true);
      return updated;
    });
  }

  private async recordCorrectionDecision(
    tx: Prisma.TransactionClient,
    request: {
      id: string;
      studentId: string;
      coachId: string;
      sessionName: string;
      originalLoad: Prisma.Decimal | null;
      originalReps: number | null;
      originalRpe: Prisma.Decimal | null;
      proposedLoad: Prisma.Decimal | null;
      proposedReps: number | null;
      proposedRpe: Prisma.Decimal | null;
    },
    actorId: string,
    approved: boolean,
  ) {
    const status = approved ? 'Aprobada' : 'Rechazada';
    await tx.message.create({
      data: {
        senderId: request.coachId,
        receiverId: request.studentId,
        body: `Solicitud de corrección ${status.toLocaleLowerCase('es-CL')}\n${request.sessionName}`,
      },
    });
    await tx.notification.create({
      data: {
        userId: request.studentId,
        type: 'NEW_MESSAGE',
        title: `Solicitud de corrección ${status.toLocaleLowerCase('es-CL')}`,
        body: `Tu coach ${approved ? 'aprobó' : 'rechazó'} la solicitud`,
        resourceType: 'message',
        resourceId: request.coachId,
        dedupeKey: `workout-correction:${request.id}:decision`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: approved
          ? 'WORKOUT_CORRECTION_APPROVED'
          : 'WORKOUT_CORRECTION_REJECTED',
        entityType: 'WorkoutCorrectionRequest',
        entityId: request.id,
        metadata: {
          original: {
            load: request.originalLoad?.toString() ?? null,
            reps: request.originalReps,
            rpe: request.originalRpe?.toString() ?? null,
          },
          proposed: {
            load: request.proposedLoad?.toString() ?? null,
            reps: request.proposedReps,
            rpe: request.proposedRpe?.toString() ?? null,
          },
        },
      },
    });
  }
}
