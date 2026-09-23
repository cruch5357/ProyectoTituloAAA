import 'reflect-metadata';
import { Role } from '@prisma/client';
import {
  SessionExercisesNestedController,
  SessionExercisesController,
} from './session-exercises.controller';
import { SessionExercisesService } from './session-exercises.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import { PublicSessionExercise } from './session-exercise.mapper';

function buildCoachUser(): AuthenticatedUser {
  return {
    id: 'coach-123',
    email: 'coach@example.com',
    role: Role.COACH,
    name: 'Coach Uno',
    coachId: null,
  };
}

function buildItem(
  overrides: Partial<PublicSessionExercise> = {},
): PublicSessionExercise {
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
    exercise: {
      id: 'exercise-1',
      name: 'Sentadilla',
      muscleGroup: 'Piernas',
      isActive: true,
    },
    ...overrides,
  };
}

describe('SessionExercisesNestedController / SessionExercisesController - autorización declarada', () => {
  it('ambos controllers exigen el rol COACH', () => {
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, SessionExercisesNestedController),
    ).toEqual([Role.COACH]);
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, SessionExercisesController),
    ).toEqual([Role.COACH]);
  });
});

describe('SessionExercisesNestedController - delegación con coachId del token', () => {
  let sessionExercisesService: jest.Mocked<SessionExercisesService>;
  let controller: SessionExercisesNestedController;

  beforeEach(() => {
    sessionExercisesService = {
      listForSession: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<SessionExercisesService>;
    controller = new SessionExercisesNestedController(sessionExercisesService);
  });

  it('list() pasa el coachId del token y el sessionId de la ruta', async () => {
    sessionExercisesService.listForSession.mockResolvedValue([]);

    await controller.list(buildCoachUser(), { sessionId: 'session-1' });

    expect(sessionExercisesService.listForSession).toHaveBeenCalledWith(
      'coach-123',
      'session-1',
    );
  });

  it('create() pasa coachId, sessionId y dto al servicio', async () => {
    sessionExercisesService.create.mockResolvedValue(buildItem());

    await controller.create(
      buildCoachUser(),
      { sessionId: 'session-1' },
      { exerciseId: 'exercise-1' },
    );

    expect(sessionExercisesService.create).toHaveBeenCalledWith(
      'coach-123',
      'session-1',
      { exerciseId: 'exercise-1' },
    );
  });
});

describe('SessionExercisesController - delegación con coachId del token', () => {
  let sessionExercisesService: jest.Mocked<SessionExercisesService>;
  let controller: SessionExercisesController;

  beforeEach(() => {
    sessionExercisesService = {
      getOwnedByCoach: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<SessionExercisesService>;
    controller = new SessionExercisesController(sessionExercisesService);
  });

  it('detail() pasa el coachId del token y el :id', async () => {
    sessionExercisesService.getOwnedByCoach.mockResolvedValue(buildItem());

    await controller.detail(buildCoachUser(), { id: 'session-exercise-1' });

    expect(sessionExercisesService.getOwnedByCoach).toHaveBeenCalledWith(
      'coach-123',
      'session-exercise-1',
    );
  });

  it('update() pasa coachId, id y dto tal cual', async () => {
    sessionExercisesService.update.mockResolvedValue(
      buildItem({ targetSets: 5 }),
    );

    await controller.update(
      buildCoachUser(),
      { id: 'session-exercise-1' },
      { targetSets: 5 },
    );

    expect(sessionExercisesService.update).toHaveBeenCalledWith(
      'coach-123',
      'session-exercise-1',
      { targetSets: 5 },
    );
  });
});
