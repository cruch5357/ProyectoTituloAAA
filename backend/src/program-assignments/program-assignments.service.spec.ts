import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, ProgramAssignmentStatus, Role } from '@prisma/client';
import { ProgramAssignmentsService } from './program-assignments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgramsService } from '../programs/programs.service';
import { AuditService } from '../audit/audit.service';

type MockPrisma = {
  user: Record<string, jest.Mock>;
  programAssignment: Record<string, jest.Mock>;
};

function buildMockPrisma(): MockPrisma {
  return {
    user: {
      findUnique: jest.fn(),
    },
    programAssignment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

function buildPrismaKnownError(
  code: string,
): Prisma.PrismaClientKnownRequestError {
  return Object.assign(
    Object.create(Prisma.PrismaClientKnownRequestError.prototype),
    { code, message: 'Unique constraint failed', clientVersion: 'test' },
  );
}

let prisma: MockPrisma;
let programsService: jest.Mocked<ProgramsService>;
let auditService: jest.Mocked<AuditService>;
let service: ProgramAssignmentsService;

const COACH_ID = 'coach-123';
const OTHER_COACH_ID = 'coach-999';
const STUDENT_ID = 'student-123';
const PROGRAM_ID = 'program-123';

function buildStudent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: STUDENT_ID,
    email: 'alumno@example.com',
    name: 'Alumno Uno',
    role: Role.STUDENT,
    coachId: COACH_ID,
    isActive: true,
    ...overrides,
  };
}

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assignment-1',
    programId: PROGRAM_ID,
    studentId: STUDENT_ID,
    status: ProgramAssignmentStatus.ACTIVE,
    assignedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  prisma = buildMockPrisma();
  programsService = {
    findOwnedProgramOrThrow: jest.fn().mockResolvedValue({
      id: PROGRAM_ID,
      coachId: COACH_ID,
    }),
  } as unknown as jest.Mocked<ProgramsService>;
  auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditService>;

  service = new ProgramAssignmentsService(
    prisma as unknown as PrismaService,
    programsService,
    auditService,
  );
});

