import { NotFoundException } from '@nestjs/common';
import { BlocksService } from './blocks.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgramsService } from '../programs/programs.service';

type MockTx = {
  block: Record<string, jest.Mock>;
};

type MockPrisma = MockTx & {
  $transaction: jest.Mock;
};

function buildMockPrisma(): MockPrisma {
  const tx: MockTx = {
    block: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    ...tx,
    $transaction: jest.fn((callback: (tx: MockTx) => unknown) =>
      callback(tx),
    ),
  };
}

const COACH_ID = 'coach-123';
const OTHER_COACH_ID = 'coach-999';

function buildBlock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'block-1',
    programId: 'program-1',
    name: 'Bloque 1',
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    program: { coachId: COACH_ID },
    ...overrides,
  };
}

let prisma: MockPrisma;
let programsService: jest.Mocked<ProgramsService>;
let service: BlocksService;

beforeEach(() => {
  prisma = buildMockPrisma();
  programsService = {
    findOwnedProgramOrThrow: jest.fn(),
  } as unknown as jest.Mocked<ProgramsService>;

  service = new BlocksService(
    prisma as unknown as PrismaService,
    programsService,
  );
});

describe('BlocksService.findOwnedBlockOrThrow / getOwnedByCoach', () => {
  it('retorna el bloque cuando su Program pertenece al coach autenticado', async () => {
    prisma.block.findUnique.mockResolvedValue(buildBlock());

    const result = await service.getOwnedByCoach(COACH_ID, 'block-1');

    expect(result.id).toBe('block-1');
    expect(prisma.block.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'block-1' },
        include: expect.any(Object),
      }),
    );
  });

  it('lanza 404 (nunca 403) si el bloque pertenece (vía su Program) a otro coach', async () => {
    prisma.block.findUnique.mockResolvedValue(
      buildBlock({ program: { coachId: OTHER_COACH_ID } }),
    );

    await expect(
      service.getOwnedByCoach(COACH_ID, 'block-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 404 si el bloque no existe', async () => {
    prisma.block.findUnique.mockResolvedValue(null);

    await expect(
      service.getOwnedByCoach(COACH_ID, 'no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BlocksService.listForProgram', () => {
  it('verifica la propiedad del programa antes de listar sus bloques', async () => {
    programsService.findOwnedProgramOrThrow.mockRejectedValue(
      new NotFoundException('Programa no encontrado'),
    );

    await expect(
      service.listForProgram(COACH_ID, 'program-de-otro-coach'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.block.findMany).not.toHaveBeenCalled();
  });

  it('lista los bloques del programa ordenados por `order`', async () => {
    programsService.findOwnedProgramOrThrow.mockResolvedValue(
      buildBlock().program as never,
    );
    prisma.block.findMany.mockResolvedValue([buildBlock()]);

    await service.listForProgram(COACH_ID, 'program-1');

    expect(prisma.block.findMany).toHaveBeenCalledWith({
      where: { programId: 'program-1' },
      orderBy: { order: 'asc' },
    });
  });
});

describe('BlocksService.create', () => {
  it('verifica la propiedad del programa padre antes de crear', async () => {
    programsService.findOwnedProgramOrThrow.mockRejectedValue(
      new NotFoundException('Programa no encontrado'),
    );

    await expect(
      service.create(COACH_ID, 'program-de-otro-coach', { name: 'Bloque X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('asigna el siguiente `order` disponible cuando no se especifica', async () => {
    programsService.findOwnedProgramOrThrow.mockResolvedValue({} as never);
    prisma.block.aggregate.mockResolvedValue({ _max: { order: 2 } });
    prisma.block.create.mockResolvedValue(buildBlock({ order: 3 }));

    const result = await service.create(COACH_ID, 'program-1', {
      name: 'Bloque 3',
    });

    expect(prisma.block.create).toHaveBeenCalledWith({
      data: { programId: 'program-1', name: 'Bloque 3', order: 3 },
    });
    expect(result.order).toBe(3);
  });

  it('inserta en una posición ocupada corriendo hacia adelante los bloques existentes', async () => {
    programsService.findOwnedProgramOrThrow.mockResolvedValue({} as never);
    prisma.block.create.mockResolvedValue(buildBlock({ order: 1 }));

    await service.create(COACH_ID, 'program-1', { name: 'Bloque nuevo', order: 1 });

    expect(prisma.block.updateMany).toHaveBeenCalledWith({
      where: { programId: 'program-1', order: { gte: 1 } },
      data: { order: { increment: 1 } },
    });
    expect(prisma.block.create).toHaveBeenCalledWith({
      data: { programId: 'program-1', name: 'Bloque nuevo', order: 1 },
    });
  });
});

describe('BlocksService.update', () => {
  it('actualiza solo el nombre sin abrir una transacción cuando `order` no cambia', async () => {
    prisma.block.findUnique.mockResolvedValue(buildBlock());
    prisma.block.update.mockResolvedValue(buildBlock({ name: 'Renombrado' }));

    await service.update(COACH_ID, 'block-1', { name: 'Renombrado' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.block.update).toHaveBeenCalledWith({
      where: { id: 'block-1' },
      data: { name: 'Renombrado' },
    });
  });

  it('mueve el `order` corriendo los bloques intermedios dentro de una transacción', async () => {
    prisma.block.findUnique.mockResolvedValue(buildBlock({ order: 1 }));
    prisma.block.update.mockResolvedValue(buildBlock({ order: 3 }));

    await service.update(COACH_ID, 'block-1', { order: 3 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.block.updateMany).toHaveBeenCalledWith({
      where: { programId: 'program-1', order: { gt: 1, lte: 3 } },
      data: { order: { decrement: 1 } },
    });
    expect(prisma.block.update).toHaveBeenCalledWith({
      where: { id: 'block-1' },
      data: { order: 3 },
    });
  });

  it('rechaza (404) editar un bloque de otro coach', async () => {
    prisma.block.findUnique.mockResolvedValue(
      buildBlock({ program: { coachId: OTHER_COACH_ID } }),
    );

    await expect(
      service.update(COACH_ID, 'block-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.block.update).not.toHaveBeenCalled();
  });
});
