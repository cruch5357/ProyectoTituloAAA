import { ProgramAssignment, ProgramAssignmentStatus } from '@prisma/client';

// Resumen embebido del alumno, para que el listado de asignaciones de un
// programa (vista Coach) no obligue al frontend a pedir cada alumno por
// separado — mismo criterio ya usado para el resumen de Exercise embebido
// en SessionExercise (PROMPT 08, session-exercise.mapper.ts). Nunca incluye
// passwordHash/tokenVersion/coachId: son exactamente los mismos campos ya
// públicos de PublicUser, salvo esos internos.
export interface AssignmentStudentSummary {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

// Resumen embebido del programa, para la vista Alumno (GET
// /program-assignments/me): un alumno nunca tiene acceso a GET
// /programs/:id (PROMPT 09 lo deja fuera de alcance, ver "ACCESO DEL
// ALUMNO" — la navegación real a Block/Week/Session queda para un prompt
// futuro), así que este resumen es la única forma en que hoy puede ver el
// nombre/estado del programa que le asignaron.
export interface AssignmentProgramSummary {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number | null;
  isActive: boolean;
}

export interface PublicProgramAssignment {
  id: string;
  programId: string;
  studentId: string;
  status: ProgramAssignmentStatus;
  assignedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  // Ambos opcionales y mutuamente independientes: cada método del servicio
  // decide qué relación incluir según quién consulta (ver
  // program-assignments.service.ts) — nunca se traen ambas relaciones si
  // solo una es necesaria para esa respuesta en particular.
  student?: AssignmentStudentSummary;
  program?: AssignmentProgramSummary;
}

type AssignmentWithRelations = ProgramAssignment & {
  student?: AssignmentStudentSummary;
  program?: AssignmentProgramSummary;
};

export function toPublicProgramAssignment(
  assignment: AssignmentWithRelations,
): PublicProgramAssignment {
  return {
    id: assignment.id,
    programId: assignment.programId,
    studentId: assignment.studentId,
    status: assignment.status,
    assignedAt: assignment.assignedAt,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    ...(assignment.student ? { student: assignment.student } : {}),
    ...(assignment.program ? { program: assignment.program } : {}),
  };
}
