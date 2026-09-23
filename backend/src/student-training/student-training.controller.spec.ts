import 'reflect-metadata';
import { Role } from '@prisma/client';
import { StudentTrainingController } from './student-training.controller';
import { StudentTrainingService } from './student-training.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';

function buildStudentUser(): AuthenticatedUser {
  return {
    id: 'student-123',
    email: 'alumno@example.com',
    role: Role.STUDENT,
    name: 'Alumno Uno',
    coachId: 'coach-1',
  };
}

describe('StudentTrainingController - autorización declarada', () => {
  it('exige el rol STUDENT', () => {
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, StudentTrainingController),
    ).toEqual([Role.STUDENT]);
  });
});

describe('StudentTrainingController - delegación con el id del alumno del token', () => {
  let studentTrainingService: jest.Mocked<StudentTrainingService>;
  let controller: StudentTrainingController;

  beforeEach(() => {
    studentTrainingService = {
      getProgram: jest.fn(),
      listBlocks: jest.fn(),
      getBlock: jest.fn(),
      listWeeks: jest.fn(),
      getWeek: jest.fn(),
      listSessions: jest.fn(),
      getSessionDetail: jest.fn(),
    } as unknown as jest.Mocked<StudentTrainingService>;
    controller = new StudentTrainingController(studentTrainingService);
  });

  it('getProgram() pasa el id del alumno del token y el :id de ruta, nunca uno enviado por el cliente', async () => {
    studentTrainingService.getProgram.mockResolvedValue(
      {} as Awaited<ReturnType<StudentTrainingService['getProgram']>>,
    );

    await controller.getProgram(buildStudentUser(), { id: 'program-1' });

    expect(studentTrainingService.getProgram).toHaveBeenCalledWith(
      'student-123',
      'program-1',
    );
  });

  it('listBlocks() delega con studentId y programId', async () => {
    studentTrainingService.listBlocks.mockResolvedValue([]);

    await controller.listBlocks(buildStudentUser(), { id: 'program-1' });

    expect(studentTrainingService.listBlocks).toHaveBeenCalledWith(
      'student-123',
      'program-1',
    );
  });

  it('listWeeks() delega con studentId y blockId', async () => {
    studentTrainingService.listWeeks.mockResolvedValue([]);

    await controller.listWeeks(buildStudentUser(), { id: 'block-1' });

    expect(studentTrainingService.listWeeks).toHaveBeenCalledWith(
      'student-123',
      'block-1',
    );
  });

  it('getBlock() delega con studentId y :id', async () => {
    studentTrainingService.getBlock.mockResolvedValue(
      {} as Awaited<ReturnType<StudentTrainingService['getBlock']>>,
    );

    await controller.getBlock(buildStudentUser(), { id: 'block-1' });

    expect(studentTrainingService.getBlock).toHaveBeenCalledWith(
      'student-123',
      'block-1',
    );
  });

  it('listSessions() delega con studentId y weekId', async () => {
    studentTrainingService.listSessions.mockResolvedValue([]);

    await controller.listSessions(buildStudentUser(), { id: 'week-1' });

    expect(studentTrainingService.listSessions).toHaveBeenCalledWith(
      'student-123',
      'week-1',
    );
  });

  it('getWeek() delega con studentId y :id', async () => {
    studentTrainingService.getWeek.mockResolvedValue(
      {} as Awaited<ReturnType<StudentTrainingService['getWeek']>>,
    );

    await controller.getWeek(buildStudentUser(), { id: 'week-1' });

    expect(studentTrainingService.getWeek).toHaveBeenCalledWith(
      'student-123',
      'week-1',
    );
  });

  it('getSession() delega con studentId y sessionId', async () => {
    studentTrainingService.getSessionDetail.mockResolvedValue(
      {} as Awaited<ReturnType<StudentTrainingService['getSessionDetail']>>,
    );

    await controller.getSession(buildStudentUser(), { id: 'session-1' });

    expect(studentTrainingService.getSessionDetail).toHaveBeenCalledWith(
      'student-123',
      'session-1',
    );
  });
});
