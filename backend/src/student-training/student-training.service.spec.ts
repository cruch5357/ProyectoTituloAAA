import { NotFoundException } from '@nestjs/common';
import { ProgramAssignmentStatus } from '@prisma/client';
import { StudentTrainingService } from './student-training.service';
import { PrismaService } from '../prisma/prisma.service';

type MockPrisma = {
  program: Record<string, jest.Mock>;
  block: Record<string, jest.Mock>;
  week: Record<string, jest.Mock>;
  session: Record<string, jest.Mock>;
  sessionExercise: Record<string, jest.Mock>;
  programAssignment: Record<string, jest.Mock>;
};

function buildMockPrisma(): MockPrisma {
  return {
    program: { findUnique: jest.fn() },
    block: { findUnique: jest.fn(), findMany: jest.fn() },
    week: { findUnique: jest.fn(), findMany: jest.fn() },
    session: { findUnique: jest.fn(), findMany: jest.fn() },
    sessionExercise: { findMany: jest.fn() },
    programAssignment: { findFirst: jest.fn() },
  };
}

let prisma: MockPrisma;
let service: StudentTrainingService;

const STUDENT_ID = 'student-123';
const OTHER_STUDENT_ID = 'student-999';
const PROGRAM_ID = 'program-1';
const BLOCK_ID = 'block-1';
const WEEK_ID = 'week-1';
const SESSION_ID = 'session-1';

function buildProgram(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PROGRAM_ID,
    coachId: 'coach-1',
    name: 'Fuerza',
    description: null,
    durationWeeks: 8,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'assignment-1', ...overrides };
}

beforeEach(() => {
  prisma = buildMockPrisma();
  service = new StudentTrainingService(prisma as unknown as PrismaService);
});

