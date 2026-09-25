import { Injectable } from '@nestjs/common';
import { Prisma, ProgramAssignmentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompletionStatusBreakdown,
  WorkoutSummaryMetrics,
  buildWorkoutLogFilterWhere,
  computeCompletionStatusBreakdown,
  computeWorkoutSummaryMetrics,
  countRegisteredWorkouts,
  parseDateFrom,
  parseDateTo,
} from '../common/training/workout-metrics';
import { ListRecentActivityQueryDto } from './dto/list-recent-activity-query.dto';
import {
  PublicWorkoutLog,
  toPublicWorkoutLog,
} from '../workout-logs/workout-log.mapper';

export interface CoachDashboardSummary {
  totalStudents: number;
  activeStudents: number;
  activeAssignments: number;
  workoutsRegistered: number;
  workoutsFinished: number;
  completionStatusBreakdown: CompletionStatusBreakdown;
  summary: WorkoutSummaryMetrics;
}

export interface PaginatedRecentActivity {
  items: PublicWorkoutLog[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Mismo `include` que WORKOUT_LOG_SESSION_CONTEXT_INCLUDE en
// workout-logs.service.ts (PROMPT 11), redefinido acá en vez de exportado
// desde ese archivo -- mismo criterio ya usado en
// program-assignments.service.ts con STUDENT_SUMMARY_SELECT/
// PROGRAM_SUMMARY_SELECT: cada servicio declara su propia forma de
// consulta en vez de acoplarse a una constante interna de otro módulo.
const RECENT_ACTIVITY_INCLUDE = {
  session: {
    include: { week: { include: { block: { include: { program: true } } } } },
  },
  student: { select: { id: true, name: true, email: true } },
  _count: { select: { setLogs: true } },
} satisfies Prisma.WorkoutLogInclude;

// ---------------------------------------------------------------------------
// Dashboard del Coach — vista AGREGADA sobre TODOS sus alumnos (PROMPT 12,
// RF-26). Deliberadamente separado de DashboardStudentService (vista POR
// alumno) para no crear "un único servicio gigantesco" (instrucción
// explícita de PROMPT 12).
//
// Regla de propiedad (CRÍTICO, enunciado de PROMPT 12): el `coachId` con el
// que se filtra SIEMPRE sale de CurrentUser() en el controller, nunca de un
// parámetro/query/body. Todas las consultas de este servicio fijan
// `student: { coachId }` (o `coachId` directo en User/ProgramAssignment vía
// la relación `student`) como base del `where` — un filtro adicional
// (fechas, estado) solo puede ACOTAR ese conjunto, nunca ampliarlo a datos
// de otro coach (mismo argumento anti-IDOR ya documentado en PROMPT 11 para
// los filtros del historial del alumno, aplicado acá al coachId en vez del
// studentId).
//
// Reutiliza EXACTAMENTE las funciones de common/training/workout-metrics.ts
// (PROMPT 11) pasando un `where` scopeado por coach en vez de por alumno —
// el reuso que ese archivo anticipó explícitamente en su comentario de
// cabecera. No se duplica ningún cálculo de promedios/frecuencia/conteo acá.
// ---------------------------------------------------------------------------
@Injectable()
export class DashboardSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  // Arma el `where` de WorkoutLog scopeado a TODOS los alumnos del coach.
  // Único punto donde este servicio construye ese filtro base -- todos los
  // métodos públicos lo obtienen de acá para que sea imposible olvidar el
  // scoping por coach en algún query nuevo.
  private coachWorkoutLogWhere(coachId: string): Prisma.WorkoutLogWhereInput {
    return { student: { coachId } };
  }

  async getSummary(coachId: string): Promise<CoachDashboardSummary> {
    const where = this.coachWorkoutLogWhere(coachId);

    const [
      totalStudents,
      activeStudents,
      activeAssignments,
      workoutsRegistered,
      summary,
      completionStatusBreakdown,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.STUDENT, coachId } }),
      this.prisma.user.count({
        where: { role: Role.STUDENT, coachId, isActive: true },
      }),
      // Un ProgramAssignment no tiene columna `coachId` propia (ver
      // docs/database.md): se llega al coach a través del alumno asignado,
      // mismo camino ya usado por ProgramAssignmentsService para verificar
      // propiedad, acá usado solo para contar.
      this.prisma.programAssignment.count({
        where: { status: ProgramAssignmentStatus.ACTIVE, student: { coachId } },
      }),
      countRegisteredWorkouts(this.prisma, where),
      computeWorkoutSummaryMetrics(this.prisma, where),
      computeCompletionStatusBreakdown(this.prisma, where),
    ]);

    return {
      totalStudents,
      activeStudents,
      activeAssignments,
      workoutsRegistered,
      // "Finalizados" = summary.totalWorkouts (ver el comentario de
      // computeWorkoutSummaryMetrics en workout-metrics.ts): ese campo ya
      // describe únicamente los WorkoutLog que pasaron por finish() al
      // menos una vez. Se expone acá con un nombre explícito
      // (workoutsFinished) para no obligar al frontend del Dashboard a
      // conocer esa convención interna del nombre "totalWorkouts".
      workoutsFinished: summary.totalWorkouts,
      completionStatusBreakdown,
      summary,
    };
  }

  async listRecentActivity(
    coachId: string,
    query: ListRecentActivityQueryDto,
  ): Promise<PaginatedRecentActivity> {
    const { page, limit, dateFrom, dateTo, completionStatus } = query;

    const where: Prisma.WorkoutLogWhereInput = {
      ...this.coachWorkoutLogWhere(coachId),
      ...buildWorkoutLogFilterWhere({
        dateFrom: parseDateFrom(dateFrom),
        dateTo: parseDateTo(dateTo),
        completionStatus,
      }),
    };

    // Actividad reciente = orden descendente por `performedAt`, siempre
    // paginada (nunca "traer todo" -- instrucción explícita de PROMPT 12 de
    // evitar consultas sin límite). Una sola consulta con `include`, sin
    // ningún loop N+1 por alumno.
    const [items, total] = await Promise.all([
      this.prisma.workoutLog.findMany({
        where,
        include: RECENT_ACTIVITY_INCLUDE,
        orderBy: { performedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.workoutLog.count({ where }),
    ]);

    return {
      items: items.map(toPublicWorkoutLog),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
