import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SessionExercisesService } from './session-exercises.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';

type MockTx = {
  sessionExercise: Record<string, jest.Mock>;
};

type MockPrisma = MockTx & {
  exercise: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function buildMockPrisma(): MockPrisma {
  const tx: MockTx = {
    sessionExercise: {
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
    exercise: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: MockTx) => unknown) => callback(tx)),
  };
}

const COACH_ID = 'coach-123';
const OTHER_COACH_ID = 'coach-999';

function buildExercise(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'exercise-1',
    coachId: COACH_ID,
    name: 'Sentadilla',
    muscleGroup: 'Piernas',
    instructions: null,
    videoUrl: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildSessionExercise(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'session-exercise-1',
    sessionId: 'session-1',
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
    session: { week: { block: { program: { coachId: COACH_ID } } } },
    exercise: buildExercise(),
    ...overrides,
  };
}

let prisma: MockPrisma;
let sessionsService: jest.Mocked<SessionsService>;
let service: SessionExercisesService;

beforeEach(() => {
  prisma = buildMockPrisma();
  sessionsService = {
    findOwnedSessionOrThrow: jest.fn(),
  } as unknown as jest.Mocked<SessionsService>;

  service = new SessionExercisesService(
    prisma as unknown as PrismaService,
    sessionsService,
  );
});

