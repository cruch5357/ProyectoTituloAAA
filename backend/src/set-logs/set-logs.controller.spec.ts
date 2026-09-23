import 'reflect-metadata';
import { Role } from '@prisma/client';
import { SetLogsController } from './set-logs.controller';
import { SetLogsService } from './set-logs.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import { PublicSetLog } from '../workout-logs/workout-log.mapper';

function buildStudentUser(): AuthenticatedUser {
  return {
    id: 'student-123',
    email: 'alumno@example.com',
    role: Role.STUDENT,
    name: 'Alumno Uno',
    coachId: 'coach-1',
  };
}

function buildSetLog(): PublicSetLog {
  return {
    id: 'set-log-1',
    workoutLogId: 'workout-log-1',
    sessionExerciseId: 'session-exercise-1',
    setNumber: 1,
    actualReps: 10,
    actualLoad: 60,
    actualRpe: 8,
    actualRir: 2,
    comments: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('SetLogsController - autorización declarada', () => {
  it('exige el rol STUDENT', () => {
    expect(Reflect.getMetadata(ROLES_METADATA_KEY, SetLogsController)).toEqual([
      Role.STUDENT,
    ]);
  });
});

describe('SetLogsController - delegación con el id del alumno del token', () => {
  let setLogsService: jest.Mocked<SetLogsService>;
  let controller: SetLogsController;

  beforeEach(() => {
    setLogsService = {
      update: jest.fn(),
    } as unknown as jest.Mocked<SetLogsService>;
    controller = new SetLogsController(setLogsService);
  });

  it('update() pasa el id del alumno del token, el :id de ruta y el dto', async () => {
    setLogsService.update.mockResolvedValue(buildSetLog());
    const dto = { actualReps: 12 };

    await controller.update(buildStudentUser(), { id: 'set-log-1' }, dto);

    expect(setLogsService.update).toHaveBeenCalledWith(
      'student-123',
      'set-log-1',
      dto,
    );
  });
});
