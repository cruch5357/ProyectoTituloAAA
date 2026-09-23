import { NotFoundException } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type MockPrisma = {
  program: Record<string, jest.Mock>;
};

function buildMockPrisma(): MockPrisma {
  return {
    program: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

let prisma: MockPrisma;
let auditService: jest.Mocked<AuditService>;
let service: ProgramsService;

const COACH_ID = 'coach-123';
const OTHER_COACH_ID = 'coach-999';

function buildProgram(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'program-1',
    coachId: COACH_ID,
    name: 'Fuerza - Bloque base',
    description: null,
    durationWeeks: 8,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  prisma = buildMockPrisma();
  auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditService>;

  service = new ProgramsService(prisma as unknown as PrismaService, auditService);
});

describe('ProgramsService.listForCoach', () => {
  it('filtra siempre por el coachId del usuario autenticado', async () => {
    prisma.program.findMany.mockResolvedValue([buildProgram()]);
    prisma.program.count.mockResolvedValue(1);

    await service.listForCoach(COACH_ID, { page: 1, limit: 20 });

    expect(prisma.program.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coachId: COACH_ID }),
      }),
    );
  });

  it('aplica paginación (skip/take) según page y limit', async () => {
    prisma.program.findMany.mockResolvedValue([]);
    prisma.program.count.mockResolvedValue(0);

    await service.listForCoach(COACH_ID, { page: 2, limit: 5 });

    expect(prisma.program.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
  });

  it('no filtra por isActive: devuelve programas activos e inactivos', async () => {
    prisma.program.findMany.mockResolvedValue([]);
    prisma.program.count.mockResolvedValue(0);

    await service.listForCoach(COACH_ID, { page: 1, limit: 20 });

    const callArg = prisma.program.findMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty('isActive');
  });
});

describe('ProgramsService.getOwnedByCoach / ensureOwnedProgram', () => {
  it('retorna el programa cuando pertenece al coach autenticado', async () => {
    prisma.program.findUnique.mockResolvedValue(buildProgram());

    const result = await service.getOwnedByCoach(COACH_ID, 'program-1');

    expect(result.id).toBe('program-1');
  });

  it('lanza 404 (nunca 403) si el programa pertenece a otro coach', async () => {
    prisma.program.findUnique.mockResolvedValue(
      buildProgram({ coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.getOwnedByCoach(COACH_ID, 'program-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 404 si el id no existe', async () => {
    prisma.program.findUnique.mockResolvedValue(null);

    await expect(
      service.getOwnedByCoach(COACH_ID, 'no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProgramsService.create', () => {
  it('crea el programa con el coachId del usuario autenticado, nunca uno del dto', async () => {
    prisma.program.create.mockResolvedValue(buildProgram());

    await service.create(COACH_ID, { name: 'Fuerza - Bloque base' });

    expect(prisma.program.create).toHaveBeenCalledWith({
      data: {
        coachId: COACH_ID,
        name: 'Fuerza - Bloque base',
        description: undefined,
        durationWeeks: undefined,
      },
    });
  });
});

describe('ProgramsService.update', () => {
  it('actualiza solo los campos presentes en el dto', async () => {
    prisma.program.findUnique.mockResolvedValue(buildProgram());
    prisma.program.update.mockResolvedValue(
      buildProgram({ name: 'Nuevo nombre' }),
    );

    await service.update(COACH_ID, 'program-1', { name: 'Nuevo nombre' });

    expect(prisma.program.update).toHaveBeenCalledWith({
      where: { id: 'program-1' },
      data: { name: 'Nuevo nombre' },
    });
  });

  it('el objeto `data` enviado a Prisma nunca incluye coachId/isActive', async () => {
    prisma.program.findUnique.mockResolvedValue(buildProgram());
    prisma.program.update.mockResolvedValue(buildProgram());

    await service.update(COACH_ID, 'program-1', {
      name: 'Nuevo nombre',
      // @ts-expect-error -- simula un intento de mass assignment.
      coachId: OTHER_COACH_ID,
      isActive: false,
    });

    const dataArg = prisma.program.update.mock.calls[0][0].data;
    expect(Object.keys(dataArg)).toEqual(['name']);
  });

  it('rechaza (404) editar un programa de otro coach', async () => {
    prisma.program.findUnique.mockResolvedValue(
      buildProgram({ coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.update(COACH_ID, 'program-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.program.update).not.toHaveBeenCalled();
  });
});

describe('ProgramsService.updateStatus', () => {
  it('actualiza isActive y registra auditoría cuando el programa es propio', async () => {
    prisma.program.findUnique.mockResolvedValue(buildProgram({ isActive: true }));
    prisma.program.update.mockResolvedValue(buildProgram({ isActive: false }));

    const result = await service.updateStatus(COACH_ID, 'program-1', {
      isActive: false,
    });

    expect(prisma.program.update).toHaveBeenCalledWith({
      where: { id: 'program-1' },
      data: { isActive: false },
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: COACH_ID,
        entityId: 'program-1',
        metadata: { isActive: false },
      }),
    );
    expect(result.isActive).toBe(false);
  });

  it('rechaza (404) archivar un programa de otro coach', async () => {
    prisma.program.findUnique.mockResolvedValue(
      buildProgram({ coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.updateStatus(COACH_ID, 'program-1', { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.program.update).not.toHaveBeenCalled();
  });
});
