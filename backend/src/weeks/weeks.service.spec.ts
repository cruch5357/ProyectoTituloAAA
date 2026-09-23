import { NotFoundException } from '@nestjs/common';
import { WeeksService } from './weeks.service';
import { PrismaService } from '../prisma/prisma.service';
import { BlocksService } from '../blocks/blocks.service';

type MockTx = {
  week: Record<string, jest.Mock>;
};

type MockPrisma = MockTx & {
  $transaction: jest.Mock;
};

function buildMockPrisma(): MockPrisma {
  const tx: MockTx = {
    week: {
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
    $transaction: jest.fn((callback: (tx: MockTx) => unknown) => callback(tx)),
  };
}

const COACH_ID = 'coach-123';
const OTHER_COACH_ID = 'coach-999';

function buildWeek(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'week-1',
    blockId: 'block-1',
    number: 1,
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    block: { program: { coachId: COACH_ID } },
    ...overrides,
  };
}

let prisma: MockPrisma;
let blocksService: jest.Mocked<BlocksService>;
let service: WeeksService;

beforeEach(() => {
  prisma = buildMockPrisma();
  blocksService = {
    findOwnedBlockOrThrow: jest.fn(),
  } as unknown as jest.Mocked<BlocksService>;

  service = new WeeksService(prisma as unknown as PrismaService, blocksService);
});

describe('WeeksService.getOwnedByCoach', () => {
  it('retorna la semana cuando la cadena Block->Program pertenece al coach', async () => {
    prisma.week.findUnique.mockResolvedValue(buildWeek());

    const result = await service.getOwnedByCoach(COACH_ID, 'week-1');

    expect(result.id).toBe('week-1');
  });

  it('lanza 404 si la semana pertenece (vía la cadena) a otro coach', async () => {
    prisma.week.findUnique.mockResolvedValue(
      buildWeek({ block: { program: { coachId: OTHER_COACH_ID } } }),
    );

    await expect(
      service.getOwnedByCoach(COACH_ID, 'week-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 404 si la semana no existe', async () => {
    prisma.week.findUnique.mockResolvedValue(null);

    await expect(
      service.getOwnedByCoach(COACH_ID, 'no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('WeeksService.listForBlock', () => {
  it('verifica la propiedad del bloque antes de listar sus semanas', async () => {
    blocksService.findOwnedBlockOrThrow.mockRejectedValue(
      new NotFoundException('Bloque no encontrado'),
    );

    await expect(
      service.listForBlock(COACH_ID, 'block-de-otro-coach'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.week.findMany).not.toHaveBeenCalled();
  });

  it('lista las semanas del bloque ordenadas por `order`', async () => {
    blocksService.findOwnedBlockOrThrow.mockResolvedValue({} as never);
    prisma.week.findMany.mockResolvedValue([buildWeek()]);

    await service.listForBlock(COACH_ID, 'block-1');

    expect(prisma.week.findMany).toHaveBeenCalledWith({
      where: { blockId: 'block-1' },
      orderBy: { order: 'asc' },
    });
  });
});

describe('WeeksService.create', () => {
  it('verifica la propiedad del bloque padre antes de crear', async () => {
    blocksService.findOwnedBlockOrThrow.mockRejectedValue(
      new NotFoundException('Bloque no encontrado'),
    );

    await expect(
      service.create(COACH_ID, 'block-de-otro-coach', { number: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('asigna el siguiente `order` disponible cuando no se especifica', async () => {
    blocksService.findOwnedBlockOrThrow.mockResolvedValue({} as never);
    prisma.week.aggregate.mockResolvedValue({ _max: { order: 1 } });
    prisma.week.create.mockResolvedValue(buildWeek({ number: 2, order: 2 }));

    const result = await service.create(COACH_ID, 'block-1', { number: 2 });

    expect(prisma.week.create).toHaveBeenCalledWith({
      data: { blockId: 'block-1', number: 2, order: 2 },
    });
    expect(result.order).toBe(2);
  });

  it('inserta en una posición ocupada corriendo hacia adelante las semanas existentes', async () => {
    blocksService.findOwnedBlockOrThrow.mockResolvedValue({} as never);
    prisma.week.create.mockResolvedValue(buildWeek({ order: 1 }));

    await service.create(COACH_ID, 'block-1', { number: 1, order: 1 });

    expect(prisma.week.updateMany).toHaveBeenCalledWith({
      where: { blockId: 'block-1', order: { gte: 1 } },
      data: { order: { increment: 1 } },
    });
  });
});

describe('WeeksService.update', () => {
  it('actualiza solo el número sin abrir una transacción cuando `order` no cambia', async () => {
    prisma.week.findUnique.mockResolvedValue(buildWeek());
    prisma.week.update.mockResolvedValue(buildWeek({ number: 5 }));

    await service.update(COACH_ID, 'week-1', { number: 5 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.week.update).toHaveBeenCalledWith({
      where: { id: 'week-1' },
      data: { number: 5 },
    });
  });

  it('mueve el `order` corriendo las semanas intermedias dentro de una transacción', async () => {
    prisma.week.findUnique.mockResolvedValue(buildWeek({ order: 3 }));
    prisma.week.update.mockResolvedValue(buildWeek({ order: 1 }));

    await service.update(COACH_ID, 'week-1', { order: 1 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.week.updateMany).toHaveBeenCalledWith({
      where: { blockId: 'block-1', order: { gte: 1, lt: 3 } },
      data: { order: { increment: 1 } },
    });
  });

  it('rechaza (404) editar una semana de otro coach', async () => {
    prisma.week.findUnique.mockResolvedValue(
      buildWeek({ block: { program: { coachId: OTHER_COACH_ID } } }),
    );

    await expect(
      service.update(COACH_ID, 'week-1', { number: 2 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.week.update).not.toHaveBeenCalled();
  });
});
