import { Exercise, SessionExercise } from '@prisma/client';

// Resumen del ejercicio de catálogo embebido en cada SessionExercise, para
// que el frontend pueda mostrar nombre/grupo muscular sin una consulta
// adicional por cada fila (docs/api.md, GET /sessions/:id/exercises).
export interface EmbeddedExercise {
  id: string;
  name: string;
  muscleGroup: string | null;
  isActive: boolean;
}

export interface PublicSessionExercise {
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
  createdAt: Date;
  updatedAt: Date;
  exercise: EmbeddedExercise;
}

export function toPublicSessionExercise(
  sessionExercise: SessionExercise & { exercise: Exercise },
): PublicSessionExercise {
  return {
    id: sessionExercise.id,
    sessionId: sessionExercise.sessionId,
    exerciseId: sessionExercise.exerciseId,
    order: sessionExercise.order,
    targetSets: sessionExercise.targetSets,
    targetRepsMin: sessionExercise.targetRepsMin,
    targetRepsMax: sessionExercise.targetRepsMax,
    // Prisma expone `targetRpe` como `Decimal` (columna `DECIMAL(3,1)`); se
    // convierte a `number` para que el frontend reciba JSON simple en vez
    // de la representación en string que produce `Decimal.toJSON()`.
    targetRpe:
      sessionExercise.targetRpe !== null
        ? Number(sessionExercise.targetRpe)
        : null,
    targetRir: sessionExercise.targetRir,
    restSeconds: sessionExercise.restSeconds,
    notes: sessionExercise.notes,
    createdAt: sessionExercise.createdAt,
    updatedAt: sessionExercise.updatedAt,
    exercise: {
      id: sessionExercise.exercise.id,
      name: sessionExercise.exercise.name,
      muscleGroup: sessionExercise.exercise.muscleGroup,
      isActive: sessionExercise.exercise.isActive,
    },
  };
}
