import 'reflect-metadata';
import { Role } from '@prisma/client';
import { WeekSessionsController, SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import { PublicSession } from './session.mapper';

function buildCoachUser(): AuthenticatedUser {
  return {
    id: 'coach-123',
    email: 'coach@example.com',
    role: Role.COACH,
    name: 'Coach Uno',
    coachId: null,
  };
}

function buildSession(overrides: Partial<PublicSession> = {}): PublicSession {
  return {
    id: 'session-1',
    weekId: 'week-1',
    name: 'Sesión A',
    dayOfWeek: 1,
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('WeekSessionsController / SessionsController - autorización declarada', () => {
  it('ambos controllers exigen el rol COACH', () => {
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, WeekSessionsController),
    ).toEqual([Role.COACH]);
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, SessionsController),
    ).toEqual([Role.COACH]);
  });
});

describe('WeekSessionsController - delegación con coachId del token', () => {
  let sessionsService: jest.Mocked<SessionsService>;
  let controller: WeekSessionsController;

  beforeEach(() => {
    sessionsService = {
      listForWeek: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<SessionsService>;
    controller = new WeekSessionsController(sessionsService);
  });

  it('list() pasa el coachId del token y el weekId de la ruta', async () => {
    sessionsService.listForWeek.mockResolvedValue([]);

    await controller.list(buildCoachUser(), { weekId: 'week-1' });

    expect(sessionsService.listForWeek).toHaveBeenCalledWith(
      'coach-123',
      'week-1',
    );
  });

  it('create() pasa coachId, weekId y dto al servicio', async () => {
    sessionsService.create.mockResolvedValue(buildSession());

    await controller.create(
      buildCoachUser(),
      { weekId: 'week-1' },
      { name: 'Sesión A' },
    );

    expect(sessionsService.create).toHaveBeenCalledWith(
      'coach-123',
      'week-1',
      { name: 'Sesión A' },
    );
  });
});

describe('SessionsController - delegación con coachId del token', () => {
  let sessionsService: jest.Mocked<SessionsService>;
  let controller: SessionsController;

  beforeEach(() => {
    sessionsService = {
      getOwnedByCoach: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<SessionsService>;
    controller = new SessionsController(sessionsService);
  });

  it('detail() pasa el coachId del token y el :id', async () => {
    sessionsService.getOwnedByCoach.mockResolvedValue(buildSession());

    await controller.detail(buildCoachUser(), { id: 'session-1' });

    expect(sessionsService.getOwnedByCoach).toHaveBeenCalledWith(
      'coach-123',
      'session-1',
    );
  });

  it('update() pasa coachId, id y dto tal cual', async () => {
    sessionsService.update.mockResolvedValue(buildSession({ order: 2 }));

    await controller.update(
      buildCoachUser(),
      { id: 'session-1' },
      { order: 2 },
    );

    expect(sessionsService.update).toHaveBeenCalledWith(
      'coach-123',
      'session-1',
      { order: 2 },
    );
  });
});