describe('SessionExercisesService.getOwnedByCoach', () => {
  it('retorna el item cuando la cadena completa pertenece al coach', async () => {
    prisma.sessionExercise.findUnique.mockResolvedValue(buildSessionExercise());

    const result = await service.getOwnedByCoach(COACH_ID, 'session-exercise-1');

    expect(result.id).toBe('session-exercise-1');
    expect(result.exercise.id).toBe('exercise-1');
  });

  it('lanza 404 si pertenece (vía la cadena de Session) a otro coach', async () => {
    prisma.sessionExercise.findUnique.mockResolvedValue(
      buildSessionExercise({
        session: { week: { block: { program: { coachId: OTHER_COACH_ID } } } },
      }),
    );

    await expect(
      service.getOwnedByCoach(COACH_ID, 'session-exercise-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SessionExercisesService.create', () => {
  it('verifica la propiedad de la sesión antes de crear', async () => {
    sessionsService.findOwnedSessionOrThrow.mockRejectedValue(
      new NotFoundException('Sesión no encontrada'),
    );

    await expect(
      service.create(COACH_ID, 'session-de-otro-coach', {
        exerciseId: 'exercise-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.exercise.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza (404) un exerciseId que pertenece a otro coach, aunque la sesión sí sea propia', async () => {
    sessionsService.findOwnedSessionOrThrow.mockResolvedValue({} as never);
    prisma.exercise.findUnique.mockResolvedValue(
      buildExercise({ coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.create(COACH_ID, 'session-1', { exerciseId: 'exercise-ajeno' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza (404) un exerciseId inexistente', async () => {
    sessionsService.findOwnedSessionOrThrow.mockResolvedValue({} as never);
    prisma.exercise.findUnique.mockResolvedValue(null);

    await expect(
      service.create(COACH_ID, 'session-1', { exerciseId: 'no-existe' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza (422) targetRepsMax menor que targetRepsMin', async () => {
    sessionsService.findOwnedSessionOrThrow.mockResolvedValue({} as never);
    prisma.exercise.findUnique.mockResolvedValue(buildExercise());

    await expect(
      service.create(COACH_ID, 'session-1', {
        exerciseId: 'exercise-1',
        targetRepsMin: 12,
        targetRepsMax: 8,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('crea el item relacionando el exerciseId existente, sin copiar sus datos', async () => {
    sessionsService.findOwnedSessionOrThrow.mockResolvedValue({} as never);
    prisma.exercise.findUnique.mockResolvedValue(buildExercise());
    prisma.sessionExercise.aggregate.mockResolvedValue({ _max: { order: 0 } });
    prisma.sessionExercise.create.mockResolvedValue(buildSessionExercise());

    await service.create(COACH_ID, 'session-1', {
      exerciseId: 'exercise-1',
      targetSets: 4,
      targetRepsMin: 8,
      targetRepsMax: 12,
    });

    expect(prisma.sessionExercise.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        exerciseId: 'exercise-1',
        order: 1,
        targetSets: 4,
        targetRepsMin: 8,
        targetRepsMax: 12,
        targetRpe: undefined,
        targetRir: undefined,
        restSeconds: undefined,
        notes: undefined,
      },
      include: { exercise: true },
    });
  });

  it('convierte targetRpe (Decimal) a number en la respuesta pública', async () => {
    sessionsService.findOwnedSessionOrThrow.mockResolvedValue({} as never);
    prisma.exercise.findUnique.mockResolvedValue(buildExercise());
    prisma.sessionExercise.aggregate.mockResolvedValue({ _max: { order: null } });
    prisma.sessionExercise.create.mockResolvedValue(
      buildSessionExercise({ targetRpe: { toString: () => '8.5' } as never }),
    );

    const result = await service.create(COACH_ID, 'session-1', {
      exerciseId: 'exercise-1',
      targetRpe: 8.5,
    });

    expect(result.targetRpe).toBe(8.5);
  });
});

describe('SessionExercisesService.update', () => {
  it('revalida la propiedad del nuevo exerciseId al reemplazarlo', async () => {
    prisma.sessionExercise.findUnique.mockResolvedValue(buildSessionExercise());
    prisma.exercise.findUnique.mockResolvedValue(
      buildExercise({ id: 'exercise-2', coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.update(COACH_ID, 'session-exercise-1', { exerciseId: 'exercise-2' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sessionExercise.update).not.toHaveBeenCalled();
  });

  it('rechaza (422) un rango de reps inválido combinando valores existentes y nuevos', async () => {
    prisma.sessionExercise.findUnique.mockResolvedValue(
      buildSessionExercise({ targetRepsMin: 8, targetRepsMax: 12 }),
    );

    await expect(
      service.update(COACH_ID, 'session-exercise-1', { targetRepsMax: 5 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('actualiza solo los campos de prescripción presentes en el dto', async () => {
    prisma.sessionExercise.findUnique.mockResolvedValue(buildSessionExercise());
    prisma.sessionExercise.update.mockResolvedValue(
      buildSessionExercise({ targetSets: 5 }),
    );

    await service.update(COACH_ID, 'session-exercise-1', { targetSets: 5 });

    expect(prisma.sessionExercise.update).toHaveBeenCalledWith({
      where: { id: 'session-exercise-1' },
      data: { targetSets: 5 },
      include: { exercise: true },
    });
  });

  it('mueve el `order` corriendo los items intermedios dentro de una transacción', async () => {
    prisma.sessionExercise.findUnique.mockResolvedValue(
      buildSessionExercise({ order: 1 }),
    );
    prisma.sessionExercise.update.mockResolvedValue(
      buildSessionExercise({ order: 2 }),
    );

    await service.update(COACH_ID, 'session-exercise-1', { order: 2 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.sessionExercise.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1', order: { gt: 1, lte: 2 } },
      data: { order: { decrement: 1 } },
    });
  });

  it('rechaza (404) editar un item de otro coach', async () => {
    prisma.sessionExercise.findUnique.mockResolvedValue(
      buildSessionExercise({
        session: { week: { block: { program: { coachId: OTHER_COACH_ID } } } },
      }),
    );

    await expect(
      service.update(COACH_ID, 'session-exercise-1', { targetSets: 3 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SessionExercisesService.listForSession', () => {
  it('verifica la propiedad de la sesión antes de listar', async () => {
    sessionsService.findOwnedSessionOrThrow.mockRejectedValue(
      new NotFoundException('Sesión no encontrada'),
    );

    await expect(
      service.listForSession(COACH_ID, 'session-de-otro-coach'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sessionExercise.findMany).not.toHaveBeenCalled();
  });

  it('incluye el ejercicio embebido y ordena por `order`', async () => {
    sessionsService.findOwnedSessionOrThrow.mockResolvedValue({} as never);
    prisma.sessionExercise.findMany.mockResolvedValue([buildSessionExercise()]);

    const result = await service.listForSession(COACH_ID, 'session-1');

    expect(prisma.sessionExercise.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      orderBy: { order: 'asc' },
      include: { exercise: true },
    });
    expect(result[0].exercise.name).toBe('Sentadilla');
  });
});
