import { Injectable, NotFoundException } from '@nestjs/common';
import { Program, ProgramAssignmentStatus, Session } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublicProgram, toPublicProgram } from '../programs/program.mapper';
import { PublicBlock, toPublicBlock } from '../blocks/block.mapper';
import { PublicWeek, toPublicWeek } from '../weeks/week.mapper';
import { PublicSession, toPublicSession } from '../sessions/session.mapper';
import {
  PublicSessionExercise,
  toPublicSessionExercise,
} from '../session-exercises/session-exercise.mapper';

const GENERIC_PROGRAM_NOT_FOUND = 'Programa no encontrado';
const GENERIC_BLOCK_NOT_FOUND = 'Bloque no encontrado';
const GENERIC_WEEK_NOT_FOUND = 'Semana no encontrada';
const GENERIC_SESSION_NOT_FOUND = 'Sesión no encontrada';

export interface SessionDetail extends PublicSession {
  exercises: PublicSessionExercise[];
}

type SessionWithChain = Session & {
  week: { block: { program: Program } };
};

// ---------------------------------------------------------------------------
// Navegación de solo lectura del Alumno sobre SU PRESCRIPCIÓN (PROMPT 10).
// PROMPT 09 dejó esto explícitamente pendiente ("ACCESO DEL ALUMNO",
// MyAssignedProgramsPage.tsx): el alumno solo veía el resumen embebido de su
// ProgramAssignment, sin poder entrar a Program -> Block -> Week -> Session.
// PROMPT 10 lo necesita porque el flujo de ejecución (WorkoutLog/SetLog)
// exige que el alumno primero visualice la sesión que va a registrar
// (RF-21).
//
// Este módulo NUNCA reutiliza los servicios COACH-only existentes
// (ProgramsService/BlocksService/WeeksService/SessionsService/
// SessionExercisesService resuelven propiedad por `coachId`, un criterio
// distinto): implementa sus propias consultas de solo lectura, autorizadas
// por "¿existe una ProgramAssignment del alumno autenticado para el Program
// dueño de este recurso?" en vez de "¿el coachId coincide?". Sí reutiliza
// los MAPPERS puros (toPublicProgram, toPublicBlock, etc.) de esos módulos:
// son funciones sin estado ni dependencia de autorización, así que
// reutilizarlas no compromete el aislamiento entre módulos ni duplica la
// forma de las respuestas ya existente para el Coach.
//
// Para VER (a diferencia de para INICIAR un WorkoutLog, ver
// WorkoutLogsService.start()), cualquier ProgramAssignment alcanza sin
// importar su `status` (ACTIVE o FINISHED): un alumno debe poder seguir
// viendo la prescripción de un programa ya finalizado, igual que puede
// seguir viendo su historial de ejecución sobre él.
// ---------------------------------------------------------------------------
@Injectable()
export class StudentTrainingService {
  constructor(private readonly prisma: PrismaService) {}

  private async isAssignedToProgram(
    studentId: string,
    programId: string,
  ): Promise<boolean> {
    const assignment = await this.prisma.programAssignment.findFirst({
      where: { programId, studentId },
      select: { id: true },
    });
    return assignment !== null;
  }