describe('StudentTrainingService.getProgram', () => {
  it('devuelve el programa cuando el alumno tiene una asignación (cualquier estado)', async () => {
    prisma.program.findUnique.mockResolvedValue(buildProgram());
    prisma.programAssignment.findFirst.mockResolvedValue(buildAssignment());

    const result = await service.getProgram(STUDENT_ID, PROGRAM_ID);

    expect(result.id).toBe(PROGRAM_ID);
    expect(prisma.programAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { programId: PROGRAM_ID, studentId: STUDENT_ID },
      }),
    );
  });

  it('responde 404 si el programa no existe', async () => {
    prisma.program.findUnique.mockResolvedValue(null);

    await expect(service.getProgram(STUDENT_ID, PROGRAM_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('IDOR: responde 404 si el programa existe pero no está asignado al alumno', async () => {
    prisma.program.findUnique.mockResolvedValue(buildProgram());
    prisma.programAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.getProgram(OTHER_STUDENT_ID, PROGRAM_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('StudentTrainingService.listBlocks/listWeeks/listSessions', () => {
  it('listBlocks valida la asignación del programa antes de listar', async () => {
    prisma.program.findUnique.mockResolvedValue(buildProgram());
    prisma.programAssignment.findFirst.mockResolvedValue(buildAssignment());
    prisma.block.findMany.mockResolvedValue([]);

    await service.listBlocks(STUDENT_ID, PROGRAM_ID);

    expect(prisma.block.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { programId: PROGRAM_ID } }),
    );
  });

  it('listWeeks responde 404 si el bloque no existe', async () => {
    prisma.block.findUnique.mockResolvedValue(null);

    await expect(service.listWeeks(STUDENT_ID, BLOCK_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('IDOR: listWeeks responde 404 si el bloque pertenece a un programa no asignado', async () => {
    prisma.block.findUnique.mockResolvedValue({
      id: BLOCK_ID,
      programId: PROGRAM_ID,
      program: buildProgram(),
    });
    prisma.programAssignment.findFirst.mockResolvedValue(null);

    await expect(service.listWeeks(STUDENT_ID, BLOCK_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('IDOR: listSessions responde 404 si la semana pertenece a un programa no asignado', async () => {
    prisma.week.findUnique.mockResolvedValue({
      id: WEEK_ID,
      blockId: BLOCK_ID,
      block: { programId: PROGRAM_ID, program: buildProgram() },
    });
    prisma.programAssignment.findFirst.mockResolvedValue(null);

    await expect(service.listSessions(STUDENT_ID, WEEK_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('getBlock devuelve el bloque cuando está asignado', async () => {
    prisma.block.findUnique.mockResolvedValue({
      id: BLOCK_ID,
      programId: PROGRAM_ID,
      name: 'Bloque 1',
      order: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      program: buildProgram(),
    });
    prisma.programAssignment.findFirst.mockResolvedValue(buildAssignment());

    const result = await service.getBlock(STUDENT_ID, BLOCK_ID);
    expect(result.id).toBe(BLOCK_ID);
  });

  it('getWeek devuelve la semana cuando está asignada', async () => {
    prisma.week.findUnique.mockResolvedValue({
      id: WEEK_ID,
      blockId: BLOCK_ID,
      number: 1,
      order: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      block: { programId: PROGRAM_ID, program: buildProgram() },
    });
    prisma.programAssignment.findFirst.mockResolvedValue(buildAssignment());

    const result = await service.getWeek(STUDENT_ID, WEEK_ID);
    expect(result.id).toBe(WEEK_ID);
  });

  it('IDOR: getWeek responde 404 si la semana pertenece a un programa no asignado', async () => {
    prisma.week.findUnique.mockResolvedValue({
      id: WEEK_ID,
      blockId: BLOCK_ID,
      number: 1,
      order: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      block: { programId: PROGRAM_ID, program: buildProgram() },
    });
    prisma.programAssignment.findFirst.mockResolvedValue(null);

    await expect(service.getWeek(STUDENT_ID, WEEK_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('StudentTrainingService.findAssignedSessionOrThrow', () => {
  function buildSession() {
    return {
      id: SESSION_ID,
      weekId: WEEK_ID,
      name: 'Sesión A',
      dayOfWeek: null,
      order: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      week: { block: { program: buildProgram() } },
    };
  }

  it('responde 404 si la sesión no existe', async () => {
    prisma.session.findUnique.mockResolvedValue(null);

    await expect(
      service.findAssignedSessionOrThrow(STUDENT_ID, SESSION_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('IDOR: responde 404 si la sesión existe pero no hay ninguna asignación del alumno', async () => {
    prisma.session.findUnique.mockResolvedValue(buildSession());
    prisma.programAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.findAssignedSessionOrThrow(OTHER_STUDENT_ID, SESSION_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('con requireActive=true exige status ACTIVE en la consulta de asignación', async () => {
    prisma.session.findUnique.mockResolvedValue(buildSession());
    prisma.programAssignment.findFirst.mockResolvedValue(buildAssignment());

    await service.findAssignedSessionOrThrow(STUDENT_ID, SESSION_ID, {
      requireActive: true,
    });

    expect(prisma.programAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: ProgramAssignmentStatus.ACTIVE,
        }),
      }),
    );
  });

  it('IDOR: con requireActive=true, una asignación FINISHED no alcanza (se simula filtrando por status en el mock)', async () => {
    prisma.session.findUnique.mockResolvedValue(buildSession());
    // Simula que la base de datos no encuentra ninguna fila ACTIVE porque
    // la única asignación existente está FINISHED.
    prisma.programAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.findAssignedSessionOrThrow(STUDENT_ID, SESSION_ID, {
        requireActive: true,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('sin requireActive, cualquier estado de asignación alcanza para ver', async () => {
    prisma.session.findUnique.mockResolvedValue(buildSession());
    prisma.programAssignment.findFirst.mockResolvedValue(
      buildAssignment({ status: ProgramAssignmentStatus.FINISHED }),
    );

    await expect(
      service.findAssignedSessionOrThrow(STUDENT_ID, SESSION_ID),
    ).resolves.toBeDefined();
    expect(prisma.programAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { programId: PROGRAM_ID, studentId: STUDENT_ID },
      }),
    );
  });
});

describe('StudentTrainingService.getSessionDetail', () => {
  it('devuelve la sesión con su prescripción de ejercicios embebida', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: SESSION_ID,
      weekId: WEEK_ID,
      name: 'Sesión A',
      dayOfWeek: null,
      order: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      week: { block: { program: buildProgram() } },
    });
    prisma.programAssignment.findFirst.mockResolvedValue(buildAssignment());
    prisma.sessionExercise.findMany.mockResolvedValue([
      {
        id: 'se-1',
        sessionId: SESSION_ID,
        exerciseId: 'exercise-1',
        order: 1,
        targetSets: 4,
        targetRepsMin: 8,
        targetRepsMax: 12,
        targetRpe: null,
        targetRir: null,
        restSeconds: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        exercise: {
          id: 'exercise-1',
          name: 'Sentadilla',
          muscleGroup: 'Piernas',
          isActive: true,
        },
      },
    ]);

    const result = await service.getSessionDetail(STUDENT_ID, SESSION_ID);

    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0].exercise.name).toBe('Sentadilla');
  });
});
