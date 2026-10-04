// Forma de la respuesta de GET /workout-logs/evolution (ver
// backend/src/common/training/workout-metrics.ts). Usa EXCLUSIVAMENTE
// datos agregados sobre WorkoutLog/SetLog realmente registrados -- ningún
// campo aquí es una predicción ni un cálculo inventado (PROMPT 11, RF-25).
export interface WorkoutSummaryMetrics {
  totalWorkouts: number;
  totalSetLogs: number;
  averageDurationMinutes: number | null;
  averageOverallRpe: number | null;
  averageFatigue: number | null;
  trainingFrequencyPerWeek: number | null;
  firstWorkoutAt: string | null;
  lastWorkoutAt: string | null;
}

// Un punto de evolución = "cómo le fue esa sesión con este ejercicio":
// carga máxima alcanzada y repeticiones totales, agrupadas por
// entrenamiento (nunca por serie suelta).
export interface ExerciseEvolutionPoint {
  workoutLogId: string;
  performedAt: string;
  maxActualLoad: number | null;
  totalActualReps: number | null;
  setCount: number;
}

export interface WorkoutEvolutionResult {
  summary: WorkoutSummaryMetrics;
  recentPerformance?: RecentPerformance;
  exerciseEvolution: ExerciseEvolutionPoint[] | null;
}

export interface RecentPerformance {
  from: string;
  to: string;
  averageOverallRpe: number | null;
  effortPoints: { performedAt: string; overallRpe: number }[];
  workoutsRegistered: number;
  lastActivityAt: string | null;
}