  async getProgram(
    studentId: string,
    programId: string,
  ): Promise<PublicProgram> {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
    });
    if (!program || !(await this.isAssignedToProgram(studentId, program.id))) {
      throw new NotFoundException(GENERIC_PROGRAM_NOT_FOUND);
    }
    return toPublicProgram(program);
  }

  async listBlocks(
    studentId: string,
    programId: string,
  ): Promise<PublicBlock[]> {
    await this.getProgram(studentId, programId);

    const blocks = await this.prisma.block.findMany({
      where: { programId },
      orderBy: { order: 'asc' },
    });
    return blocks.map(toPublicBlock);
  }

  private async findAssignedBlock(studentId: string, blockId: string) {
    const block = await this.prisma.block.findUnique({
      where: { id: blockId },
      include: { program: true },
    });
    if (
      !block ||
      !(await this.isAssignedToProgram(studentId, block.programId))
    ) {
      throw new NotFoundException(GENERIC_BLOCK_NOT_FOUND);
    }
    return block;
  }

  async listWeeks(studentId: string, blockId: string): Promise<PublicWeek[]> {
    await this.findAssignedBlock(studentId, blockId);

    const weeks = await this.prisma.week.findMany({
      where: { blockId },
      orderBy: { order: 'asc' },
    });
    return weeks.map(toPublicWeek);
  }

  // GET /student/blocks/:id — detalle del bloque (nombre/orden), para que la
  // página del bloque pueda mostrar su propio encabezado sin depender de
  // datos de navegación que se pierden al refrescar/entrar por URL directa.
  async getBlock(studentId: string, blockId: string): Promise<PublicBlock> {
    const block = await this.findAssignedBlock(studentId, blockId);
    return toPublicBlock(block);
  }

  private async findAssignedWeek(studentId: string, weekId: string) {
    const week = await this.prisma.week.findUnique({
      where: { id: weekId },
      include: { block: { include: { program: true } } },
    });
    if (
      !week ||
      !(await this.isAssignedToProgram(studentId, week.block.programId))
    ) {
      throw new NotFoundException(GENERIC_WEEK_NOT_FOUND);
    }
    return week;
  }

  async listSessions(
    studentId: string,
    weekId: string,
  ): Promise<PublicSession[]> {
    await this.findAssignedWeek(studentId, weekId);

    const sessions = await this.prisma.session.findMany({
      where: { weekId },
      orderBy: { order: 'asc' },
    });
    return sessions.map(toPublicSession);
  }

  // GET /student/weeks/:id — detalle de la semana (número/orden), mismo
  // motivo que getBlock().
  async getWeek(studentId: string, weekId: string): Promise<PublicWeek> {
    const week = await this.findAssignedWeek(studentId, weekId);
    return toPublicWeek(week);
  }

  // Reutilizado por WorkoutLogsService para autorizar "iniciar/consultar un
  // WorkoutLog": resuelve la cadena completa Session -> Week -> Block ->
  // Program en una única consulta anidada y verifica la ProgramAssignment
  // del alumno autenticado. `requireActive` distingue "ver la prescripción"
  // (cualquier estado de asignación alcanza) de "iniciar un entrenamiento
  // nuevo" (exige una asignación ACTIVA — no tendría sentido registrar
  // ejecución real sobre un programa que el coach ya marcó como finalizado
  // para ese alumno).
  async findAssignedSessionOrThrow(
    studentId: string,
    sessionId: string,
    options: { requireActive?: boolean } = {},
  ): Promise<SessionWithChain> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { week: { include: { block: { include: { program: true } } } } },
    });
    if (!session) {
      throw new NotFoundException(GENERIC_SESSION_NOT_FOUND);
    }

    const assignment = await this.prisma.programAssignment.findFirst({
      where: {
        programId: session.week.block.program.id,
        studentId,
        ...(options.requireActive
          ? { status: ProgramAssignmentStatus.ACTIVE }
          : {}),
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new NotFoundException(GENERIC_SESSION_NOT_FOUND);
    }

    return session as SessionWithChain;
  }

  // GET /student/sessions/:id — detalle de sesión + su prescripción completa
  // de ejercicios (RF-21), en solo lectura: jamás crea/edita nada sobre
  // SessionExercise, exactamente los mismos datos que ya ve el Coach en
  // GET /sessions/:id/exercises.
  async getSessionDetail(
    studentId: string,
    sessionId: string,
  ): Promise<SessionDetail> {
    const session = await this.findAssignedSessionOrThrow(studentId, sessionId);

    const exercises = await this.prisma.sessionExercise.findMany({
      where: { sessionId },
      orderBy: { order: 'asc' },
      include: { exercise: true },
    });

    return {
      ...toPublicSession(session),
      exercises: exercises.map(toPublicSessionExercise),
    };
  }
}
