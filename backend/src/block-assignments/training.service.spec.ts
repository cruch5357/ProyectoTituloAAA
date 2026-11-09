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
    notification: { create: jest.fn() },
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
  it('no crea un registro vacío al guardar sin series', async () => {
    const { tx, service } = setup();
    tx.workoutLog.findFirst.mockResolvedValue(null);
    await expect(
      service.save(user, 's', { ...dto, revision: 0, sets: [] }),
    ).rejects.toThrow('Registra u omite');
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
  it('permite iniciar explícitamente la siguiente sesión futura elegible', async () => {
    const { tx, service, assignment } = setup();
    assignment.startDate = new Date('2099-01-05T00:00:00Z');
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
    assignment.startDate = new Date('2099-01-05T00:00:00Z');
    tx.workoutLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'other-open' });
    await expect(service.start(user, 's', 'a')).rejects.toThrow(
      'entrenamiento activo',
    );
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
