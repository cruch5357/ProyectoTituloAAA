import { Prisma, WorkoutCompletionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Historial y evolución básica (PROMPT 11, RF-25) — utilidades PURAS y
// REUTILIZABLES sobre la rama de EJECUCIÓN (WorkoutLog -> SetLog), separadas
// de WorkoutLogsService a propósito: el enunciado de PROMPT 11 pide
// explícitamente que la lógica de métricas quede "separada y clara para que
// pueda reutilizarse después en el Dashboard del Coach" (fuera de alcance
// de este prompt). Por eso NINGUNA función de este archivo asume "el
// alumno autenticado": reciben un `Prisma.WorkoutLogWhereInput` ya armado
// por el llamador (WorkoutLogsService.listHistory()/getEvolution() arman
// ese `where` siempre con `studentId` fijo desde CurrentUser()). El futuro
// dashboard del Coach podría reutilizar EXACTAMENTE estas mismas funciones
// pasando un `where` que filtre por `student: { coachId }` en vez de
// reimplementar el cálculo de promedios/frecuencia.
//
// Principio general (enunciado de PROMPT 11): usar ÚNICAMENTE datos
// realmente registrados, nunca reconstruir ni inventar. Cuando no hay datos
// suficientes para un cálculo con sentido (ej. frecuencia con un solo
// entrenamiento), la función devuelve `null` en vez de un número engañoso.
// ---------------------------------------------------------------------------

export interface WorkoutLogFilters {
  dateFrom?: Date;
  dateTo?: Date;
  completionStatus?: WorkoutCompletionStatus;
  programId?: string;
  sessionId?: string;
}

// Arma la porción de `where` común a historial y evolución. NO incluye
// `studentId`: eso lo agrega siempre el llamador (WorkoutLogsService), nunca
// esta función, para que quede visualmente imposible olvidar el scoping por
// alumno en el call-site. `programId` filtra a través de la cadena de
// prescripción (Session -> Week -> Block -> Program) porque WorkoutLog no
// tiene columna `programId` propia — exactamente el mismo camino que
// StudentTrainingService.findAssignedSessionOrThrow() ya resuelve para
// autorización, acá usado solo para filtrar.
export function buildWorkoutLogFilterWhere(
  filters: WorkoutLogFilters,
): Prisma.WorkoutLogWhereInput {
  return {
    ...(filters.dateFrom || filters.dateTo
      ? {
          performedAt: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
    ...(filters.completionStatus
      ? { completionStatus: filters.completionStatus }
      : {}),
    ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
    ...(filters.programId
      ? { session: { week: { block: { programId: filters.programId } } } }
      : {}),
  };
}

// `dateTo` como fecha-sin-hora (`YYYY-MM-DD`) se interpreta como el FIN de
// ese día (23:59:59.999), no como su medianoche — de lo contrario un filtro
// "hasta hoy" excluiría todo lo registrado hoy mismo, que es el resultado
// menos intuitivo posible para este filtro. `dateFrom` no necesita el ajuste
// simétrico: la medianoche de ese día ya es su inicio.
export function parseDateTo(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

export function parseDateFrom(value?: string): Date | undefined {
  return value ? new Date(value) : undefined;
}

export interface WorkoutSummaryMetrics {
  totalWorkouts: number;
  totalSetLogs: number;
  averageDurationMinutes: number | null;
  averageOverallRpe: number | null;
  averageFatigue: number | null;
  trainingFrequencyPerWeek: number | null;
  firstWorkoutAt: Date | null;
  lastWorkoutAt: Date | null;
}

// "Realizado" = un WorkoutLog que pasó por finish() al menos una vez
// (`durationMinutes !== null`, misma señal ya establecida en PROMPT 10 —
// ver el comentario de clase de WorkoutLogsService). Un WorkoutLog todavía
// en curso no entra en estas métricas descriptivas: promediar duración/RPE
// de entrenamientos a medio registrar produciría números sin sentido real.
export async function computeWorkoutSummaryMetrics(
  prisma: PrismaService,
  where: Prisma.WorkoutLogWhereInput,
): Promise<WorkoutSummaryMetrics> {
  const finishedWhere: Prisma.WorkoutLogWhereInput = {
    ...where,
    durationMinutes: { not: null },
  };

  const [aggregate, totalSetLogs] = await Promise.all([
    prisma.workoutLog.aggregate({
      where: finishedWhere,
      _count: { _all: true },
      _avg: { durationMinutes: true, overallRpe: true, fatigue: true },
      _min: { performedAt: true },
      _max: { performedAt: true },
    }),
    // Las series (SetLog) se pueden registrar en un WorkoutLog aún no
    // finalizado, así que este conteo usa el `where` SIN el filtro de
    // `durationMinutes` — cuenta toda serie real registrada, no solo la de
    // entrenamientos ya cerrados.
    prisma.setLog.count({ where: { workoutLog: where } }),
  ]);

  const totalWorkouts = aggregate._count._all;
  const firstWorkoutAt = aggregate._min.performedAt;
  const lastWorkoutAt = aggregate._max.performedAt;

  // Con menos de 2 entrenamientos no existe un rango de tiempo real que
  // promediar (dividir por ~0 semanas produciría un número absurdo) — se
  // omite en vez de mostrar un valor engañoso, siguiendo la instrucción
  // explícita de PROMPT 11 de "evitar presentar cálculos engañosos si
  // faltan datos".
  let trainingFrequencyPerWeek: number | null = null;
  if (totalWorkouts >= 2 && firstWorkoutAt && lastWorkoutAt) {
    const spanMs = lastWorkoutAt.getTime() - firstWorkoutAt.getTime();
    const spanWeeks = Math.max(spanMs / (7 * 24 * 60 * 60 * 1000), 1 / 7);
    trainingFrequencyPerWeek = totalWorkouts / spanWeeks;
  }

  return {
    totalWorkouts,
    totalSetLogs,
    averageDurationMinutes: aggregate._avg.durationMinutes,
    averageOverallRpe:
      aggregate._avg.overallRpe !== null
        ? Number(aggregate._avg.overallRpe)
        : null,
    averageFatigue: aggregate._avg.fatigue,
    trainingFrequencyPerWeek,
    firstWorkoutAt,
    lastWorkoutAt,
  };
}

export interface ExerciseEvolutionPoint {
  workoutLogId: string;
  performedAt: Date;
  maxActualLoad: number | null;
  totalActualReps: number | null;
  setCount: number;
}

// Evolución de UN ejercicio del catálogo a través del tiempo, agrupando las
// series reales (SetLog) POR ENTRENAMIENTO (no por serie suelta): cada punto
// representa "cómo le fue esa sesión con este ejercicio" — carga máxima
// alcanzada y repeticiones totales — que es la lectura simple y trazable
// que pide PROMPT 11, sin ningún cálculo predictivo. Se agrega en Node
// (no con `groupBy` de Prisma) porque necesita `performedAt`, que vive en
// WorkoutLog y no en SetLog; para el volumen esperado de un alumno (decenas
// de series por ejercicio, no miles) esto es una única consulta con un
// `reduce` trivial en memoria, no el tipo de loop costoso que PROMPT 11
// pide evitar.
//
// Devuelve un arreglo VACÍO si el alumno nunca registró ese ejercicio —
// nunca un dato inventado.
export async function computeExerciseEvolution(
  prisma: PrismaService,
  where: Prisma.WorkoutLogWhereInput,
  exerciseId: string,
): Promise<ExerciseEvolutionPoint[]> {
  const setLogs = await prisma.setLog.findMany({
    where: {
      sessionExercise: { exerciseId },
      workoutLog: where,
    },
    select: {
      workoutLogId: true,
      actualLoad: true,
      actualReps: true,
      workoutLog: { select: { performedAt: true } },
    },
    orderBy: { workoutLog: { performedAt: 'asc' } },
  });

  const byWorkout = new Map<string, ExerciseEvolutionPoint>();
  for (const setLog of setLogs) {
    const load = setLog.actualLoad !== null ? Number(setLog.actualLoad) : null;
    const existing = byWorkout.get(setLog.workoutLogId);
    if (!existing) {
      byWorkout.set(setLog.workoutLogId, {
        workoutLogId: setLog.workoutLogId,
        performedAt: setLog.workoutLog.performedAt,
        maxActualLoad: load,
        totalActualReps: setLog.actualReps,
        setCount: 1,
      });
      continue;
    }
    existing.setCount += 1;
    if (
      load !== null &&
      (existing.maxActualLoad === null || load > existing.maxActualLoad)
    ) {
      existing.maxActualLoad = load;
    }
    if (setLog.actualReps !== null) {
      existing.totalActualReps =
        (existing.totalActualReps ?? 0) + setLog.actualReps;
    }
  }

  // El Map conserva el orden de inserción, que ya llega ordenado por
  // `performedAt asc` desde la consulta -- el resultado queda cronológico
  // sin necesidad de un segundo `sort`.
  return Array.from(byWorkout.values());
}
