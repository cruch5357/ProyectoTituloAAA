import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { SaveTrainingDto } from './block-assignment.dto';
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
    const logs = await this.prisma.workoutLog.findMany({
      where: {
        studentId,
        programAssignmentId: { in: assignments.map((a) => a.id) },
      },
      select: {
        id: true,
        sessionId: true,
        programAssignmentId: true,
        completionStatus: true,
        durationMinutes: true,
        omittedSets: true,
        _count: { select: { setLogs: true } },
      },
      orderBy: { performedAt: 'desc' },
    });
    const today = todayDate();
    const sessions = assignments
      .flatMap((a) => {
        let wi = 0;
        return a.program.blocks.flatMap((b, bi) =>
          b.weeks.flatMap((w) => {
            const index = wi++;
            return w.sessions.map((s) => {
              const log = logs.find(
                (l) => l.programAssignmentId === a.id && l.sessionId === s.id,
              );
              const total = s.sessionExercises.reduce(
                (n, e) => n + plannedSets(e).length,
                0,
              );
              const recorded = log?._count.setLogs ?? 0;
              const status = log
                ? trainingStatus(
                    total,
                    recorded,
                    recorded +
                      (Array.isArray(log.omittedSets)
                        ? log.omittedSets.length
                        : 0),
                    log.durationMinutes !== null,
                  )
                : 'NOT_STARTED';
              const override = a.scheduleOverrides.find(
                (o) => o.sessionId === s.id,
              );
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
                date: effectiveSessionDate(
                  a.startDate,
                  index,
                  s.dayOfWeek,
                  override,
                ),
                originalDate:
                  override?.originalDate.toISOString().slice(0, 10) ?? null,
                rescheduled: Boolean(override),
                completed: status === 'COMPLETED',
                status,
                recordedSets: recorded,
                totalSets: total,
                finished:
                  log?.durationMinutes !== null &&
                  log?.durationMinutes !== undefined,
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
      active.find((s) => s.date === today && !s.finished) ??
      active.find((s) => s.date && s.date > today && !s.finished) ??
      active.find((s) => !s.date && !s.finished) ??
      null;
    const pendingSession =
      [...active]
        .reverse()
        .find((s) => s.date && s.date < today && !s.finished) ?? null;
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
          adherence: computeAdherence(a.startDate, own, today),
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
    });
    if (!assignment) throw new NotFoundException('Sesión no encontrada');
    return { session, assignment };
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
      finished: log?.durationMinutes !== null && !!log,
      exercises,
      status: trainingStatus(
        allSets.length,
        allSets.filter((s) => s.status === 'RECORDED').length,
        allSets.filter((s) => s.status !== 'PENDING').length,
        log?.durationMinutes !== null && !!log,
      ),
      readOnly:
        user.role === Role.COACH ||
        assignment.status !== 'ACTIVE' ||
        (!!log && !log.structuredExecution),
    };
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
}
