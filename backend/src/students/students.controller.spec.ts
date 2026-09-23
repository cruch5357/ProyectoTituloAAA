import 'reflect-metadata';
import { Role } from '@prisma/client';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';

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

describe('StudentsController - autorización declarada', () => {
  it('el controller entero exige el rol COACH (RolesGuard, vía @Roles)', () => {
    const requiredRoles = Reflect.getMetadata(
      ROLES_METADATA_KEY,
      StudentsController,
    );
    expect(requiredRoles).toEqual([Role.COACH]);
  });
});

describe('StudentsController - delegación al servicio con coachId del token', () => {
  let studentsService: jest.Mocked<StudentsService>;
  let controller: StudentsController;

  beforeEach(() => {
    studentsService = {
      listForCoach: jest.fn(),
      getOwnedByCoach: jest.fn(),
      updateStatus: jest.fn(),
      invite: jest.fn(),
    } as unknown as jest.Mocked<StudentsService>;
    controller = new StudentsController(studentsService);
  });

  it('list() usa siempre el id de CurrentUser(), nunca uno de la query', async () => {
    studentsService.listForCoach.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });
    const currentUser = buildCoachUser();

    await controller.list(currentUser, { page: 1, limit: 20 });

    expect(studentsService.listForCoach).toHaveBeenCalledWith(
      'coach-123',
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it('detail() pasa el id del coach autenticado y el :id validado al servicio', async () => {
    studentsService.getOwnedByCoach.mockResolvedValue({
      id: 'student-1',
      email: 'a@a.com',
      role: Role.STUDENT,
      name: 'A',
      isActive: true,
      coachId: 'coach-123',
      createdAt: new Date(),
    });
    const currentUser = buildCoachUser();

    await controller.detail(currentUser, { id: 'student-1' });

    expect(studentsService.getOwnedByCoach).toHaveBeenCalledWith(
      'coach-123',
      'student-1',
    );
  });

  it('updateStatus() nunca reenvía más que { isActive } al servicio', async () => {
    studentsService.updateStatus.mockResolvedValue({
      id: 'student-1',
      email: 'a@a.com',
      role: Role.STUDENT,
      name: 'A',
      isActive: false,
      coachId: 'coach-123',
      createdAt: new Date(),
    });
    const currentUser = buildCoachUser();

    await controller.updateStatus(
      currentUser,
      { id: 'student-1' },
      { isActive: false },
    );

    expect(studentsService.updateStatus).toHaveBeenCalledWith(
      'coach-123',
      'student-1',
      { isActive: false },
    );
  });

  it('invite() usa el id del coach autenticado, nunca uno del body', async () => {
    studentsService.invite.mockResolvedValue({
      email: 'alumno@example.com',
      expiresAt: new Date(),
      activationToken: 'raw-invite',
    });
    const currentUser = buildCoachUser();

    await controller.invite(currentUser, { email: 'alumno@example.com' });

    expect(studentsService.invite).toHaveBeenCalledWith(
      'coach-123',
      expect.objectContaining({ email: 'alumno@example.com' }),
    );
  });
});