describe('ProgramAssignmentsService.assign', () => {
  it('crea la asignación cuando el programa y el alumno son propios y el alumno está activo', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent());
    prisma.programAssignment.findFirst.mockResolvedValue(null);
    prisma.programAssignment.create.mockResolvedValue(
      buildAssignment({ student: buildStudent() }),
    );

    const result = await service.assign(COACH_ID, PROGRAM_ID, {
      studentId: STUDENT_ID,
    });

    expect(programsService.findOwnedProgramOrThrow).toHaveBeenCalledWith(
      COACH_ID,
      PROGRAM_ID,
    );
    expect(prisma.programAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { programId: PROGRAM_ID, studentId: STUDENT_ID },
      }),
    );
    expect(result.programId).toBe(PROGRAM_ID);
    expect(result.studentId).toBe(STUDENT_ID);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'program_assignments.created' }),
    );
  });

  it('el objeto data enviado a Prisma nunca incluye más que programId/studentId (prevención de mass assignment)', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent());
    prisma.programAssignment.findFirst.mockResolvedValue(null);
    prisma.programAssignment.create.mockResolvedValue(buildAssignment());

    await service.assign(COACH_ID, PROGRAM_ID, { studentId: STUDENT_ID });

    const callArg = prisma.programAssignment.create.mock.calls[0][0];
    expect(Object.keys(callArg.data).sort()).toEqual(
      ['programId', 'studentId'].sort(),
    );
  });

  it('lanza 404 si el programa no pertenece al coach autenticado (IDOR)', async () => {
    programsService.findOwnedProgramOrThrow.mockRejectedValue(
      new NotFoundException('Programa no encontrado'),
    );

    await expect(
      service.assign(COACH_ID, PROGRAM_ID, { studentId: STUDENT_ID }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('lanza 404 genérico si el alumno no existe', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.assign(COACH_ID, PROGRAM_ID, { studentId: STUDENT_ID }),
    ).rejects.toThrow('Alumno no encontrado');
  });

  it('lanza 404 (nunca 403) si el alumno pertenece a otro coach (IDOR)', async () => {
    prisma.user.findUnique.mockResolvedValue(
      buildStudent({ coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.assign(COACH_ID, PROGRAM_ID, { studentId: STUDENT_ID }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 404 si el usuario referenciado no es un STUDENT (ej. otro coach)', async () => {
    prisma.user.findUnique.mockResolvedValue(
      buildStudent({ role: Role.COACH, coachId: null }),
    );

    await expect(
      service.assign(COACH_ID, PROGRAM_ID, { studentId: STUDENT_ID }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 422 si el alumno propio está inactivo', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent({ isActive: false }));

    await expect(
      service.assign(COACH_ID, PROGRAM_ID, { studentId: STUDENT_ID }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.programAssignment.create).not.toHaveBeenCalled();
  });

  it('lanza 409 si ya existe una asignación ACTIVA duplicada (chequeo previo)', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent());
    prisma.programAssignment.findFirst.mockResolvedValue(buildAssignment());

    await expect(
      service.assign(COACH_ID, PROGRAM_ID, { studentId: STUDENT_ID }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.programAssignment.create).not.toHaveBeenCalled();
  });

  it('lanza 409 si la base de datos rechaza el índice único parcial (condición de carrera)', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent());
    prisma.programAssignment.findFirst.mockResolvedValue(null);
    prisma.programAssignment.create.mockRejectedValue(
      buildPrismaKnownError('P2002'),
    );

    await expect(
      service.assign(COACH_ID, PROGRAM_ID, { studentId: STUDENT_ID }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('propaga cualquier otro error de Prisma sin transformarlo', async () => {
    prisma.user.findUnique.mockResolvedValue(buildStudent());
    prisma.programAssignment.findFirst.mockResolvedValue(null);
    const unrelated = new Error('fallo inesperado de base de datos');
    prisma.programAssignment.create.mockRejectedValue(unrelated);

    await expect(
      service.assign(COACH_ID, PROGRAM_ID, { studentId: STUDENT_ID }),
    ).rejects.toBe(unrelated);
  });
});

describe('ProgramAssignmentsService.listForProgram', () => {
  it('verifica la propiedad del programa antes de listar', async () => {
    prisma.programAssignment.findMany.mockResolvedValue([]);

    await service.listForProgram(COACH_ID, PROGRAM_ID);

    expect(programsService.findOwnedProgramOrThrow).toHaveBeenCalledWith(
      COACH_ID,
      PROGRAM_ID,
    );
    expect(prisma.programAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { programId: PROGRAM_ID } }),
    );
  });

  it('propaga el 404 si el programa pertenece a otro coach', async () => {
    programsService.findOwnedProgramOrThrow.mockRejectedValue(
      new NotFoundException('Programa no encontrado'),
    );

    await expect(
      service.listForProgram(COACH_ID, PROGRAM_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProgramAssignmentsService.getOwnedByCoach', () => {
  it('retorna la asignación con el resumen del programa cuando pertenece al coach', async () => {
    prisma.programAssignment.findUnique.mockResolvedValue(
      buildAssignment({
        program: {
          coachId: COACH_ID,
          id: PROGRAM_ID,
          name: 'Fuerza',
          description: null,
          durationWeeks: 8,
          isActive: true,
        },
      }),
    );

    const result = await service.getOwnedByCoach(COACH_ID, 'assignment-1');

    expect(result.program).toEqual(
      expect.objectContaining({ id: PROGRAM_ID, name: 'Fuerza' }),
    );
  });

  it('lanza 404 si la asignación no existe', async () => {
    prisma.programAssignment.findUnique.mockResolvedValue(null);

    await expect(
      service.getOwnedByCoach(COACH_ID, 'no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 404 (nunca 403) si la asignación pertenece a un programa de otro coach (IDOR)', async () => {
    prisma.programAssignment.findUnique.mockResolvedValue(
      buildAssignment({
        program: {
          coachId: OTHER_COACH_ID,
          id: PROGRAM_ID,
          name: 'Fuerza',
          description: null,
          durationWeeks: 8,
          isActive: true,
        },
      }),
    );

    await expect(
      service.getOwnedByCoach(COACH_ID, 'assignment-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProgramAssignmentsService.updateStatus', () => {
  it('finaliza una asignación activa propia', async () => {
    prisma.programAssignment.findUnique.mockResolvedValue(
      buildAssignment({ program: { coachId: COACH_ID } }),
    );
    prisma.programAssignment.update.mockResolvedValue(
      buildAssignment({ status: ProgramAssignmentStatus.FINISHED }),
    );

    const result = await service.updateStatus(COACH_ID, 'assignment-1', {
      status: ProgramAssignmentStatus.FINISHED,
    });

    expect(result.status).toBe(ProgramAssignmentStatus.FINISHED);
    expect(prisma.programAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: ProgramAssignmentStatus.FINISHED },
      }),
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'program_assignments.status_changed',
      }),
    );
  });

  it('lanza 404 (nunca 403) si la asignación pertenece a un programa de otro coach (IDOR)', async () => {
    prisma.programAssignment.findUnique.mockResolvedValue(
      buildAssignment({ program: { coachId: OTHER_COACH_ID } }),
    );

    await expect(
      service.updateStatus(COACH_ID, 'assignment-1', {
        status: ProgramAssignmentStatus.FINISHED,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.programAssignment.update).not.toHaveBeenCalled();
  });

  it('lanza 404 si la asignación no existe', async () => {
    prisma.programAssignment.findUnique.mockResolvedValue(null);

    await expect(
      service.updateStatus(COACH_ID, 'no-existe', {
        status: ProgramAssignmentStatus.FINISHED,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('vuelve a validar duplicados al reactivar una asignación finalizada', async () => {
    prisma.programAssignment.findUnique.mockResolvedValue(
      buildAssignment({
        status: ProgramAssignmentStatus.FINISHED,
        program: { coachId: COACH_ID },
      }),
    );
    prisma.programAssignment.findFirst.mockResolvedValue(
      buildAssignment({ id: 'otra-asignacion-activa' }),
    );

    await expect(
      service.updateStatus(COACH_ID, 'assignment-1', {
        status: ProgramAssignmentStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.programAssignment.update).not.toHaveBeenCalled();
  });

  it('lanza 409 si la base de datos rechaza la reactivación por el índice único parcial', async () => {
    prisma.programAssignment.findUnique.mockResolvedValue(
      buildAssignment({
        status: ProgramAssignmentStatus.FINISHED,
        program: { coachId: COACH_ID },
      }),
    );
    prisma.programAssignment.findFirst.mockResolvedValue(null);
    prisma.programAssignment.update.mockRejectedValue(
      buildPrismaKnownError('P2002'),
    );

    await expect(
      service.updateStatus(COACH_ID, 'assignment-1', {
        status: ProgramAssignmentStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ProgramAssignmentsService.listForStudent', () => {
  it('filtra siempre por el studentId del usuario autenticado, nunca por otro', async () => {
    prisma.programAssignment.findMany.mockResolvedValue([]);

    await service.listForStudent(STUDENT_ID);

    expect(prisma.programAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: STUDENT_ID } }),
    );
  });

  it('nunca acepta ni usa un studentId distinto al recibido (protección alumno-alumno)', async () => {
    prisma.programAssignment.findMany.mockResolvedValue([
      buildAssignment({
        studentId: STUDENT_ID,
        program: {
          id: PROGRAM_ID,
          name: 'Fuerza',
          description: null,
          durationWeeks: 8,
          isActive: true,
        },
      }),
    ]);

    const result = await service.listForStudent(STUDENT_ID);

    expect(result.every((item) => item.studentId === STUDENT_ID)).toBe(true);
    const callArg = prisma.programAssignment.findMany.mock.calls[0][0];
    expect(callArg.where).toEqual({ studentId: STUDENT_ID });
  });
});
