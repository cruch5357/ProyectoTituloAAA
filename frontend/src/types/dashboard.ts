// Forma de las respuestas del Dashboard del Coach (PROMPT 12, RF-26). Ver
// backend/src/dashboard/*.ts. Reutiliza los mismos tipos ya definidos para
// el historial del alumno (PROMPT 11) donde corresponde -- las métricas
// descriptivas son EXACTAMENTE las mismas funciones reutilizadas con un
// `where` distinto (por coach en vez de por alumno).
import type { WorkoutSummaryMetrics } from './workoutEvolution';
import type { PublicUser } from './user';

// Distribución de `completionStatus` entre los entrenamientos finalizados
// -- la única lectura de "cumplimiento" que PROMPT 12 permite sin inventar
// una fórmula de adherencia (ver docs/api.md, "Estado de implementación
// (PROMPT 12)").
export interface CompletionStatusBreakdown {
  completed: number;
  partial: number;
  skipped: number;
}

export interface CoachDashboardSummary {
  totalStudents: number;
  activeStudents: number;
  activeAssignments: number;
  // "Registrados" = cualquier WorkoutLog existente (incluso en curso).
  workoutsRegistered: number;
  // "Finalizados" = pasó por finish() al menos una vez (durationMinutes !== null).
  workoutsFinished: number;
  completionStatusBreakdown: CompletionStatusBreakdown;
  summary: WorkoutSummaryMetrics;
}

export interface RecentActivityMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ExerciseEvolutionPoint {
  workoutLogId: string;
  performedAt: string;
  maxActualLoad: number | null;
  totalActualReps: number | null;
  setCount: number;
}

export interface StudentDashboardResult {
  student: PublicUser;
  workoutsRegistered: number;
  workoutsFinished: number;
  completionStatusBreakdown: CompletionStatusBreakdown;
  summary: WorkoutSummaryMetrics;
  exerciseEvolution: ExerciseEvolutionPoint[] | null;
}
