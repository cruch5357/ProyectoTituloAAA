import { Exercise, SessionExercise } from '@prisma/client';

/** Called only when a workout is created; never reconstruct past prescriptions. */
export function capturePrescription(
  item: SessionExercise & { exercise: Exercise },
) {
  return {
    sessionExerciseId: item.id,
    exerciseId: item.exerciseId,
    exerciseName: item.exercise.name,
    order: item.order,
    targetSets: item.targetSets,
    targetRepsMin: item.targetRepsMin,
    targetRepsMax: item.targetRepsMax,
    targetRpe: item.targetRpe,
    targetRir: item.targetRir,
    restSeconds: item.restSeconds,
    notes: item.notes,
  };
}
