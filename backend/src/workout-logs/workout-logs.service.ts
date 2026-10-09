import { capturePrescription } from '../common/training/workout-prescription';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ConflictException,
  UnauthorizedException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkoutCompletionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StudentTrainingService } from '../student-training/student-training.service';
import { AuditService } from '../audit/audit.service';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_WORKOUT_LOG,
} from '../auth/auth.constants';
import {
  PublicSetLog,
  PublicWorkoutLog,
  toPublicSetLog,
  toPublicWorkoutLog,
} from './workout-log.mapper';
import { CreateSetLogsDto } from './dto/create-set-logs.dto';
import { FinishWorkoutLogDto } from './dto/finish-workout-log.dto';
import { ListWorkoutLogsQueryDto } from './dto/list-workout-logs-query.dto';
import { GetWorkoutEvolutionQueryDto } from './dto/get-workout-evolution-query.dto';
import { ensureWithinEditWindow } from '../common/training/edit-window';
import {
  ExerciseEvolutionPoint,
  WorkoutSummaryMetrics,
  RecentPerformance,
  computeRecentPerformance,
  buildWorkoutLogFilterWhere,
  computeExerciseEvolution,
  computeWorkoutSummaryMetrics,
  parseDateFrom,
  parseDateTo,
} from '../common/training/workout-metrics';

const GENERIC_WORKOUT_LOG_NOT_FOUND = 'Entrenamiento no encontrado';
const GENERIC_SESSION_EXERCISE_NOT_FOUND =
  'Ejercicio de la sesión no encontrado';
const WORKOUT_ALREADY_FINISHED =
  'El entrenamiento ya fue finalizado; no se pueden registrar nuevas series';
const DUPLICATE_SET_LOG =
  'Ya existe un registro para ese ejercicio y número de serie en este entrenamiento';

const SET_LOG_EXERCISE_INCLUDE = {
  workoutLog: { include: { prescriptions: true } },
  sessionExercise: { include: { exercise: true } },
} satisfies Prisma.SetLogInclude;

// Contexto de prescripción (Session -> Week -> Block -> Program) embebido
// tanto en el detalle (GET /workout-logs/:id) como en cada fila del
// historial (GET /workout-logs) -- PROMPT 11 pide poder ver "sesión" y
// "programa relacionado" en ambos. Se reutiliza el MISMO include en los dos
// lugares para no duplicar esta forma de consulta.
const WORKOUT_LOG_SESSION_CONTEXT_INCLUDE = {
  session: {
    include: { week: { include: { block: { include: { program: true } } } } },
  },
} satisfies Prisma.WorkoutLogInclude;

