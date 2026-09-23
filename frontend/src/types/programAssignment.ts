// Forma de una asignación de programa expuesta por el backend (ver
// backend/src/program-assignments/program-assignment.mapper.ts). El puente
// entre la jerarquía de prescripción (Program -> Block -> Week -> Session,
// PROMPT 08) y, en un prompt futuro, la de ejecución (WorkoutLog -> SetLog).
export type ProgramAssignmentStatus = 'ACTIVE' | 'FINISHED';

// Resumen del alumno embebido cuando el backend responde desde la vista
// Coach (GET /programs/:id/assignments, GET /program-assignments/:id).
export interface AssignmentStudentSummary {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

// Resumen del programa embebido cuando el backend responde desde la vista
// Alumno (GET /program-assignments/me): un alumno no tiene acceso a
// GET /programs/:id (fuera de alcance de PROMPT 09), así que este resumen es
// hoy la única forma en que ve el nombre/estado del programa asignado.
export interface AssignmentProgramSummary {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number | null;
  isActive: boolean;
}

export interface ProgramAssignment {
  id: string;
  programId: string;
  studentId: string;
  status: ProgramAssignmentStatus;
  assignedAt: string;
  createdAt: string;
  updatedAt: string;
  student?: AssignmentStudentSummary;
  program?: AssignmentProgramSummary;
}
