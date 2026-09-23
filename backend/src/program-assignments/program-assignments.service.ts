import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, ProgramAssignmentStatus, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgramsService } from '../programs/programs.service';
import { AuditService } from '../audit/audit.service';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_PROGRAM_ASSIGNMENT,
} from '../auth/auth.constants';
import {
  PublicProgramAssignment,
  toPublicProgramAssignment,
} from './program-assignment.mapper';
import { AssignProgramDto } from './dto/assign-program.dto';
import { UpdateProgramAssignmentStatusDto } from './dto/update-program-assignment-status.dto';

const GENERIC_STUDENT_NOT_FOUND = 'Alumno no encontrado';
const GENERIC_ASSIGNMENT_NOT_FOUND = 'Asignación no encontrada';
const STUDENT_NOT_ACTIVE =
  'El alumno no está activo para recibir una programación';
const DUPLICATE_ACTIVE_ASSIGNMENT =
  'Este alumno ya tiene una asignación activa de este programa';

// Selección explícita y angosta de campos del alumno embebidos en la
// respuesta (nunca passwordHash/tokenVersion/coachId — mismo criterio que
// PublicUser).
const STUDENT_SUMMARY_SELECT = {
  id: true,
  name: true,
  email: true,
  isActive: true,
} satisfies Prisma.UserSelect;

const PROGRAM_SUMMARY_SELECT = {
  id: true,
  name: true,
  description: true,
  durationWeeks: true,
  isActive: true,
} satisfies Prisma.ProgramSelect;

