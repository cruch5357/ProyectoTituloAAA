import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StudentsService } from '../students/students.service';
import { PublicUser } from '../common/mappers/public-user.mapper';
import {
  CompletionStatusBreakdown,
  ExerciseEvolutionPoint,
  WorkoutSummaryMetrics,
  buildWorkoutLogFilterWhere,
  computeCompletionStatusBreakdown,
  computeExerciseEvolution,
  computeWorkoutSummaryMetrics,
  countRegisteredWorkouts,
  parseDateFrom,
  parseDateTo,
} from '../common/training/workout-metrics';
import { GetWorkoutEvolutionQueryDto } from '../workout-logs/dto/get-workout-evolution-query.dto';

export interface StudentDashboardResult {
  student: PublicUser;
  workoutsRegistered: number;
  workoutsFinished: number;
  completionStatusBreakdown: CompletionStatusBreakdown;
  summary: WorkoutSummaryMetrics;
  // `null` cuando no se pidió `exerciseId` en la query -- mismo criterio
  // exacto que WorkoutEvolutionResult.exerciseEvolution (PROMPT 11,
  // WorkoutLogsService.getEvolution()): la evolución de un ejercicio
  // puntual es una vista adicional opcional, no parte del resumen base.
  exerciseEvolution: ExerciseEvolutionPoint[] | null;
}

// ---------------------------------------------------------------------------
// Dashboard del Coach — vista POR ALUMNO (PROMPT 12, RF-26). Separado de
// DashboardSummaryService (vista agregada de todos los alumnos) por la
// misma razón: evitar "un único servicio gigantesco".
//
// Verificación de propiedad (CRÍTICO): reutiliza
// StudentsService.getOwnedByCoach(), EXACTAMENTE el mismo método que ya usa
// GET /students/:id (PROMPT 04) -- ni un solo query nuevo de "¿este alumno
// es mío?": responde 404 genérico (nunca 403) si el alumno no existe, no es
// STUDENT, o pertenece a otro coach. Solo después de esa verificación se
// arma cualquier `where` con `studentId`, así que un coach jamás puede ver
// las métricas de un alumno ajeno pasando su id en la URL.
//
// Reutiliza las mismas funciones de common/training/workout-metrics.ts
// (PROMPT 11) que WorkoutLogsService y DashboardSummaryService, ahora con un
// `where` fijado por `studentId` (una vez verificado) -- el mismo patrón que
// el propio historial del alumno, sin duplicar ningún cálculo.
// ---------------------------------------------------------------------------
@Injectable()
export class DashboardStudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentsService: StudentsService,
  ) {}

  async getStudentDashboard(
    coachId: string,
    studentId: string,
    query: GetWorkoutEvolutionQueryDto,
  ): Promise<StudentDashboardResult> {
    // Único punto de verificación de propiedad -- lanza 404 si el alumno no
    // es del coach autenticado. Todo lo que sigue puede confiar en que
    // `studentId` es, en efecto, un alumno propio.
    const student = await this.studentsService.getOwnedByCoach(
      coachId,
      studentId,
    );

    const where: Prisma.WorkoutLogWhereInput = {
      studentId,
      ...buildWorkoutLogFilterWhere({
        dateFrom: parseDateFrom(query.dateFrom),
        dateTo: parseDateTo(query.dateTo),
        programId: query.programId,
      }),
    };

    const [
      workoutsRegistered,
      summary,
      completionStatusBreakdown,
      exerciseEvolution,
    ] = await Promise.all([
      countRegisteredWorkouts(this.prisma, where),
      computeWorkoutSummaryMetrics(this.prisma, where),
      computeCompletionStatusBreakdown(this.prisma, where),
      query.exerciseId
        ? computeExerciseEvolution(this.prisma, where, query.exerciseId)
        : Promise.resolve(null),
    ]);

    return {
      student,
      workoutsRegistered,
      workoutsFinished: summary.totalWorkouts,
      completionStatusBreakdown,
      summary,
      exerciseEvolution,
    };
  }
}
