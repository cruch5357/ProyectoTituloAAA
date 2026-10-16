// Forma de ejercicio expuesta por el backend (ver
// backend/src/exercises/exercise.mapper.ts). Refleja exactamente los campos
// del modelo Exercise (PROMPT 02/07): no se inventa ningún campo que el
// backend no exponga.
export interface Exercise {
  id: string;
  coachId: string;
  name: string;
  // Texto legible (derivado de muscleGroups, o texto libre heredado).
  muscleGroup: string | null;
  // Claves de lib/exerciseTaxonomy.ts.
  muscleGroups: string[];
  sports: string[];
  instructions: string | null;
  videoUrl: string | null;
  isActive: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
}
