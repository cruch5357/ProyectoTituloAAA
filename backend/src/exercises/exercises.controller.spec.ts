import 'reflect-metadata';
import { Role } from '@prisma/client';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import { PublicExercise } from './exercise.mapper';

function buildCoachUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: 'coach-123',
    email: 'coach@example.com',
    role: Role.COACH,
    name: 'Coach Uno',
    coachId: null,
    ...overrides,
  };
}

function buildExercise(
  overrides: Partial<PublicExercise> = {},
): PublicExercise {
  return {
    id: 'exercise-1',
    coachId: 'coach-123',
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

describe('ExercisesController - autorización declarada', () => {
  it('el controller entero exige el rol COACH (RolesGuard, vía @Roles)', () => {
    const requiredRoles = Reflect.getMetadata(
      ROLES_METADATA_KEY,
      ExercisesController,
    );
    expect(requiredRoles).toEqual([Role.COACH]);
  });
});

describe('ExercisesController - delegación al servicio con coachId del token', () => {
  let exercisesService: jest.Mocked<ExercisesService>;
  let controller: ExercisesController;

  beforeEach(() => {
    exercisesService = {
      listForCoach: jest.fn(),
      getOwnedByCoach: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<ExercisesService>;
    controller = new ExercisesController(exercisesService);
  });

  it('list() usa siempre el id de CurrentUser(), nunca uno de la query', async () => {
    exercisesService.listForCoach.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });
    const currentUser = buildCoachUser();

    await controller.list(currentUser, { page: 1, limit: 20 });

    expect(exercisesService.listForCoach).toHaveBeenCalledWith(
      'coach-123',
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it('detail() pasa el id del coach autenticado y el :id validado al servicio', async () => {
    exercisesService.getOwnedByCoach.mockResolvedValue(buildExercise());
    const currentUser = buildCoachUser();

    await controller.detail(currentUser, { id: 'exercise-1' });

    expect(exercisesService.getOwnedByCoach).toHaveBeenCalledWith(
      'coach-123',
      'exercise-1',
    );
  });

  it('create() usa el id del coach autenticado, nunca uno del body', async () => {
    exercisesService.create.mockResolvedValue(buildExercise());
    const currentUser = buildCoachUser();

    await controller.create(currentUser, { name: 'Sentadilla' });

    expect(exercisesService.create).toHaveBeenCalledWith(
      'coach-123',
      expect.objectContaining({ name: 'Sentadilla' }),
    );
  });

  it('update() pasa coachId, id y dto tal cual al servicio', async () => {
    exercisesService.update.mockResolvedValue(
      buildExercise({ name: 'Sentadilla frontal' }),
    );
    const currentUser = buildCoachUser();

    await controller.update(
      currentUser,
      { id: 'exercise-1' },
      { name: 'Sentadilla frontal' },
    );

    expect(exercisesService.update).toHaveBeenCalledWith(
      'coach-123',
      'exercise-1',
      { name: 'Sentadilla frontal' },
    );
  });

  it('updateStatus() nunca reenvía más que { isActive } al servicio', async () => {
    exercisesService.updateStatus.mockResolvedValue(
      buildExercise({ isActive: false }),
    );
    const currentUser = buildCoachUser();

    await controller.updateStatus(
      currentUser,
      { id: 'exercise-1' },
      { isActive: false },
    );

    expect(exercisesService.updateStatus).toHaveBeenCalledWith(
      'coach-123',
      'exercise-1',
      { isActive: false },
    );
  });
});
