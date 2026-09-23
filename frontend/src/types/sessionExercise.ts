// Resumen del ejercicio de catálogo embebido (ver
// backend/src/session-exercises/session-exercise.mapper.ts).
export interface EmbeddedExercise {
  id: string;
  name: string;
  muscleGroup: string | null;
  isActive: boolean;
}

export interface SessionExercise {
  id: string;
  sessionId: string;
  exerciseId: string;
  order: number;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetRpe: number | null;
  targetRir: number | null;
  restSeconds: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  exercise: EmbeddedExercise;
}