// ---------------------------------------------------------------------------
// Asignación de Programas a Alumnos (PROMPT 09) — el puente entre la
// jerarquía de PRESCRIPCIÓN (Program -> Block -> Week -> Session ->
// SessionExercise, PROMPT 08) y, en un prompt futuro, la de EJECUCIÓN
// (WorkoutLog -> SetLog). Usa el modelo `ProgramAssignment` ya existente
// desde PROMPT 02 (prisma/schema.prisma) sin ningún cambio de esquema — ver
// docs/database.md, "Estado de implementación (PROMPT 09)".
//
// Regla fundamental de propiedad (enunciado de PROMPT 09): un coach solo
// puede asignar PROGRAMAS PROPIOS a ALUMNOS PROPIOS. El coachId/studentId
// nunca se confía del cliente:
// - El Program se verifica con `ProgramsService.findOwnedProgramOrThrow()`
//   (mismo método ya reutilizado por BlocksService desde PROMPT 08).
// - El Student se verifica acá mismo, directamente contra `User` (mismo
//   patrón que `SessionExercisesService` verificando `Exercise.coachId` de
//   forma independiente a la cadena de Session — PROMPT 08): un
//   `ProgramAssignment` no tiene ninguna cadena de relaciones que conecte
//   automáticamente Program.coachId con Student.coachId, así que ambas
//   propiedades se verifican de forma explícita e independiente.
//
// Ambas verificaciones responden 404 (nunca 403) tanto si el recurso no
// existe como si pertenece a otro coach — mismo criterio ya establecido en
// todo el proyecto desde PROMPT 04.
// ---------------------------------------------------------------------------
@Injectable()
export class ProgramAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programsService: ProgramsService,
    private readonly auditService: AuditService,
  ) {}

  // Verifica que el alumno exista, sea STUDENT, pertenezca al coach
  // autenticado, y esté activo (PROMPT 09, punto 6: "El alumno está en un
  // estado válido para recibir una programación"). Un alumno inexistente o
  // de otro coach responde 404 genérico (fuga de información — mismo
  // criterio que ensureOwnedStudent() en StudentsService). Un alumno propio
  // pero INACTIVO es un caso distinto: el coach ya sabe que ese alumno es
  // suyo (lo ve en GET /students), así que informarlo no es una fuga —
  // responde 422 (regla de negocio), no 404.
  private async ensureOwnedActiveStudent(
    coachId: string,
    studentId: string,
  ): Promise<User> {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
    });
    if (
      !student ||
      student.role !== Role.STUDENT ||
      student.coachId !== coachId
    ) {
      throw new NotFoundException(GENERIC_STUDENT_NOT_FOUND);
    }
    if (!student.isActive) {
      throw new UnprocessableEntityException(STUDENT_NOT_ACTIVE);
    }
    return student;
  }

  // Verificación proactiva de la restricción de "no duplicados" (PROMPT 09,
  // punto 5: "Evitar asignaciones duplicadas cuando las restricciones del
  // modelo lo indiquen"). El modelo ya define esta restricción como un
  // ÍNDICE ÚNICO PARCIAL (`program_assignments_active_unique`, WHERE status
  // = 'ACTIVE' — ver prisma/migrations/20260916150000_.../migration.sql y
  // docs/database.md sección 8.1): permite una asignación ACTIVA duplicada
  // rechazada, pero sí permite reasignar el mismo programa al mismo alumno
  // una vez que la asignación anterior está FINISHED. Esta comprobación
  // adelantada da un mensaje de error más claro (409 con este mensaje
  // específico) antes de intentar el `create`/`update`; el índice de la
  // base de datos sigue siendo la barrera AUTORITATIVA final ante una
  // condición de carrera (ver el try/catch de P2002 más abajo, mismo patrón
  // ya usado en AuthService.activate() para el email único de User).
  private async ensureNoActiveDuplicate(
    programId: string,
    studentId: string,
    excludeAssignmentId?: string,
  ): Promise<void> {
    const existing = await this.prisma.programAssignment.findFirst({
      where: {
        programId,
        studentId,
        status: ProgramAssignmentStatus.ACTIVE,
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(DUPLICATE_ACTIVE_ASSIGNMENT);
    }
  }

  // POST /programs/:programId/assign — secuencia completa de validación
  // (PROMPT 09, sección "VALIDACIÓN DE ASIGNACIÓN"):
  //   1-2-3. Program existe y pertenece al coach (ProgramsService).
  //   4-5-6. Student existe, pertenece al coach, y está activo (arriba).
  //   7. No viola las restricciones existentes (ensureNoActiveDuplicate +
  //      manejo de P2002 como respaldo autoritativo).
  async assign(
    coachId: string,
    programId: string,
    dto: AssignProgramDto,
  ): Promise<PublicProgramAssignment> {
    await this.programsService.findOwnedProgramOrThrow(coachId, programId);
    const student = await this.ensureOwnedActiveStudent(coachId, dto.studentId);
    await this.ensureNoActiveDuplicate(programId, student.id);

    try {
      // Objeto `data` explícito y angosto (prevención de mass assignment,
      // igual que el resto del proyecto): solo `programId`/`studentId`. El
      // `status` nace siempre ACTIVE (default del schema) y `assignedAt`
      // siempre `now()` (default del schema) — ninguno de los dos es
      // elegible por el cliente en este endpoint.
      const created = await this.prisma.programAssignment.create({
        data: { programId, studentId: student.id },
        include: { student: { select: STUDENT_SUMMARY_SELECT } },
      });

      await this.auditService.record({
        actorId: coachId,
        action: AUDIT_ACTIONS.PROGRAM_ASSIGNMENT_CREATED,
        entityType: AUDIT_ENTITY_PROGRAM_ASSIGNMENT,
        entityId: created.id,
        metadata: { programId, studentId: student.id },
      });

      return toPublicProgramAssignment(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Respaldo ante una condición de carrera: dos requests concurrentes
        // pasaron ambas el chequeo previo antes de que cualquiera de las
        // dos insertara. El índice único parcial de la base de datos es la
        // barrera final (mismo patrón que AuthService.activate() con el
        // email único de User).
        throw new ConflictException(DUPLICATE_ACTIVE_ASSIGNMENT);
      }
      throw error;
    }
  }

  // GET /programs/:programId/assignments — todas las asignaciones de un
  // programa propio, con un resumen del alumno embebido (vista Coach). Sin
  // paginación: mismo criterio ya usado en blocks/weeks/sessions/
  // session-exercises (PROMPT 08) — un programa acumula un número acotado
  // de asignaciones.
  async listForProgram(
    coachId: string,
    programId: string,
  ): Promise<PublicProgramAssignment[]> {
    await this.programsService.findOwnedProgramOrThrow(coachId, programId);

    const assignments = await this.prisma.programAssignment.findMany({
      where: { programId },
      orderBy: { assignedAt: 'desc' },
      include: { student: { select: STUDENT_SUMMARY_SELECT } },
    });
    return assignments.map(toPublicProgramAssignment);
  }

  // GET /program-assignments/:id — detalle de una asignación propia (Coach).
  // La propiedad se resuelve vía `assignment.program.coachId` (la asignación
  // no tiene `coachId` propio) — mismo criterio de cadena de propiedad
  // indirecta ya establecido para Block/Week/Session/SessionExercise en
  // PROMPT 08.
  async getOwnedByCoach(
    coachId: string,
    assignmentId: string,
  ): Promise<PublicProgramAssignment> {
    const assignment = await this.prisma.programAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        program: { select: { coachId: true, ...PROGRAM_SUMMARY_SELECT } },
        student: { select: STUDENT_SUMMARY_SELECT },
      },
    });

    if (!assignment || assignment.program.coachId !== coachId) {
      throw new NotFoundException(GENERIC_ASSIGNMENT_NOT_FOUND);
    }

    const { program, ...rest } = assignment;
    return toPublicProgramAssignment({
      ...rest,
      program: {
        id: program.id,
        name: program.name,
        description: program.description,
        durationWeeks: program.durationWeeks,
        isActive: program.isActive,
      },
    });
  }

  // PATCH /program-assignments/:id/status — única forma de "desactivar/
  // finalizar" una asignación (PROMPT 09, punto 4), respetando el enum ya
  // existente del modelo (`ACTIVE`/`FINISHED`) en vez de agregar un booleano
  // nuevo. Mismo chequeo de propiedad por cadena que getOwnedByCoach().
  //
  // Si se intenta REACTIVAR (volver a ACTIVE) una asignación que no lo
  // estaba, se re-valida la restricción de "no duplicados": pudo haberse
  // creado una nueva asignación ACTIVA del mismo programa/alumno mientras
  // esta estaba FINISHED.
  async updateStatus(
    coachId: string,
    assignmentId: string,
    dto: UpdateProgramAssignmentStatusDto,
  ): Promise<PublicProgramAssignment> {
    const assignment = await this.prisma.programAssignment.findUnique({
      where: { id: assignmentId },
      include: { program: { select: { coachId: true } } },
    });

    if (!assignment || assignment.program.coachId !== coachId) {
      throw new NotFoundException(GENERIC_ASSIGNMENT_NOT_FOUND);
    }

    if (
      dto.status === ProgramAssignmentStatus.ACTIVE &&
      assignment.status !== ProgramAssignmentStatus.ACTIVE
    ) {
      await this.ensureNoActiveDuplicate(
        assignment.programId,
        assignment.studentId,
        assignment.id,
      );
    }

    try {
      const updated = await this.prisma.programAssignment.update({
        where: { id: assignmentId },
        // Objeto `data` explícito: únicamente `status` (prevención de mass
        // assignment, mismo criterio que UpdateProgramStatusDto).
        data: { status: dto.status },
        include: { student: { select: STUDENT_SUMMARY_SELECT } },
      });

      await this.auditService.record({
        actorId: coachId,
        action: AUDIT_ACTIONS.PROGRAM_ASSIGNMENT_STATUS_CHANGED,
        entityType: AUDIT_ENTITY_PROGRAM_ASSIGNMENT,
        entityId: updated.id,
        metadata: { status: dto.status },
      });

      return toPublicProgramAssignment(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(DUPLICATE_ACTIVE_ASSIGNMENT);
      }
      throw error;
    }
  }

  // GET /program-assignments/me — únicamente las asignaciones del ALUMNO
  // autenticado (PROMPT 09, sección "ACCESO DEL ALUMNO"). El `studentId`
  // usado para filtrar sale siempre de `CurrentUser()` (JWT ya verificado),
  // nunca de un parámetro de ruta, query o body — un alumno nunca puede
  // pedir ni ver las asignaciones de otro alumno, ni siquiera conociendo su
  // id, porque este método no acepta ningún id externo. Incluye un resumen
  // del programa (nunca su jerarquía completa de Block/Week/Session, fuera
  // de alcance de este prompt).
  async listForStudent(studentId: string): Promise<PublicProgramAssignment[]> {
    const assignments = await this.prisma.programAssignment.findMany({
      where: { studentId },
      orderBy: { assignedAt: 'desc' },
      include: { program: { select: PROGRAM_SUMMARY_SELECT } },
    });
    return assignments.map(toPublicProgramAssignment);
  }
}
