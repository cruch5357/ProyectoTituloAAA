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

// Contexto de prescripción vigente embebido en un WorkoutLog (PROMPT 11,
// RF-25): nombre de la sesión + semana/bloque/programa que la originaron.
// Es SOLO LECTURA de la prescripción vigente AL MOMENTO DE LA CONSULTA (no
// una copia congelada -- misma decisión ya documentada desde PROMPT 10, que
// PROMPT 11 mantiene sin introducir versionado).
export interface EmbeddedSessionContext {
  id: string;
  name: string;
  week: {
    id: string;
    number: number;
    block: {
      id: string;
      name: string;
      program: {
        id: string;
        name: string;
      };
    };
  };
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
  session?: EmbeddedSessionContext;
  // Conteo de series sin traer cada una -- solo viene presente en las filas
  // del historial (GET /workout-logs), nunca en el detalle (que ya trae
  // `setLogs` completo).
  setLogsCount?: number;
}
