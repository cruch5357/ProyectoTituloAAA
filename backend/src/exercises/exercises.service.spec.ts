import { NotFoundException } from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type MockPrisma = {
  exercise: Record<string, jest.Mock>;
};

function buildMockPrisma(): MockPrisma {
  return {
    exercise: {
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
let service: ExercisesService;

const COACH_ID = 'coach-123';
const OTHER_COACH_ID = 'coach-999';

function buildExercise(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'exercise-1',
    coachId: COACH_ID,
    name: 'Sentadilla trasera',
    muscleGroup: 'Piernas',
    instructions: null,
    videoUrl: null,
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

  service = new ExercisesService(
    prisma as unknown as PrismaService,
    auditService,
  );
});

// ---------------------------------------------------------------------------
// GET /exercises — un coach solo obtiene su propio catálogo.
// ---------------------------------------------------------------------------
describe('ExercisesService.listForCoach', () => {
  it('filtra siempre por el coachId del usuario autenticado, nunca por uno de la query', async () => {
    prisma.exercise.findMany.mockResolvedValue([buildExercise()]);
    prisma.exercise.count.mockResolvedValue(1);

    await service.listForCoach(COACH_ID, { page: 1, limit: 20 });

    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coachId: COACH_ID }),
      }),
    );
    expect(prisma.exercise.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coachId: COACH_ID }),
      }),
    );
  });

  it('aplica paginación (skip/take) según page y limit', async () => {
    prisma.exercise.findMany.mockResolvedValue([]);
    prisma.exercise.count.mockResolvedValue(0);

    await service.listForCoach(COACH_ID, { page: 3, limit: 10 });

    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('agrega búsqueda por nombre/grupo muscular solo cuando se envía `search`', async () => {
    prisma.exercise.findMany.mockResolvedValue([]);
    prisma.exercise.count.mockResolvedValue(0);

    await service.listForCoach(COACH_ID, {
      page: 1,
      limit: 20,
      search: 'sentadilla',
    });

    const callArg = prisma.exercise.findMany.mock.calls[0][0];
    expect(callArg.where.OR).toEqual([
      { name: { contains: 'sentadilla', mode: 'insensitive' } },
      { muscleGroup: { contains: 'sentadilla', mode: 'insensitive' } },
    ]);
  });

  it('no filtra por isActive: devuelve ejercicios activos e inactivos', async () => {
    prisma.exercise.findMany.mockResolvedValue([]);
    prisma.exercise.count.mockResolvedValue(0);

    await service.listForCoach(COACH_ID, { page: 1, limit: 20 });

    const callArg = prisma.exercise.findMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty('isActive');
  });
});

// ---------------------------------------------------------------------------
// GET /exercises/:id — Coach ve el detalle de un ejercicio propio; NO puede
// ver el de otro coach.
// ---------------------------------------------------------------------------
describe('ExercisesService.getOwnedByCoach', () => {
  it('retorna el ejercicio cuando pertenece al coach autenticado', async () => {
    prisma.exercise.findUnique.mockResolvedValue(buildExercise());

    const result = await service.getOwnedByCoach(COACH_ID, 'exercise-1');

    expect(result.id).toBe('exercise-1');
  });

  it('lanza 404 (nunca 403) si el ejercicio pertenece a otro coach', async () => {
    prisma.exercise.findUnique.mockResolvedValue(
      buildExercise({ coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.getOwnedByCoach(COACH_ID, 'exercise-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza 404 si el id no existe', async () => {
    prisma.exercise.findUnique.mockResolvedValue(null);

    await expect(
      service.getOwnedByCoach(COACH_ID, 'no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// POST /exercises — creación de un ejercicio propio.
// ---------------------------------------------------------------------------
describe('ExercisesService.create', () => {
  it('crea el ejercicio con el coachId del usuario autenticado, nunca uno del dto', async () => {
    prisma.exercise.create.mockResolvedValue(buildExercise());

    await service.create(COACH_ID, {
      name: 'Sentadilla trasera',
      muscleGroup: 'Piernas',
    });

    expect(prisma.exercise.create).toHaveBeenCalledWith({
      data: {
        coachId: COACH_ID,
        name: 'Sentadilla trasera',
        muscleGroup: 'Piernas',
        instructions: undefined,
        videoUrl: undefined,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// PATCH /exercises/:id — edición de datos; PATCH /exercises/:id/status —
// activar/desactivar (única forma de "eliminar", ver StudentsService).
// ---------------------------------------------------------------------------
describe('ExercisesService.update', () => {
  it('actualiza solo los campos presentes en el dto', async () => {
    prisma.exercise.findUnique.mockResolvedValue(buildExercise());
    prisma.exercise.update.mockResolvedValue(
      buildExercise({ name: 'Sentadilla frontal' }),
    );

    await service.update(COACH_ID, 'exercise-1', {
      name: 'Sentadilla frontal',
    });

    expect(prisma.exercise.update).toHaveBeenCalledWith({
      where: { id: 'exercise-1' },
      data: { name: 'Sentadilla frontal' },
    });
  });

  it('el objeto `data` enviado a Prisma nunca incluye coachId/isActive', async () => {
    prisma.exercise.findUnique.mockResolvedValue(buildExercise());
    prisma.exercise.update.mockResolvedValue(buildExercise());

    await service.update(COACH_ID, 'exercise-1', {
      name: 'Sentadilla frontal',
      // @ts-expect-error -- simula un intento de mass assignment; el
      // servicio nunca reenvía el DTO completo a Prisma.
      coachId: OTHER_COACH_ID,
      isActive: false,
    });

    const dataArg = prisma.exercise.update.mock.calls[0][0].data;
    expect(Object.keys(dataArg)).toEqual(['name']);
  });

  it('rechaza (404) editar un ejercicio de otro coach', async () => {
    prisma.exercise.findUnique.mockResolvedValue(
      buildExercise({ coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.update(COACH_ID, 'exercise-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.exercise.update).not.toHaveBeenCalled();
  });
});

describe('ExercisesService.updateStatus', () => {
  it('actualiza isActive cuando el ejercicio pertenece al coach autenticado', async () => {
    prisma.exercise.findUnique.mockResolvedValue(
      buildExercise({ isActive: true }),
    );
    prisma.exercise.update.mockResolvedValue(
      buildExercise({ isActive: false }),
    );

    const result = await service.updateStatus(COACH_ID, 'exercise-1', {
      isActive: false,
    });

    expect(prisma.exercise.update).toHaveBeenCalledWith({
      where: { id: 'exercise-1' },
      data: { isActive: false },
    });
    expect(result.isActive).toBe(false);
  });

  it('rechaza (404) desactivar un ejercicio de otro coach', async () => {
    prisma.exercise.findUnique.mockResolvedValue(
      buildExercise({ coachId: OTHER_COACH_ID }),
    );

    await expect(
      service.updateStatus(COACH_ID, 'exercise-1', { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.exercise.update).not.toHaveBeenCalled();
  });

  it('registra la acción en AuditLog', async () => {
    prisma.exercise.findUnique.mockResolvedValue(buildExercise());
    prisma.exercise.update.mockResolvedValue(
      buildExercise({ isActive: false }),
    );

    await service.updateStatus(COACH_ID, 'exercise-1', { isActive: false });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: COACH_ID,
        entityId: 'exercise-1',
        metadata: { isActive: false },
      }),
    );
  });
});
