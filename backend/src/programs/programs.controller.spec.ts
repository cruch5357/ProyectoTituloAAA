import 'reflect-metadata';
import { Role } from '@prisma/client';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import { PublicProgram } from './program.mapper';

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

function buildProgram(overrides: Partial<PublicProgram> = {}): PublicProgram {
  return {
    id: 'program-1',
    coachId: 'coach-123',
    name: 'Fuerza - Bloque base',
    description: null,
    durationWeeks: 8,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ProgramsController - autorización declarada', () => {
  it('el controller entero exige el rol COACH (RolesGuard, vía @Roles)', () => {
    const requiredRoles = Reflect.getMetadata(
      ROLES_METADATA_KEY,
      ProgramsController,
    );
    expect(requiredRoles).toEqual([Role.COACH]);
  });
});

describe('ProgramsController - delegación al servicio con coachId del token', () => {
  let programsService: jest.Mocked<ProgramsService>;
  let controller: ProgramsController;

  beforeEach(() => {
    programsService = {
      listForCoach: jest.fn(),
      getOwnedByCoach: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<ProgramsService>;
    controller = new ProgramsController(programsService);
  });

  it('list() usa siempre el id de CurrentUser()', async () => {
    programsService.listForCoach.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });

    await controller.list(buildCoachUser(), { page: 1, limit: 20 });

    expect(programsService.listForCoach).toHaveBeenCalledWith(
      'coach-123',
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it('detail() pasa el id del coach autenticado y el :id validado', async () => {
    programsService.getOwnedByCoach.mockResolvedValue(buildProgram());

    await controller.detail(buildCoachUser(), { id: 'program-1' });

    expect(programsService.getOwnedByCoach).toHaveBeenCalledWith(
      'coach-123',
      'program-1',
    );
  });

  it('create() usa el id del coach autenticado, nunca uno del body', async () => {
    programsService.create.mockResolvedValue(buildProgram());

    await controller.create(buildCoachUser(), { name: 'Fuerza' });

    expect(programsService.create).toHaveBeenCalledWith(
      'coach-123',
      expect.objectContaining({ name: 'Fuerza' }),
    );
  });

  it('update() pasa coachId, id y dto tal cual', async () => {
    programsService.update.mockResolvedValue(
      buildProgram({ name: 'Fuerza 2' }),
    );

    await controller.update(
      buildCoachUser(),
      { id: 'program-1' },
      { name: 'Fuerza 2' },
    );

    expect(programsService.update).toHaveBeenCalledWith(
      'coach-123',
      'program-1',
      { name: 'Fuerza 2' },
    );
  });

  it('updateStatus() nunca reenvía más que { isActive } al servicio', async () => {
    programsService.updateStatus.mockResolvedValue(
      buildProgram({ isActive: false }),
    );

    await controller.updateStatus(
      buildCoachUser(),
      { id: 'program-1' },
      { isActive: false },
    );

    expect(programsService.updateStatus).toHaveBeenCalledWith(
      'coach-123',
      'program-1',
      { isActive: false },
    );
  });
});
