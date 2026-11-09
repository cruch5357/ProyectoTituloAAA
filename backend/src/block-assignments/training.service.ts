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
  dateOnly,
  effectiveSessionDate,
  todayDate,
} from '../common/training/calendar-date';
import { computeAdherence } from '../common/training/adherence';
import { capturePrescription } from '../common/training/workout-prescription';
import {
  RequestWorkoutCorrectionDto,
  SaveTrainingDto,
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
        durationMinutes: true,
        performedAt: true,
        omittedSets: true,
        _count: { select: { setLogs: true } },
      },
      orderBy: { performedAt: 'desc' },
    });
    // Unscoped history signals uncertainty; it must never count for a cycle.
    const ambiguousSessions = new Set(
      logs
        .filter(
          (l) => l.programAssignmentId === null && l.durationMinutes !== null,
        )
        .map((l) => l.sessionId),
    );
    const today = todayDate();
    const sessions = assignments
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
              const log =
                ownLogs.find((l) => l.durationMinutes !== null) ?? ownLogs[0];
              const finished = !!log && log.durationMinutes !== null;
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
              const expired =
                (!!scheduledDate && scheduledDate < today) ||
                (!!log &&
                  log.durationMinutes === null &&
                  todayDate(log.performedAt) < today);
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
                      log.durationMinutes !== null,
                    )
                : 'NOT_STARTED';
              if (expired && status === 'NOT_STARTED') status = 'SKIPPED';
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
                dayNumber: s.order,
                date: scheduledDate,
                originalDate:
                  override?.originalDate.toISOString().slice(0, 10) ?? null,
                rescheduled: Boolean(override),
                completed: finished && status === 'COMPLETED',
                historyAmbiguous: ambiguousSessions.has(s.id),
                status,
                recordedSets: recorded,
                totalSets: total,
                finished,
                readOnly: expired || finished || a.status !== 'ACTIVE',
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
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
    const active = sessions.filter((s) => s.cycleStatus === 'ACTIVE');
    const nextSession =
      active.find((s) => s.date === today && !s.finished && !s.readOnly) ??
      active.find(
        (s) => s.date && s.date > today && !s.finished && !s.readOnly,
      ) ??
      active.find((s) => !s.date && !s.finished && !s.readOnly) ??
      null;
    const pendingSession =
      [...active]
        .reverse()
        .find(
          (s) =>
            s.readOnly &&
            !s.finished &&
            !dismissedSessionKeys.has(`${s.assignmentId}:${s.sessionId}`),
        ) ?? null;
    return {
      today,
      sessions,
      nextSession,
      pendingSession,
      assignments: assignments.map((a) => {
        const weeks = a.program.blocks.flatMap((b) =>
          b.weeks.map((w) => ({ blockName: b.name, weekNumber: w.number })),
        );
        const index = a.startDate
          ? Math.floor(
              (dateOnly(today).getTime() - a.startDate.getTime()) /
                (7 * 86400000),
            )
          : -1;
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
          currentWeek: weeks[index] ?? null,
          finishedSessions: own.filter((s) => s.finished).length,
          totalSessions: own.length,
          // Adherence measures finalized scheduled sessions (including partial
          // and skipped), separately from full prescription completion.
          adherence: {
            ...computeAdherence(
              a.startDate,
              own.map((s) => ({ ...s, completed: s.finished })),
              today,
            ),
            fullyCompletedSessions: own.filter(
              (s) => s.date && s.date <= today && s.status === 'COMPLETED',
            ).length,
            skippedSessions: own.filter(
              (s) => s.date && s.date < today && s.status === 'SKIPPED',
            ).length,
            expiredPartialSessions: own.filter(
              (s) => s.date && s.date < today && s.status === 'PARTIAL',
            ).length,
            actionableSessions: own.filter(
              (s) => s.date && s.date >= today && !s.finished && !s.readOnly,
            ).length,
          },
        };
      }),
    };
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
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  }
  private scheduledDate(assignment: AssignmentSchedule, sessionId: string) {
    return (
      this.schedule(assignment).find((item) => item.sessionId === sessionId)
        ?.date ?? null
    );
  }
  private async nextEligible(
    tx: Prisma.TransactionClient,
    assignment: AssignmentSchedule,
    sessionId: string,
    today: string,
  ) {
    const closed = await tx.workoutLog.findMany({
      where: {
        studentId: assignment.studentId,
        programAssignmentId: assignment.id,
        durationMinutes: { not: null },
      },
      select: { sessionId: true },
    });
    const closedIds = new Set(closed.map((log) => log.sessionId));
    return (
      this.schedule(assignment).find(
        (item) =>
          item.date !== null &&
          item.date >= today &&
          !closedIds.has(item.sessionId),
      )?.sessionId === sessionId
    );
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
          log?.durationMinutes !== null && !!log,
        ),
      };
    });
    const allSets = exercises.flatMap((e) => e.sets);
    const today = todayDate();
    const scheduledDate = this.scheduledDate(assignment, id);
    const expired =
      (!!scheduledDate && scheduledDate < today) ||
      (!!log &&
        log.durationMinutes === null &&
        todayDate(log.performedAt) < today);
    const finished = log?.durationMinutes !== null && !!log;
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
    const nextEligible =
      user.role === Role.STUDENT &&
      assignment.status === 'ACTIVE' &&
      !log &&
      !!scheduledDate &&
      scheduledDate > today &&
      (await this.nextEligible(this.prisma, assignment, id, today));
    const otherOpen = nextEligible
      ? await this.prisma.workoutLog.findFirst({
          where: {
            studentId: user.id,
            structuredExecution: true,
            durationMinutes: null,
            NOT: { programAssignmentId: assignment.id, sessionId: id },
          },
          select: { id: true },
        })
      : null;
    const canStartEarly = nextEligible && !otherOpen;
    const futureNotStarted = !!scheduledDate && scheduledDate > today && !log;
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
      finished,
      scheduledDate,
      actualDate: log ? todayDate(log.performedAt) : null,
      exercises,
      status,
      canRequestCorrection: expired || finished,
      canStartEarly,
      readOnly:
        user.role === Role.COACH ||
        assignment.status !== 'ACTIVE' ||
        expired ||
        finished ||
        futureNotStarted ||
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
      const scheduledDate = this.scheduledDate(assignment, id);
      if (!scheduledDate || scheduledDate < today)
        throw new ConflictException(
          'Este entrenamiento ya está cerrado y no puede iniciarse',
        );
      const existing = await tx.workoutLog.findFirst({
        where: {
          studentId: user.id,
          sessionId: id,
          programAssignmentId: assignment.id,
        },
        orderBy: { performedAt: 'desc' },
      });
      if (existing?.durationMinutes !== null && existing)
        throw new ConflictException('Este entrenamiento ya está finalizado');
      const otherOpen = await tx.workoutLog.findFirst({
        where: {
          studentId: user.id,
          structuredExecution: true,
          durationMinutes: null,
          NOT: { programAssignmentId: assignment.id, sessionId: id },
        },
      });
      if (otherOpen)
        throw new ConflictException(
          'Finaliza u omite el entrenamiento activo antes de iniciar otro',
        );
      if (
        scheduledDate > today &&
        !(await this.nextEligible(tx, assignment, id, today))
      )
        throw new ConflictException(
          'Solo puedes adelantar el siguiente entrenamiento disponible',
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
      const log = await tx.workoutLog.findFirst({
        where: {
          studentId: user.id,
          sessionId: id,
          programAssignmentId: assignment.id,
        },
        orderBy: { performedAt: 'desc' },
      });
      if (log?.durationMinutes !== null && log)
        throw new ConflictException(
          'El entrenamiento ya está finalizado y no requiere este aviso',
        );
      const today = todayDate();
      const scheduledDate = this.scheduledDate(assignment, id);
      const expired =
        (!!scheduledDate && scheduledDate < today) ||
        (!!log && todayDate(log.performedAt) < today);
      if (!expired)
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
        const scheduledDate = this.scheduledDate(assignment, id);
        if (!scheduledDate || scheduledDate < today)
          throw new ConflictException(
            'Este entrenamiento ya está cerrado. Solicita una corrección a tu coach.',
          );
        if (existing?.durationMinutes !== null && existing)
          throw new ConflictException(
            'Un entrenamiento finalizado solo puede cambiar mediante una corrección autorizada',
          );
        if (
          existing &&
          existing.durationMinutes === null &&
          todayDate(existing.performedAt) < today
        )
          throw new ConflictException(
            'Este entrenamiento quedó cerrado al cambiar de fecha. Solicita una corrección a tu coach.',
          );
        if (scheduledDate > today && !existing)
          throw new ConflictException(
            'Inicia expresamente el entrenamiento anticipado antes de registrar series',
          );
        const otherOpen = await tx.workoutLog.findFirst({
          where: {
            studentId: user.id,
            structuredExecution: true,
            durationMinutes: null,
            NOT: { programAssignmentId: assignment.id, sessionId: id },
          },
        });
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
        const finishing =
          dto.finish ||
          (existing?.durationMinutes !== null &&
            existing?.durationMinutes !== undefined);
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
        if (!sets.length && !dto.finish)
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
        const data = {
          revision: (existing?.revision ?? 0) + 1,
          completionStatus:
            status === 'NOT_STARTED' ? ('PARTIAL' as const) : status,
          durationMinutes: dto.finish
            ? (dto.durationMinutes ?? existing?.durationMinutes ?? 0)
            : (existing?.durationMinutes ?? null),
          omittedSets,
        };
        const log = existing
          ? await tx.workoutLog.update({ where: { id: existing.id }, data })
          : await tx.workoutLog.create({
              data: {
                ...data,
                studentId: user.id,
                sessionId: id,
                programAssignmentId: assignment.id,
                structuredExecution: true,
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
      const scheduledDate = this.scheduledDate(assignment, sessionId);
      const log = await tx.workoutLog.findFirst({
        where: {
          studentId: user.id,
          sessionId,
          programAssignmentId: assignment.id,
        },
        orderBy: { performedAt: 'desc' },
        include: { setLogs: true },
      });
      const closed =
        (!!scheduledDate && scheduledDate < todayDate()) ||
        (!!log && log.durationMinutes !== null);
      if (!closed || !scheduledDate)
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
          scheduledDate: dateOnly(scheduledDate),
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
            performedAt: new Date(
              `${request.scheduledDate.toISOString().slice(0, 10)}T12:00:00.000Z`,
            ),
            durationMinutes: 0,
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
          durationMinutes: log.durationMinutes ?? 0,
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
