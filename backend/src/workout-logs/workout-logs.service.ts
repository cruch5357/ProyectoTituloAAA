import {
  ConflictException,
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
import { ensureWithinEditWindow } from '../common/training/edit-window';

const GENERIC_WORKOUT_LOG_NOT_FOUND = 'Entrenamiento no encontrado';
const GENERIC_SESSION_EXERCISE_NOT_FOUND =
  'Ejercicio de la sesión no encontrado';
const WORKOUT_ALREADY_FINISHED =
  'El entrenamiento ya fue finalizado; no se pueden registrar nuevas series';
const DUPLICATE_SET_LOG =
  'Ya existe un registro para ese ejercicio y número de serie en este entrenamiento';

const SET_LOG_EXERCISE_INCLUDE = {
  sessionExercise: { include: { exercise: true } },
} satisfies Prisma.SetLogInclude;

// ---------------------------------------------------------------------------
// Registro de ejecución del Alumno (PROMPT 10) — usa EXCLUSIVAMENTE los
// modelos WorkoutLog/SetLog ya existentes desde PROMPT 02, sin agregar
// ningún campo (docs/database.md, sección "Ejecución"). Autorización:
// `StudentTrainingService.findAssignedSessionOrThrow()` resuelve la cadena
// completa Session -> Week -> Block -> Program -> ProgramAssignment del
// alumno autenticado — el `studentId` con el que se filtra/crea SIEMPRE sale
// de `CurrentUser()`, nunca de un id enviado por el cliente.
//
// Decisión de diseño documentada (docs/database.md/api.md, "Estado de
// implementación (PROMPT 10)"): `WorkoutLog.completionStatus` es un campo NO
// NULO del modelo (`COMPLETED | PARTIAL | SKIPPED`, sin un valor explícito
// de "en progreso"). Se interpreta que ese enum representa el resultado
// AUTOREPORTADO por el alumno al terminar (RF-23), no un estado técnico de
// progreso, así que:
// - `start()` crea el WorkoutLog con `completionStatus: PARTIAL` como valor
//   provisional (el más neutral de los tres: "todavía no completado"),
//   `durationMinutes` en null.
// - `finish()` es la ÚNICA operación que fija el valor real elegido por el
//   alumno, y SIEMPRE exige `durationMinutes` (ver FinishWorkoutLogDto):
//   `durationMinutes !== null` es la señal — sin agregar ninguna columna
//   nueva — de que ese entrenamiento ya fue cerrado al menos una vez.
// - Mientras no esté cerrado, se pueden seguir agregando SetLog libremente;
//   una vez cerrado, `addSetLogs()` rechaza con 409 (exactamente el
//   escenario que PROMPT 10 pide impedir explícitamente: "operaciones
//   incompatibles con el estado del entrenamiento").
// - Tanto `finish()` (para corregir el resumen) como SetLogsService.update()
//   (para corregir una serie ya cargada) respetan la ventana de 24 horas de
//   RF-24, anclada siempre en `WorkoutLog.createdAt`
//   (common/training/edit-window.ts).
// ---------------------------------------------------------------------------
@Injectable()
export class WorkoutLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentTrainingService: StudentTrainingService,
    private readonly auditService: AuditService,
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

    const created = await this.prisma.workoutLog.create({
      data: {
        sessionId,
        studentId,
        completionStatus: WorkoutCompletionStatus.PARTIAL,
      },
    });

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
  // sesión (no un historial global: eso es RF-25, explícitamente fuera de
  // alcance de PROMPT 10), por ejemplo para reanudar un entrenamiento ya
  // iniciado.
  async listForSession(
    studentId: string,
    sessionId: string,
  ): Promise<PublicWorkoutLog[]> {
    await this.studentTrainingService.findAssignedSessionOrThrow(
      studentId,
      sessionId,
    );

    const logs = await this.prisma.workoutLog.findMany({
      where: { sessionId, studentId },
      orderBy: { performedAt: 'desc' },
    });
    return logs.map(toPublicWorkoutLog);
  }

  async getOwnedByStudent(
    studentId: string,
    workoutLogId: string,
  ): Promise<PublicWorkoutLog> {
    const workoutLog = await this.prisma.workoutLog.findUnique({
      where: { id: workoutLogId },
      include: {
        setLogs: {
          include: SET_LOG_EXERCISE_INCLUDE,
          orderBy: { createdAt: 'asc' },
        },
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
    const validExercises = await this.prisma.sessionExercise.findMany({
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

    const updated = await this.prisma.workoutLog.update({
      where: { id: workoutLogId },
      data: {
        completionStatus: dto.completionStatus,
        durationMinutes: dto.durationMinutes,
        overallRpe: dto.overallRpe ?? null,
        fatigue: dto.fatigue ?? null,
        comments: dto.comments ?? null,
      },
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
