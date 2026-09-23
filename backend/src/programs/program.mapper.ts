import { Program } from '@prisma/client';

// Forma publica de un programa, expuesta en respuestas HTTP. Mismo patron
// que toPublicExercise() (PROMPT 07): evita que un endpoint devuelva
// accidentalmente un campo interno si el modelo Program llegara a crecer.
export interface PublicProgram {
  id: string;
  coachId: string;
  name: string;
  description: string | null;
  durationWeeks: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicProgram(program: Program): PublicProgram {
  return {
    id: program.id,
    coachId: program.coachId,
    name: program.name,
    description: program.description,
    durationWeeks: program.durationWeeks,
    isActive: program.isActive,
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
  };
}