export interface PaginatedWorkoutLogs {
  items: PublicWorkoutLog[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WorkoutEvolutionResult {
  summary: WorkoutSummaryMetrics;
  recentPerformance: RecentPerformance;
  exerciseEvolution: ExerciseEvolutionPoint[] | null;
}

// Ejecución del alumno: ownership, cierre por durationMinutes y edición durante 24h.
// La prescripción se captura una sola vez, en la transacción de inicio.
@Injectable()
export class WorkoutLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentTrainingService: StudentTrainingService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // WorkoutLog.studentId es un campo directo y confiable (se fija una sola
  // vez, en start(), siempre desde CurrentUser()): a diferencia de
  // Block/Week/Session, acá NO hace falta resolver ninguna cadena de
  // relaciones para verificar propiedad.
  private async findOwnWorkoutLogOrThrow(
    studentId: string,
    workoutLogId: string,
  ) {
    const workoutLog = await this.prisma.workoutLog.findUnique({
      where: { id: workoutLogId },
      include: { prescriptions: true },
    });
    if (!workoutLog || workoutLog.studentId !== studentId) {
      throw new NotFoundException(GENERIC_WORKOUT_LOG_NOT_FOUND);
    }
    return workoutLog;
  }

  // POST /sessions/:sessionId/workout-logs — "iniciar entrenamiento". Exige
  // una ProgramAssignment ACTIVA (no alcanza con una FINISHED: no tendría
  // sentido registrar ejecución nueva sobre un programa que el coach ya
  // marcó como terminado para este alumno).
  async start(studentId: string, sessionId: string): Promise<PublicWorkoutLog> {
    await this.studentTrainingService.findAssignedSessionOrThrow(
      studentId,
      sessionId,
      { requireActive: true },
    );

    const created = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${studentId} FOR UPDATE`;
        const actor = await tx.user.findUnique({
          where: { id: studentId },
          select: { isActive: true },
        });
        if (!actor?.isActive) throw new UnauthorizedException('No autenticado');
        const assignment = await tx.programAssignment.findFirst({
          where: {
            studentId,
            status: 'ACTIVE',
            program: {
              blocks: {
                some: {
                  weeks: { some: { sessions: { some: { id: sessionId } } } },
                },
              },
            },
          },
          select: { id: true },
        });
        if (!assignment)
          throw new NotFoundException('Asignación no encontrada');
        const exercises = await tx.sessionExercise.findMany({
          where: { sessionId },
          include: { exercise: true },
          orderBy: { order: 'asc' },
        });
        return tx.workoutLog.create({
          data: {
            sessionId,
            studentId,
            programAssignmentId: assignment.id,
            completionStatus: WorkoutCompletionStatus.PARTIAL,
            prescriptionCapturedAt: new Date(),
            prescriptions: { create: exercises.map(capturePrescription) },
          },
          include: { prescriptions: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    await this.auditService.record({
      actorId: studentId,
      action: AUDIT_ACTIONS.WORKOUT_LOG_STARTED,
      entityType: AUDIT_ENTITY_WORKOUT_LOG,
      entityId: created.id,
      metadata: { sessionId },
    });

    return toPublicWorkoutLog(created);
  }

  // GET /sessions/:sessionId/workout-logs — WorkoutLog propios de ESTA
  // sesión (no un historial global: eso es GET /workout-logs, ver
  // listHistory() más abajo), por ejemplo para reanudar un entrenamiento ya
  // iniciado.
  async listForSession(
    studentId: string,
    sessionId: string,
  ): Promise<PublicWorkoutLog[]> {
    await this.studentTrainingService.findAssignedSessionOrThrow(
      studentId,
      sessionId,
    );

    const activeAssignment = await this.prisma.programAssignment.findFirst({
      where: {
        studentId,
        status: 'ACTIVE',
        program: {
          blocks: {
            some: {
              weeks: { some: { sessions: { some: { id: sessionId } } } },
            },
          },
        },
      },
      select: { id: true },
    });
    const logs = await this.prisma.workoutLog.findMany({
      where: {
        sessionId,
        studentId,
        ...(activeAssignment
          ? { programAssignmentId: activeAssignment.id }
          : {}),
      },
      orderBy: { performedAt: 'desc' },
    });
    return logs.map(toPublicWorkoutLog);
  }

  // GET /workout-logs — historial paginado del alumno autenticado (RF-25,
  // PROMPT 11). El `studentId` SIEMPRE viene de CurrentUser() (nunca de
  // `query`, que ni siquiera declara ese campo — ver ListWorkoutLogsQueryDto)
  // y se combina con los filtros opcionales en un único `where`: por
  // construcción, ningún filtro (programId/sessionId/fecha/estado) puede
  // ampliar el resultado más allá de los propios WorkoutLog del alumno.
  //
  // No incluye `setLogs` completo (eso es solo para el detalle): cada fila
  // trae `setLogsCount` (un simple `_count`, no una segunda consulta por
  // fila) para que el listado sea liviano incluso con muchos entrenamientos
  // registrados -- exactamente el índice `WorkoutLog(student_id,
  // performed_at)` que docs/database.md (sección 7) ya documentaba desde
  // PROMPT 02 como pensado para "consultas de historial y dashboard".
  async listHistory(
    studentId: string,
    query: ListWorkoutLogsQueryDto,
  ): Promise<PaginatedWorkoutLogs> {
    const where: Prisma.WorkoutLogWhereInput = {
      studentId,
      ...buildWorkoutLogFilterWhere({
        dateFrom: parseDateFrom(query.dateFrom),
        dateTo: parseDateTo(query.dateTo),
        completionStatus: query.completionStatus,
        programId: query.programId,
        ...('blockId' in query
          ? { blockId: (query as GetWorkoutEvolutionQueryDto).blockId }
          : {}),
        sessionId: query.sessionId,
      }),
      ...(query.state === 'in-progress' ? { durationMinutes: null } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.workoutLog.findMany({
        where,
        include: {
          ...WORKOUT_LOG_SESSION_CONTEXT_INCLUDE,
          _count: { select: { setLogs: true } },
        },
        orderBy: { performedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.workoutLog.count({ where }),
    ]);

    return {
      items: items.map(toPublicWorkoutLog),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  // GET /workout-logs/evolution — evolución básica descriptiva (RF-25,
  // PROMPT 11). Delega el cálculo entero a common/training/workout-metrics
  // .ts (funciones puras y reutilizables, ver el comentario de ese archivo)
  // pasándole un `where` que SIEMPRE fija `studentId` desde CurrentUser().
  async getEvolution(
    studentId: string,
    query: GetWorkoutEvolutionQueryDto,
  ): Promise<WorkoutEvolutionResult> {
    const where: Prisma.WorkoutLogWhereInput = {
      studentId,
      ...buildWorkoutLogFilterWhere({
        dateFrom: parseDateFrom(query.dateFrom),
        dateTo: parseDateTo(query.dateTo),
        programId: query.programId,
        ...('blockId' in query
          ? { blockId: (query as GetWorkoutEvolutionQueryDto).blockId }
          : {}),
      }),
    };

    const [summary, recentPerformance] = await Promise.all([
      computeWorkoutSummaryMetrics(this.prisma, where),
      computeRecentPerformance(this.prisma, where),
    ]);

    const exerciseEvolution = query.exerciseId
      ? await computeExerciseEvolution(this.prisma, where, query.exerciseId)
      : null;

    return { summary, recentPerformance, exerciseEvolution };
  }

  // GET /workout-logs/:id — detalle propio. Desde PROMPT 11 embebe además
  // el contexto de prescripción (sesión/semana/bloque/programa vigentes)
  // para que el detalle pueda mostrar "qué sesión y programa fue" (RF-25):
  // ninguna escritura nueva, es el mismo `findUnique` de PROMPT 10 con un
  // `include` ampliado.
  async getOwnedByStudent(
    studentId: string,
    workoutLogId: string,
  ): Promise<PublicWorkoutLog> {
    const workoutLog = await this.prisma.workoutLog.findUnique({
      where: { id: workoutLogId },
      include: {
        prescriptions: true,
        setLogs: {
          include: SET_LOG_EXERCISE_INCLUDE,
          orderBy: { createdAt: 'asc' },
        },
        ...WORKOUT_LOG_SESSION_CONTEXT_INCLUDE,
      },
    });
    if (!workoutLog || workoutLog.studentId !== studentId) {
      throw new NotFoundException(GENERIC_WORKOUT_LOG_NOT_FOUND);
    }
    return toPublicWorkoutLog(workoutLog);
  }

  // POST /workout-logs/:id/set-logs — registra una o más series reales
  // (batch atómico, ver el comentario de CreateSetLogsDto). Valida que CADA
  // `sessionExerciseId` pertenezca a la MISMA sesión que originó este
  // WorkoutLog: la comprobación central que impide que un alumno use el id
  // de un ejercicio prescrito en OTRA sesión/programa para "colar" un
  // SetLog fuera de contexto.
  async addSetLogs(
    studentId: string,
    workoutLogId: string,
    dto: CreateSetLogsDto,
  ): Promise<PublicSetLog[]> {
    const workoutLog = await this.findOwnWorkoutLogOrThrow(
      studentId,
      workoutLogId,
    );

    if (workoutLog.durationMinutes !== null) {
      throw new ConflictException(WORKOUT_ALREADY_FINISHED);
    }

    const sessionExerciseIds = [
      ...new Set(dto.setLogs.map((item) => item.sessionExerciseId)),
    ];
    const validExercises = workoutLog.prescriptionCapturedAt
      ? workoutLog.prescriptions.filter((item) =>
          sessionExerciseIds.includes(item.sessionExerciseId),
        )
      : await this.prisma.sessionExercise.findMany({
          where: {
            id: { in: sessionExerciseIds },
            sessionId: workoutLog.sessionId,
          },
          select: { id: true },
        });
    if (validExercises.length !== sessionExerciseIds.length) {
      throw new NotFoundException(GENERIC_SESSION_EXERCISE_NOT_FOUND);
    }

    try {
      const created = await this.prisma.$transaction(
        dto.setLogs.map((item) =>
          this.prisma.setLog.create({
            data: {
              workoutLogId,
              sessionExerciseId: item.sessionExerciseId,
              setNumber: item.setNumber,
              actualReps: item.actualReps ?? null,
              actualLoad: item.actualLoad ?? null,
              actualRpe: item.actualRpe ?? null,
              actualRir: item.actualRir ?? null,
              comments: item.comments ?? null,
            },
            include: SET_LOG_EXERCISE_INCLUDE,
          }),
        ),
      );
      return created.map(toPublicSetLog);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(DUPLICATE_SET_LOG);
      }
      throw error;
    }
  }

  // PATCH /workout-logs/:id/finish — ver el comentario de clase sobre por
  // qué esta es la única operación que fija completionStatus/
  // durationMinutes, y por qué puede repetirse dentro de la ventana de 24h.
  async finish(
    studentId: string,
    workoutLogId: string,
    dto: FinishWorkoutLogDto,
  ): Promise<PublicWorkoutLog> {
    const workoutLog = await this.findOwnWorkoutLogOrThrow(
      studentId,
      workoutLogId,
    );
    ensureWithinEditWindow(workoutLog.createdAt);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.workoutLog.update({
        where: { id: workoutLogId },
        data: {
          completionStatus: dto.completionStatus,
          durationMinutes: dto.durationMinutes,
          overallRpe: dto.overallRpe ?? null,
          fatigue: dto.fatigue ?? null,
          comments: dto.comments ?? null,
        },
      });

      if (workoutLog.durationMinutes === null) {
        const student = await tx.user.findUnique({
          where: { id: studentId },
          select: { coachId: true, name: true },
        });
        if (student?.coachId)
          await this.notifications.create(
            tx,
            student.coachId,
            'WORKOUT_COMPLETED',
            student.name + ' finalizó un entrenamiento',
            'student',
            studentId,
            'workout:' + workoutLogId,
          );
      }
      return result;
    });
    await this.auditService.record({
      actorId: studentId,
      action: AUDIT_ACTIONS.WORKOUT_LOG_FINISHED,
      entityType: AUDIT_ENTITY_WORKOUT_LOG,
      entityId: updated.id,
      metadata: { completionStatus: dto.completionStatus },
    });

    return toPublicWorkoutLog(updated);
  }
}
