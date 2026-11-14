import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TrainingService } from './training.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { SaveTrainingDto } from './block-assignment.dto';
import { dateOnly, todayDate } from '../common/training/calendar-date';

const user = { id: 'student', role: Role.STUDENT } as AuthenticatedUser;
const session = {
  id: 's',
  name: 'Día',
  order: 1,
  week: { number: 1, block: { programId: 'program', name: 'Bloque' } },
  sessionExercises: [
    {
      id: 'e',
      exerciseId: 'catalog',
      order: 1,
      targetSets: 2,
      targetRepsMin: 5,
      targetRepsMax: 5,
      targetRpe: 8,
      notes: 'Nota actual',
      programmedSets: [],
      modifiers: [],
      frozenExercise: null,
      exercise: {
        name: 'Sentadilla',
        muscleGroups: [],
        muscleGroup: null,
        instructions: null,
        videoUrl: null,
      },
    },
  ],
};
function setup() {
  const today = todayDate();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  const assignment = {
    id: 'a',
    studentId: 'student',
    status: 'ACTIVE',
    snapshotBlockId: 'b',
    startDate: dateOnly(today),
    scheduleOverrides: [],
    program: {
      coachId: 'coach',
      blocks: [{ weeks: [{ sessions: [{ id: 's', dayOfWeek: weekday }] }] }],
    },
  };
  const existingLog = {
    id: 'log',
    revision: 3,
    structuredExecution: true,
    durationMinutes: null,
    setLogs: [],
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    session: { findUnique: jest.fn().mockResolvedValue(session) },
    programAssignment: {
      findFirst: jest.fn().mockResolvedValue(assignment),
    },
    workoutLog: {
      findFirst: jest
        .fn()
        .mockImplementation((args) =>
          args?.where?.NOT
            ? Promise.resolve(null)
            : Promise.resolve(existingLog),
        ),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'log' }),
      create: jest.fn().mockResolvedValue({ id: 'log' }),
    },
    setLog: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
      findMany: jest
        .fn()
        .mockResolvedValue([{ sessionExerciseId: 'e', setNumber: 1 }]),
    },
    workoutCorrectionRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'correction' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'correction' }),
    },
    message: { create: jest.fn().mockResolvedValue({ id: 'message' }) },
    notification: { create: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: jest
      .fn()
      .mockImplementation((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
  };
  const service = new TrainingService(prisma as unknown as PrismaService);
  return { tx, service, assignment };
}
const dto: SaveTrainingDto = {
  assignmentId: 'a',
  revision: 3,
  finish: false,
  sets: [
    {
      sessionExerciseId: 'e',
      setNumber: 1,
      status: 'RECORDED',
      weight: 97.5,
      reps: 5,
      rpe: 8,
    },
  ],
};

describe('TrainingService: registro seguro', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-09T15:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());
  it('actualiza por identidad única y conserva las demás series registradas', async () => {
    const { tx, service } = setup();
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);
    await service.save(user, 's', dto);
    expect(tx.setLog.upsert).toHaveBeenCalledWith({
      where: {
        workoutLogId_sessionExerciseId_setNumber: {
          workoutLogId: 'log',
          sessionExerciseId: 'e',
          setNumber: 1,
        },
      },
      create: {
        workoutLogId: 'log',
        sessionExerciseId: 'e',
        setNumber: 1,
        actualLoad: 97.5,
        actualReps: 5,
        actualRpe: 8,
      },
      update: { actualLoad: 97.5, actualReps: 5, actualRpe: 8 },
    });
    expect(tx.setLog.deleteMany).toHaveBeenCalledWith({
      where: {
        workoutLogId: 'log',
        NOT: { OR: [{ sessionExerciseId: 'e', setNumber: 1 }] },
      },
    });
  });
  it('rechaza la revisión anterior antes de escribir, incluidos reintentos', async () => {
    const { tx, service } = setup();
    await expect(
      service.save(user, 's', { ...dto, revision: 2 }),
    ).rejects.toThrow(ConflictException);
    expect(tx.workoutLog.update).not.toHaveBeenCalled();
    expect(tx.setLog.upsert).not.toHaveBeenCalled();
  });
  it('rechaza series adicionales antes de escribir', async () => {
    const { tx, service } = setup();
    await expect(
      service.save(user, 's', {
        ...dto,
        sets: [{ ...dto.sets[0], setNumber: 3 }],
      }),
    ).rejects.toThrow('Solo puedes registrar las series prescritas');
    expect(tx.workoutLog.update).not.toHaveBeenCalled();
  });
  it('no acepta un ciclo ajeno', async () => {
    const { tx, service, assignment } = setup();
    tx.programAssignment.findFirst.mockResolvedValue({
      ...assignment,
      studentId: 'other',
    });
    await expect(service.save(user, 's', dto)).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.workoutLog.update).not.toHaveBeenCalled();
  });
  it('exige inicio explícito y no crea un registro vacío al guardar', async () => {
    const { tx, service } = setup();
    tx.workoutLog.findFirst.mockResolvedValue(null);
    await expect(
      service.save(user, 's', { ...dto, revision: 0, sets: [] }),
    ).rejects.toThrow('Inicia expresamente');
    expect(tx.workoutLog.create).not.toHaveBeenCalled();
  });
  it('rechaza por API la edición de una sesión vencida', async () => {
    const { tx, service, assignment } = setup();
    assignment.startDate = new Date('2020-01-06T00:00:00Z');
    await expect(service.save(user, 's', dto)).rejects.toThrow(
      'Este entrenamiento ya está cerrado',
    );
    expect(tx.workoutLog.update).not.toHaveBeenCalled();
    expect(tx.setLog.upsert).not.toHaveBeenCalled();
  });
  it('rechaza cambios ordinarios después de finalizar, incluso el mismo día', async () => {
    const { tx, service } = setup();
    tx.workoutLog.findFirst.mockResolvedValue({
      id: 'log',
      revision: 3,
      structuredExecution: true,
      finishedAt: new Date(),
      durationMinutes: 30,
    });
    await expect(service.save(user, 's', dto)).rejects.toThrow(
      'solo puede cambiar mediante una corrección autorizada',
    );
    expect(tx.setLog.upsert).not.toHaveBeenCalled();
  });
  it('guarda la omisión del aviso vencido sin alterar series ni crear logs', async () => {
    const { tx, service, assignment } = setup();
    assignment.startDate = new Date('2020-01-06T00:00:00Z');
    await expect(service.dismissExpired(user, 's', 'a')).resolves.toEqual({
      dismissed: true,
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.workoutLog.create).not.toHaveBeenCalled();
    expect(tx.workoutLog.update).not.toHaveBeenCalled();
    expect(tx.setLog.upsert).not.toHaveBeenCalled();
  });
  it('oculta de forma idempotente el aviso de una sesión ya omitida sin reescribirla', async () => {
    const { tx, service, assignment } = setup();
    assignment.startDate = new Date('2020-01-06T00:00:00Z');
    tx.workoutLog.findFirst.mockResolvedValue({
      id: 'log',
      structuredExecution: true,
      finishedAt: new Date('2020-01-06T19:00:00Z'),
      durationMinutes: null,
      performedAt: new Date('2020-01-06T18:00:00Z'),
      completionStatus: 'SKIPPED',
    });

    await expect(service.dismissExpired(user, 's', 'a')).resolves.toEqual({
      dismissed: true,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.workoutLog.update).not.toHaveBeenCalled();
    expect(tx.workoutLog.create).not.toHaveBeenCalled();
  });
  it('cierra una sesión vencida sin registros como omitida y crea una sola ejecución', async () => {
    const { tx, service, assignment } = setup();
    assignment.startDate = new Date('2020-01-06T00:00:00Z');
    tx.workoutLog.findFirst.mockResolvedValue(null);
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);

    await service.closeExpired(user, 's', 'a');

    expect(tx.workoutLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: user.id,
        sessionId: 's',
        programAssignmentId: 'a',
        structuredExecution: true,
        finishedAt: expect.any(Date),
        durationMinutes: null,
        completionStatus: 'SKIPPED',
        omittedSets: [
          { sessionExerciseId: 'e', setNumber: 1 },
          { sessionExerciseId: 'e', setNumber: 2 },
        ],
      }),
    });
    expect(tx.setLog.upsert).not.toHaveBeenCalled();
  });
  it('cierra una sesión vencida parcial conservando registros y omitiendo solo lo restante', async () => {
    const { tx, service, assignment } = setup();
    assignment.startDate = new Date('2020-01-06T00:00:00Z');
    tx.workoutLog.findFirst.mockResolvedValue({
      id: 'log',
      revision: 3,
      structuredExecution: true,
      finishedAt: null,
      durationMinutes: null,
      performedAt: new Date('2020-01-06T18:00:00Z'),
      setLogs: [
        {
          sessionExerciseId: 'e',
          setNumber: 1,
          createdAt: new Date('2020-01-06T18:05:00Z'),
        },
      ],
    });
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);

    await service.closeExpired(user, 's', 'a');

    expect(tx.workoutLog.update).toHaveBeenCalledWith({
      where: { id: 'log' },
      data: expect.objectContaining({
        revision: { increment: 1 },
        finishedAt: expect.any(Date),
        durationMinutes: null,
        completionStatus: 'PARTIAL',
        omittedSets: [{ sessionExerciseId: 'e', setNumber: 2 }],
      }),
    });
    expect(tx.setLog.deleteMany).not.toHaveBeenCalled();
    expect(tx.setLog.upsert).not.toHaveBeenCalled();
  });
  it('trata el cierre rápido repetido como idempotente', async () => {
    const { tx, service, assignment } = setup();
    assignment.startDate = new Date('2020-01-06T00:00:00Z');
    tx.workoutLog.findFirst.mockResolvedValue({
      id: 'log',
      structuredExecution: true,
      finishedAt: new Date('2020-01-06T19:00:00Z'),
      durationMinutes: null,
      performedAt: new Date('2020-01-06T18:00:00Z'),
      setLogs: [],
    });
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);

    await service.closeExpired(user, 's', 'a');

    expect(tx.workoutLog.create).not.toHaveBeenCalled();
    expect(tx.workoutLog.update).not.toHaveBeenCalled();
  });
  it('calcula la duración con el primer y último timestamp persistidos', async () => {
    const { tx, service } = setup();
    tx.setLog.findMany.mockResolvedValue([
      { createdAt: new Date('2026-10-21T18:05:00Z') },
      { createdAt: new Date('2026-10-21T19:12:00Z') },
    ]);
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);

    await service.save(user, 's', dto);

    expect(tx.workoutLog.update).toHaveBeenCalledWith({
      where: { id: 'log' },
      data: expect.objectContaining({
        durationMinutes: 67,
        finishedAt: null,
      }),
    });
    expect(tx.setLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { actualLoad: 97.5, actualReps: 5, actualRpe: 8 },
      }),
    );
  });
  it('no inventa duración cuando existe un solo instante de anotación', async () => {
    const { tx, service } = setup();
    tx.setLog.findMany.mockResolvedValue([
      { createdAt: new Date('2026-10-21T18:05:00Z') },
    ]);
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);

    await service.save(user, 's', dto);

    expect(tx.workoutLog.update).toHaveBeenCalledWith({
      where: { id: 'log' },
      data: expect.objectContaining({ durationMinutes: null }),
    });
  });
  it('al finalizar conserva lo registrado, omite lo restante y queda parcial', async () => {
    const { tx, service } = setup();
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);

    await service.save(user, 's', { ...dto, finish: true });

    expect(tx.workoutLog.update).toHaveBeenCalledWith({
      where: { id: 'log' },
      data: expect.objectContaining({
        completionStatus: 'PARTIAL',
        omittedSets: [{ sessionExerciseId: 'e', setNumber: 2 }],
        finishedAt: expect.any(Date),
      }),
    });
    expect(tx.setLog.upsert).toHaveBeenCalledTimes(1);
    expect(tx.notification.upsert).not.toHaveBeenCalled();
  });
  it('informa a coach y alumno cuando el registro confirma músculos repetidos en días seguidos', async () => {
    const { tx, service } = setup();
    const groups = session.sessionExercises[0].exercise
      .muscleGroups as string[];
    groups.push('Piernas');
    const currentFind = tx.workoutLog.findFirst.getMockImplementation()!;
    const previousExercise = {
      ...session.sessionExercises[0],
      id: 'previous-exercise',
      exercise: {
        ...session.sessionExercises[0].exercise,
        muscleGroups: ['Piernas'],
      },
    };
    tx.workoutLog.findFirst.mockImplementation((args) =>
      args?.where?.NOT
        ? Promise.resolve({
            id: 'previous-log',
            sessionId: 'previous-session',
            performedAt: new Date('2026-11-08T15:00:00.000Z'),
            completionStatus: 'COMPLETED',
            overallRpe: 9,
            setLogs: [
              {
                sessionExerciseId: 'previous-exercise',
                actualRpe: 9,
                actualRir: 1,
              },
            ],
            session: {
              id: 'previous-session',
              name: 'Piernas anterior',
              sessionExercises: [previousExercise],
            },
          })
        : currentFind(args),
    );
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);

    try {
      await service.save(user, 's', { ...dto, finish: true });
    } finally {
      groups.pop();
    }

    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'coach',
          title: 'Revisar recuperación del alumno',
          resourceType: 'message',
          resourceId: 'student',
        }),
      }),
    );
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'student',
          title: 'Tu coach fue informado sobre tu recuperación',
        }),
      }),
    );
  });
  it('permite iniciar una sesión sugerida para después dentro de la misma semana', async () => {
    const { tx, service, assignment } = setup();
    assignment.startDate = new Date('2026-11-09T00:00:00Z');
    assignment.program.blocks[0].weeks[0].sessions[0].dayOfWeek = 3;
    tx.workoutLog.findFirst.mockResolvedValue(null);
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);
    await service.start(user, 's', 'a');
    expect(tx.workoutLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: user.id,
          sessionId: 's',
          durationMinutes: null,
          structuredExecution: true,
        }),
      }),
    );
  });
  it('no permite iniciar otra sesión cuando existe un entrenamiento activo', async () => {
    const { tx, service, assignment } = setup();
    assignment.program.blocks[0].weeks[0].sessions.push({
      id: 'other',
      dayOfWeek: 2,
    });
    tx.workoutLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'other-open' });
    await expect(service.start(user, 's', 'a')).rejects.toThrow(
      'entrenamiento activo',
    );
    expect(tx.workoutLog.create).not.toHaveBeenCalled();
  });
  it('no permite iniciar un segundo entrenamiento el mismo día', async () => {
    const { tx, service, assignment } = setup();
    assignment.program.blocks[0].weeks[0].sessions.push({
      id: 'other',
      dayOfWeek: 2,
    });
    tx.workoutLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'finished-today',
        performedAt: new Date('2026-11-09T12:00:00.000Z'),
      });

    await expect(service.start(user, 's', 'a')).rejects.toThrow(
      'un entrenamiento por día',
    );
    expect(tx.workoutLog.create).not.toHaveBeenCalled();
  });
  it('permite el siguiente entrenamiento en un día posterior', async () => {
    const { tx, service, assignment } = setup();
    assignment.program.blocks[0].weeks[0].sessions.push({
      id: 'other',
      dayOfWeek: 2,
    });
    tx.workoutLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'finished-yesterday',
        performedAt: new Date('2026-11-08T12:00:00.000Z'),
      });
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);

    await expect(service.start(user, 's', 'a')).resolves.toEqual({});
    expect(tx.workoutLog.create).toHaveBeenCalledTimes(1);
  });
  it('rechaza por API una sesión de la semana siguiente', async () => {
    const { tx, service, assignment } = setup();
    assignment.program.blocks[0].weeks = [
      { sessions: [{ id: 'other', dayOfWeek: 1 }] },
      { sessions: [{ id: 's', dayOfWeek: 1 }] },
    ];
    tx.workoutLog.findFirst.mockResolvedValue(null);

    await expect(service.start(user, 's', 'a')).rejects.toThrow(
      'todavía no está disponible',
    );
    expect(tx.workoutLog.create).not.toHaveBeenCalled();
  });
  it('continúa y guarda el mismo entrenamiento otro día de la semana', async () => {
    jest.setSystemTime(new Date('2026-11-12T15:00:00.000Z'));
    const { tx, service, assignment } = setup();
    assignment.startDate = new Date('2026-11-09T00:00:00Z');
    tx.workoutLog.findFirst.mockResolvedValue({
      id: 'log',
      revision: 3,
      structuredExecution: true,
      finishedAt: null,
      durationMinutes: null,
      performedAt: new Date('2026-11-10T15:00:00.000Z'),
    });
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);

    await service.save(user, 's', dto);

    expect(tx.workoutLog.create).not.toHaveBeenCalled();
    expect(tx.setLog.upsert).toHaveBeenCalledTimes(1);
    jest.setSystemTime(new Date('2026-11-09T15:00:00.000Z'));
  });
  it('mantiene el domingo disponible y bloquea la misma sesión el lunes siguiente', async () => {
    jest.setSystemTime(new Date('2026-11-15T15:00:00.000Z'));
    const sunday = setup();
    sunday.assignment.startDate = new Date('2026-11-09T00:00:00Z');
    sunday.tx.workoutLog.findFirst.mockResolvedValue(null);
    jest.spyOn(sunday.service, 'detail').mockResolvedValue({} as never);
    await expect(sunday.service.start(user, 's', 'a')).resolves.toEqual({});

    jest.setSystemTime(new Date('2026-11-16T15:00:00.000Z'));
    const monday = setup();
    monday.assignment.startDate = new Date('2026-11-09T00:00:00Z');
    monday.tx.workoutLog.findFirst.mockResolvedValue(null);
    await expect(monday.service.start(user, 's', 'a')).rejects.toThrow(
      'ya está cerrado',
    );
    expect(monday.tx.workoutLog.create).not.toHaveBeenCalled();
    jest.setSystemTime(new Date('2026-11-09T15:00:00.000Z'));
  });
  it('trata el inicio repetido de la misma ejecución como idempotente', async () => {
    const { tx, service } = setup();
    tx.workoutLog.findFirst.mockResolvedValue({
      id: 'log',
      revision: 0,
      structuredExecution: true,
      finishedAt: null,
      durationMinutes: null,
      performedAt: new Date(),
    });
    jest.spyOn(service, 'detail').mockResolvedValue({ id: 's' } as never);

    await expect(service.start(user, 's', 'a')).resolves.toEqual({ id: 's' });
    expect(tx.workoutLog.create).not.toHaveBeenCalled();
  });
  it.each(['Nota congelada', null])(
    'muestra la nota snapshot %s aunque la actual cambie',
    async (notes) => {
      const { tx, service } = setup();
      tx.workoutLog.findFirst.mockResolvedValue({
        id: 'log',
        revision: 3,
        structuredExecution: true,
        durationMinutes: null,
        prescriptionCapturedAt: new Date(),
        prescriptions: [{ sessionExerciseId: 'e', notes }],
        setLogs: [],
      } as never);
      const result = await service.detail(user, 's', 'a');
      expect(result.exercises[0].notes).toBe(notes);
      expect(result.exercises[0].sets[0].status).toBe('PENDING');
    },
  );
  it('crea una solicitud cerrada sin modificar el registro real', async () => {
    const { tx, service, assignment } = setup();
    assignment.startDate = new Date('2020-01-06T00:00:00Z');
    await service.requestCorrection(user, 's', {
      assignmentId: 'a',
      sessionExerciseId: 'e',
      setNumber: 1,
      weight: 60,
      reps: 10,
      reason: 'Olvidé anotarla',
    });
    expect(tx.workoutCorrectionRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposedLoad: 60,
        proposedReps: 10,
        proposedFields: ['weight', 'reps'],
      }),
    });
    expect(tx.setLog.upsert).not.toHaveBeenCalled();
    expect(tx.workoutLog.update).not.toHaveBeenCalled();
  });
  it('aplica una aprobación una sola vez y registra auditoría', async () => {
    const { tx, service, assignment } = setup();
    const request = {
      id: 'correction',
      status: 'PENDING',
      coachId: 'coach',
      studentId: 'student',
      programAssignmentId: assignment.id,
      workoutLogId: 'log',
      sessionId: 's',
      sessionExerciseId: 'e',
      setNumber: 1,
      sessionName: 'Día',
      originalLoad: null,
      originalReps: null,
      originalRpe: null,
      proposedLoad: 60,
      proposedReps: 10,
      proposedRpe: null,
      proposedFields: ['weight', 'reps'],
      session,
      workoutLog: {
        id: 'log',
        revision: 3,
        structuredExecution: true,
        durationMinutes: 0,
        setLogs: [],
      },
    };
    tx.workoutCorrectionRequest.findUnique.mockResolvedValue(request);
    await service.decideCorrection(
      { id: 'coach', role: Role.COACH } as AuthenticatedUser,
      'correction',
      'APPROVE',
    );
    expect(tx.setLog.upsert).toHaveBeenCalledTimes(1);
    expect(tx.workoutCorrectionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'WORKOUT_CORRECTION_APPROVED',
        }),
      }),
    );
    tx.workoutCorrectionRequest.findUnique.mockResolvedValue({
      ...request,
      status: 'APPROVED',
    });
    await expect(
      service.decideCorrection(
        { id: 'coach', role: Role.COACH } as AuthenticatedUser,
        'correction',
        'APPROVE',
      ),
    ).rejects.toThrow('ya fue procesada');
    expect(tx.setLog.upsert).toHaveBeenCalledTimes(1);
  });
});
