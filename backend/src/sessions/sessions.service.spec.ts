import { NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../prisma/prisma.service';
import { WeeksService } from '../weeks/weeks.service';

type MockTx = {
  session: Record<string, jest.Mock>;
};

type MockPrisma = MockTx & {
  $transaction: jest.Mock;
};

function buildMockPrisma(): MockPrisma {
  const tx: MockTx = {
    session: {
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

function buildSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'session-1',
    weekId: 'week-1',
    name: 'Sesión A',
    dayOfWeek: 1,
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    week: { block: { program: { coachId: COACH_ID } } },
    ...overrides,
  };
}

let prisma: MockPrisma;
let weeksService: jest.Mocked<WeeksService>;
let service: SessionsService;

beforeEach(() => {
  prisma = buildMockPrisma();
  weeksService = {
    findOwnedWeekOrThrow: jest.fn(),
  } as unknown as jest.Mocked<WeeksService>;

  service = new SessionsService(prisma as unknown as PrismaService, weeksService);
});

describe('SessionsService.getOwnedByCoach', () => {
  it('retorna la sesión cuando la cadena Week->Block->Program pertenece al coach', async () => {
    prisma.session.findUnique.mockResolvedValue(buildSession());

    const result = await service.getOwnedByCoach(COACH_ID, 'session-1');

    expect(result.id).toBe('session-1');
  });

  it('lanza 404 si la sesión pertenece (vía la cadena) a otro coach', async () => {
    prisma.session.findUnique.mockResolvedValue(
      buildSession({ week: { block: { program: { coachId: OTHER_COACH_ID } } } }),
    );

    await expect(
      service.getOwnedByCoach(COACH_ID, 'session-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 404 si la sesión no existe', async () => {
    prisma.session.findUnique.mockResolvedValue(null);

    await expect(
      service.getOwnedByCoach(COACH_ID, 'no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SessionsService.listForWeek', () => {
  it('verifica la propiedad de la semana antes de listar sus sesiones', async () => {
    weeksService.findOwnedWeekOrThrow.mockRejectedValue(
      new NotFoundException('Semana no encontrada'),
    );

    await expect(
      service.listForWeek(COACH_ID, 'week-de-otro-coach'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.session.findMany).not.toHaveBeenCalled();
  });

  it('lista las sesiones de la semana ordenadas por `order`', async () => {
    weeksService.findOwnedWeekOrThrow.mockResolvedValue({} as never);
    prisma.session.findMany.mockResolvedValue([buildSession()]);

    await service.listForWeek(COACH_ID, 'week-1');

    expect(prisma.session.findMany).toHaveBeenCalledWith({
      where: { weekId: 'week-1' },
      orderBy: { order: 'asc' },
    });
  });
});

describe('SessionsService.create', () => {
  it('verifica la propiedad de la semana padre antes de crear', async () => {
    weeksService.findOwnedWeekOrThrow.mockRejectedValue(
      new NotFoundException('Semana no encontrada'),
    );

    await expect(
      service.create(COACH_ID, 'week-de-otro-coach', { name: 'Sesión X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('asigna el siguiente `order` disponible cuando no se especifica', async () => {
    weeksService.findOwnedWeekOrThrow.mockResolvedValue({} as never);
    prisma.session.aggregate.mockResolvedValue({ _max: { order: 1 } });
    prisma.session.create.mockResolvedValue(buildSession({ order: 2 }));

    const result = await service.create(COACH_ID, 'week-1', {
      name: 'Sesión B',
    });

    expect(prisma.session.create).toHaveBeenCalledWith({
      data: { weekId: 'week-1', name: 'Sesión B', dayOfWeek: undefined, order: 2 },
    });
    expect(result.order).toBe(2);
  });
});

describe('SessionsService.update', () => {
  it('actualiza solo el nombre sin abrir una transacción cuando `order` no cambia', async () => {
    prisma.session.findUnique.mockResolvedValue(buildSession());
    prisma.session.update.mockResolvedValue(buildSession({ name: 'Sesión renombrada' }));

    await service.update(COACH_ID, 'session-1', { name: 'Sesión renombrada' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { name: 'Sesión renombrada' },
    });
  });

  it('mueve el `order` corriendo las sesiones intermedias dentro de una transacción', async () => {
    prisma.session.findUnique.mockResolvedValue(buildSession({ order: 1 }));
    prisma.session.update.mockResolvedValue(buildSession({ order: 2 }));

    await service.update(COACH_ID, 'session-1', { order: 2 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { weekId: 'week-1', order: { gt: 1, lte: 2 } },
      data: { order: { decrement: 1 } },
    });
  });

  it('rechaza (404) editar una sesión de otro coach', async () => {
    prisma.session.findUnique.mockResolvedValue(
      buildSession({ week: { block: { program: { coachId: OTHER_COACH_ID } } } }),
    );

    await expect(
      service.update(COACH_ID, 'session-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.session.update).not.toHaveBeenCalled();
  });
});
