import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TrainingService } from './training.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { SaveTrainingDto } from './block-assignment.dto';

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
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    session: { findUnique: jest.fn().mockResolvedValue(session) },
    programAssignment: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'a',
        studentId: 'student',
        status: 'ACTIVE',
        snapshotBlockId: 'b',
      }),
    },
    workoutLog: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'log',
        revision: 3,
        structuredExecution: true,
        durationMinutes: null,
      }),
      update: jest.fn().mockResolvedValue({ id: 'log' }),
      create: jest.fn().mockResolvedValue({ id: 'log' }),
    },
    setLog: { deleteMany: jest.fn(), upsert: jest.fn() },
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
  return { tx, service };
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
    const { tx, service } = setup();
    tx.programAssignment.findFirst.mockResolvedValue({
      id: 'a',
      studentId: 'other',
      status: 'ACTIVE',
      snapshotBlockId: 'b',
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
});
