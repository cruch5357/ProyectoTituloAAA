import 'reflect-metadata';
import { Role, ProgramAssignmentStatus } from '@prisma/client';
import {
  ProgramAssignmentsController,
  ProgramAssignmentsNestedController,
} from './program-assignments.controller';
import { ProgramAssignmentsService } from './program-assignments.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import { PublicProgramAssignment } from './program-assignment.mapper';

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

function buildStudentUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: 'student-123',
    email: 'alumno@example.com',
    role: Role.STUDENT,
    name: 'Alumno Uno',
    coachId: 'coach-123',
    ...overrides,
  };
}

function buildAssignment(
  overrides: Partial<PublicProgramAssignment> = {},
): PublicProgramAssignment {
  return {
    id: 'assignment-1',
    programId: 'program-1',
    studentId: 'student-123',
    status: ProgramAssignmentStatus.ACTIVE,
    assignedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ProgramAssignmentsNestedController - autorización declarada', () => {
  it('exige el rol COACH a nivel de clase', () => {
    const requiredRoles = Reflect.getMetadata(
      ROLES_METADATA_KEY,
      ProgramAssignmentsNestedController,
    );
    expect(requiredRoles).toEqual([Role.COACH]);
  });
});

describe('ProgramAssignmentsNestedController - delegación al servicio', () => {
  let service: jest.Mocked<ProgramAssignmentsService>;
  let controller: ProgramAssignmentsNestedController;

  beforeEach(() => {
    service = {
      assign: jest.fn(),
      listForProgram: jest.fn(),
    } as unknown as jest.Mocked<ProgramAssignmentsService>;
    controller = new ProgramAssignmentsNestedController(service);
  });

  it('assign() usa siempre el id del coach autenticado, nunca uno del body', async () => {
    service.assign.mockResolvedValue(buildAssignment());

    await controller.assign(
      buildCoachUser(),
      { programId: 'program-1' },
      { studentId: 'student-123' },
    );

    expect(service.assign).toHaveBeenCalledWith('coach-123', 'program-1', {
      studentId: 'student-123',
    });
  });

  it('list() pasa el id del coach autenticado y el programId de la ruta', async () => {
    service.listForProgram.mockResolvedValue([]);

    await controller.list(buildCoachUser(), { programId: 'program-1' });

    expect(service.listForProgram).toHaveBeenCalledWith(
      'coach-123',
      'program-1',
    );
  });
});

describe('ProgramAssignmentsController - autorización por método (no por clase)', () => {
  it('la clase entera NO declara @Roles (cada método declara el suyo)', () => {
    const classRoles = Reflect.getMetadata(
      ROLES_METADATA_KEY,
      ProgramAssignmentsController,
    );
    expect(classRoles).toBeUndefined();
  });

  it('listOwn() exige el rol STUDENT', () => {
    const roles = Reflect.getMetadata(
      ROLES_METADATA_KEY,
      ProgramAssignmentsController.prototype.listOwn,
    );
    expect(roles).toEqual([Role.STUDENT]);
  });

  it('detail() exige el rol COACH', () => {
    const roles = Reflect.getMetadata(
      ROLES_METADATA_KEY,
      ProgramAssignmentsController.prototype.detail,
    );
    expect(roles).toEqual([Role.COACH]);
  });

  it('updateStatus() exige el rol COACH', () => {
    const roles = Reflect.getMetadata(
      ROLES_METADATA_KEY,
      ProgramAssignmentsController.prototype.updateStatus,
    );
    expect(roles).toEqual([Role.COACH]);
  });
});

describe('ProgramAssignmentsController - delegación al servicio', () => {
  let service: jest.Mocked<ProgramAssignmentsService>;
  let controller: ProgramAssignmentsController;

  beforeEach(() => {
    service = {
      listForStudent: jest.fn(),
      getOwnedByCoach: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<ProgramAssignmentsService>;
    controller = new ProgramAssignmentsController(service);
  });

  it('listOwn() usa siempre el id del alumno autenticado, nunca uno externo', async () => {
    service.listForStudent.mockResolvedValue([]);

    await controller.listOwn(buildStudentUser());

    expect(service.listForStudent).toHaveBeenCalledWith('student-123');
  });

  it('detail() pasa el id del coach autenticado y el :id validado', async () => {
    service.getOwnedByCoach.mockResolvedValue(buildAssignment());

    await controller.detail(buildCoachUser(), { id: 'assignment-1' });

    expect(service.getOwnedByCoach).toHaveBeenCalledWith(
      'coach-123',
      'assignment-1',
    );
  });

  it('updateStatus() nunca reenvía más que { status } al servicio', async () => {
    service.updateStatus.mockResolvedValue(
      buildAssignment({ status: ProgramAssignmentStatus.FINISHED }),
    );

    await controller.updateStatus(
      buildCoachUser(),
      { id: 'assignment-1' },
      { status: ProgramAssignmentStatus.FINISHED },
    );

    expect(service.updateStatus).toHaveBeenCalledWith(
      'coach-123',
      'assignment-1',
      { status: ProgramAssignmentStatus.FINISHED },
    );
  });
});
