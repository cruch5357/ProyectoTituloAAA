// Forma de WorkoutLog/SetLog expuesta por el backend (ver
// backend/src/workout-logs/workout-log.mapper.ts). Usa EXCLUSIVAMENTE los
// mismos campos ya existentes en el modelo (prisma/schema.prisma, PROMPT
// 02): ningún campo nuevo fue inventado en el frontend.
export type WorkoutCompletionStatus = 'COMPLETED' | 'PARTIAL' | 'SKIPPED';

// Resumen del ejercicio prescrito embebido en cada SetLog, para mostrar
// "prescrito vs. realizado" sin pedirlo aparte (RF-21/RF-22).
export interface EmbeddedSessionExercise {
  id: string;
  order: number;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetRpe: number | null;
  targetRir: number | null;
  exercise: {
    id: string;
    name: string;
    muscleGroup: string | null;
    isActive: boolean;
  };
}

export interface SetLog {
  id: string;
  workoutLogId: string;
  sessionExerciseId: string;
  setNumber: number;
  actualReps: number | null;
  actualLoad: number | null;
  actualRpe: number | null;
  actualRir: number | null;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
  sessionExercise?: EmbeddedSessionExercise;
}

export interface WorkoutLog {
  id: string;
  sessionId: string;
  studentId: string;
  performedAt: string;
  completionStatus: WorkoutCompletionStatus;
  overallRpe: number | null;
  fatigue: number | null;
  comments: string | null;
  durationMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  setLogs?: SetLog[];
}
