import 'reflect-metadata';
import { Role, WorkoutCompletionStatus } from '@prisma/client';
import {
  WorkoutLogsController,
  WorkoutLogsNestedController,
} from './workout-logs.controller';
import { WorkoutLogsService } from './workout-logs.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import { PublicWorkoutLog } from './workout-log.mapper';

function buildStudentUser(): AuthenticatedUser {
  return {
    id: 'student-123',
    email: 'alumno@example.com',
    role: Role.STUDENT,
    name: 'Alumno Uno',
    coachId: 'coach-1',
  };
}

function buildWorkoutLog(): PublicWorkoutLog {
  return {
    id: 'workout-log-1',
    sessionId: 'session-1',
    studentId: 'student-123',
    performedAt: new Date(),
    completionStatus: WorkoutCompletionStatus.PARTIAL,
    overallRpe: null,
    fatigue: null,
    comments: null,
    durationMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('WorkoutLogsNestedController / WorkoutLogsController - autorización declarada', () => {
  it('ambos controllers exigen el rol STUDENT', () => {
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, WorkoutLogsNestedController),
    ).toEqual([Role.STUDENT]);
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, WorkoutLogsController),
    ).toEqual([Role.STUDENT]);
  });
});

describe('WorkoutLogsNestedController - delegación con el id del alumno del token', () => {
  let workoutLogsService: jest.Mocked<WorkoutLogsService>;
  let controller: WorkoutLogsNestedController;

  beforeEach(() => {
    workoutLogsService = {
      start: jest.fn(),
      listForSession: jest.fn(),
    } as unknown as jest.Mocked<WorkoutLogsService>;
    controller = new WorkoutLogsNestedController(workoutLogsService);
  });

  it('start() pasa el id del alumno del token y el sessionId de la ruta', async () => {
    workoutLogsService.start.mockResolvedValue(buildWorkoutLog());

    await controller.start(buildStudentUser(), { sessionId: 'session-1' });

    expect(workoutLogsService.start).toHaveBeenCalledWith(
      'student-123',
      'session-1',
    );
  });

  it('list() pasa el id del alumno del token y el sessionId de la ruta', async () => {
    workoutLogsService.listForSession.mockResolvedValue([]);

    await controller.list(buildStudentUser(), { sessionId: 'session-1' });

    expect(workoutLogsService.listForSession).toHaveBeenCalledWith(
      'student-123',
      'session-1',
    );
  });
});

describe('WorkoutLogsController - delegación con el id del alumno del token', () => {
  let workoutLogsService: jest.Mocked<WorkoutLogsService>;
  let controller: WorkoutLogsController;

  beforeEach(() => {
    workoutLogsService = {
      getOwnedByStudent: jest.fn(),
      addSetLogs: jest.fn(),
      finish: jest.fn(),
      listHistory: jest.fn(),
      getEvolution: jest.fn(),
    } as unknown as jest.Mocked<WorkoutLogsService>;
    controller = new WorkoutLogsController(workoutLogsService);
  });

  it('detail() pasa el id del alumno del token y el :id de ruta', async () => {
    workoutLogsService.getOwnedByStudent.mockResolvedValue(buildWorkoutLog());

    await controller.detail(buildStudentUser(), { id: 'workout-log-1' });

    expect(workoutLogsService.getOwnedByStudent).toHaveBeenCalledWith(
      'student-123',
      'workout-log-1',
    );
  });

  it('addSetLogs() pasa el id del alumno, el :id de ruta y el dto', async () => {
    workoutLogsService.addSetLogs.mockResolvedValue([]);
    const dto = { setLogs: [{ sessionExerciseId: 'se-1', setNumber: 1 }] };

    await controller.addSetLogs(
      buildStudentUser(),
      { id: 'workout-log-1' },
      dto,
    );

    expect(workoutLogsService.addSetLogs).toHaveBeenCalledWith(
      'student-123',
      'workout-log-1',
      dto,
    );
  });

  it('finish() pasa el id del alumno, el :id de ruta y el dto', async () => {
    workoutLogsService.finish.mockResolvedValue(buildWorkoutLog());
    const dto = {
      completionStatus: WorkoutCompletionStatus.COMPLETED,
      durationMinutes: 40,
    };

    await controller.finish(buildStudentUser(), { id: 'workout-log-1' }, dto);

    expect(workoutLogsService.finish).toHaveBeenCalledWith(
      'student-123',
      'workout-log-1',
      dto,
    );
  });
});

// ---------------------------------------------------------------------------
// PROMPT 11 (RF-25) — historial y evolución. El rol STUDENT ya está probado
// a nivel de clase en el describe de metadata de arriba (se aplica a
// TODOS los métodos del controller, incluidos estos dos nuevos).
// ---------------------------------------------------------------------------
describe('WorkoutLogsController - historial y evolución (PROMPT 11)', () => {
  let workoutLogsService: jest.Mocked<WorkoutLogsService>;
  let controller: WorkoutLogsController;

  beforeEach(() => {
    workoutLogsService = {
      listHistory: jest.fn(),
      getEvolution: jest.fn(),
    } as unknown as jest.Mocked<WorkoutLogsService>;
    controller = new WorkoutLogsController(workoutLogsService);
  });

  it('history() pasa el id del alumno del token y la query, y expone la paginación en meta', async () => {
    workoutLogsService.listHistory.mockResolvedValue({
      items: [buildWorkoutLog()],
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
    const query = { page: 2, limit: 10 };

    const response = await controller.history(
      buildStudentUser(),
      query as never,
    );

    expect(workoutLogsService.listHistory).toHaveBeenCalledWith(
      'student-123',
      query,
    );
    expect(response.meta).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
    expect(response.data).toHaveLength(1);
  });

  it('evolution() pasa el id del alumno del token y la query', async () => {
    workoutLogsService.getEvolution.mockResolvedValue({
      summary: {
        totalWorkouts: 0,
        totalSetLogs: 0,
        averageDurationMinutes: null,
        averageOverallRpe: null,
        averageFatigue: null,
        trainingFrequencyPerWeek: null,
        firstWorkoutAt: null,
        lastWorkoutAt: null,
      },
      exerciseEvolution: null,
    });
    const query = { exerciseId: 'exercise-1' };

    const response = await controller.evolution(
      buildStudentUser(),
      query as never,
    );

    expect(workoutLogsService.getEvolution).toHaveBeenCalledWith(
      'student-123',
      query,
    );
    expect(response.data.exerciseEvolution).toBeNull();
  });
});
