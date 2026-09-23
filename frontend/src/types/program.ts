// Forma de programa expuesta por el backend (ver
// backend/src/programs/program.mapper.ts).
export interface Program {
  id: string;
  coachId: string;
  name: string;
  description: string | null;
  durationWeeks: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
