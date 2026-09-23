import { Exercise } from '@prisma/client';

// Forma publica de un ejercicio, expuesta en respuestas HTTP. Igual que
// toPublicUser() (PROMPT 03), existe para que ningun endpoint devuelva
// accidentalmente un campo interno si el modelo Exercise llegara a crecer
// en el futuro (hoy no tiene ningun campo sensible, pero el patron se
// mantiene por consistencia con el resto del proyecto).
export interface PublicExercise {
  id: string;
  coachId: string;
  name: string;
  muscleGroup: string | null;
  instructions: string | null;
  videoUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicExercise(exercise: Exercise): PublicExercise {
  return {
    id: exercise.id,
    coachId: exercise.coachId,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    instructions: exercise.instructions,
    videoUrl: exercise.videoUrl,
    isActive: exercise.isActive,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt,
  };
}
