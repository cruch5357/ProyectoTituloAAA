import { Role, WorkoutCompletionStatus } from '@prisma/client';
import { TrainingService } from './training.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

const student = { id: 'student', role: Role.STUDENT } as AuthenticatedUser;
const assignment = (id = 'current', status = 'ACTIVE') => ({
  id,
  studentId: student.id,
  programId: 'program',
  status,
  startDate: new Date('2020-01-06T00:00:00Z'),
  snapshotBlockId: null,
  scheduleOverrides: [],
  program: {
    name: 'Programa',
    blocks: [
      {
        id: 'block',
        name: 'Bloque',
        weeks: [
          {
            number: 1,
            sessions: [
              {
                id: 'session',
                name: 'Sesión',
                order: 1,
                dayOfWeek: 1,
                sessionExercises: [
                  {
                    id: 'exercise',
                    programmedSets: [],
                    targetSets: 3,
                    targetRepsMin: 5,
                    targetRepsMax: 5,
                    targetRpe: null,
                    exercise: { name: 'Sentadilla', muscleGroups: [] },
                    frozenExercise: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});
function log(
  assignmentId: string | null,
  durationMinutes: number | null,
  completionStatus: WorkoutCompletionStatus = 'PARTIAL',
  recorded = 0,
) {
  return {
    id: `log-${assignmentId}-${durationMinutes}`,
    sessionId: 'session',
    programAssignmentId: assignmentId,
    durationMinutes,
    completionStatus,
    omittedSets: [],
    _count: { setLogs: recorded },
  };
}
function setup(logs: ReturnType<typeof log>[], assignments = [assignment()]) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: { findFirst: jest.fn().mockResolvedValue({ id: student.id }) },
    programAssignment: { findMany: jest.fn().mockResolvedValue(assignments) },
    workoutLog: { findMany: jest.fn().mockResolvedValue(logs) },
  };
  return {
    prisma,
    service: new TrainingService(prisma as unknown as PrismaService),
  };
}

describe('Training overview: adherencia e historia por ciclo', () => {
  it('deriva una sesión vencida sin registros como omitida, sin crear logs', async () => {
    const { service, prisma } = setup([]);
    const result = await service.overview(student, student.id);
    expect(result.sessions[0]).toMatchObject({
      status: 'SKIPPED',
      recordedSets: 0,
      finished: false,
      readOnly: true,
    });
    expect(result.nextSession).toBeNull();
    expect(result.pendingSession?.status).toBe('SKIPPED');
    expect(result.assignments[0].adherence).toMatchObject({
      skippedSessions: 1,
      expiredPartialSessions: 0,
    });
    expect(prisma.workoutLog.findMany).toHaveBeenCalledTimes(1);
  });
  it('conserva como parcial una sesión vencida con series reales', async () => {
    const { service } = setup([log('current', null, 'PARTIAL', 1)]);
    const result = await service.overview(student, student.id);
    expect(result.sessions[0]).toMatchObject({
      status: 'PARTIAL',
      recordedSets: 1,
      readOnly: true,
    });
    expect(result.assignments[0].adherence).toMatchObject({
      skippedSessions: 0,
      expiredPartialSessions: 1,
    });
  });
  it('no vuelve a mostrar el aviso de una sesión vencida ya omitida por el alumno', async () => {
    const { service, prisma } = setup([log('current', null, 'PARTIAL', 1)]);
    prisma.$queryRaw.mockResolvedValue([
      { assignmentId: 'current', sessionId: 'session' },
    ]);
    const result = await service.overview(student, student.id);
    expect(result.pendingSession).toBeNull();
    expect(result.sessions[0]).toMatchObject({
      status: 'PARTIAL',
      recordedSets: 1,
      readOnly: true,
    });
  });
  it('no clasifica una sesión futura como incumplida', async () => {
    const future = assignment();
    future.startDate = new Date('2099-01-05T00:00:00Z');
    const { service } = setup([], [future]);
    const result = await service.overview(student, student.id);
    expect(result.sessions[0]).toMatchObject({
      status: 'NOT_STARTED',
      readOnly: false,
    });
    expect(result.assignments[0].adherence).toMatchObject({
      skippedSessions: 0,
      expiredPartialSessions: 0,
      actionableSessions: 1,
    });
  });
  it.each(['COMPLETED', 'PARTIAL', 'SKIPPED'] as const)(
    'cuenta una sesión finalizada %s sin recalcular su estado histórico contra la plantilla',
    async (status) => {
      const { service } = setup([log('current', 30, status)]);
      const result = await service.overview(student, student.id);
      expect(result.assignments[0].adherence).toEqual(
        expect.objectContaining({
          scheduledSessions: 1,
          completedSessions: 1,
          adherenceRate: 100,
        }),
      );
      expect(result.sessions[0]).toMatchObject({
        status,
        finished: true,
        completed: status === 'COMPLETED',
      });
    },
  );
  it('no cuenta como finalizada una ejecución abierta aunque tenga todas sus series', async () => {
    const { service } = setup([log('current', null, 'COMPLETED', 3)]);
    const result = await service.overview(student, student.id);
    expect(result.assignments[0].adherence.adherenceRate).toBe(0);
    expect(result.sessions[0].finished).toBe(false);
    expect(result.sessions[0].completed).toBe(false);
  });
  it('reconoce duración cero como cierre válido, no como entrenamiento abierto', async () => {
    const { service } = setup([log('current', 0, 'SKIPPED')]);
    const result = await service.overview(student, student.id);
    expect(result.assignments[0].adherence.adherenceRate).toBe(100);
    expect(result.sessions[0]).toMatchObject({
      finished: true,
      status: 'SKIPPED',
      completed: false,
    });
  });
  it('reconoce un cierre estructurado sin duración disponible', async () => {
    const structured = {
      ...log('current', null, 'PARTIAL', 1),
      structuredExecution: true,
      finishedAt: new Date('2020-01-06T19:00:00Z'),
      performedAt: new Date('2020-01-06T18:00:00Z'),
    };
    const { service } = setup([structured]);
    const result = await service.overview(student, student.id);
    expect(result.sessions[0]).toMatchObject({
      finished: true,
      status: 'PARTIAL',
      recordedSets: 1,
    });
    expect(result.pendingSession).toBeNull();
    expect(result.assignments[0].adherence).toEqual(
      expect.objectContaining({
        completedSessions: 1,
        adherenceRate: 100,
      }),
    );
  });
  it('cuenta una sola vez y no pierde un cierre si existe un registro abierto más reciente', async () => {
    const { service } = setup([
      log('current', null),
      log('current', 30),
      log('current', 20),
    ]);
    const result = await service.overview(student, student.id);
    expect(result.assignments[0].adherence.completedSessions).toBe(1);
    expect(result.assignments[0].finishedSessions).toBe(1);
  });
  it('marca la historia sin ciclo como insuficiente sin atribuirla al ciclo actual', async () => {
    const { service, prisma } = setup([log(null, 20, 'COMPLETED')]);
    const result = await service.overview(student, student.id);
    expect(result.assignments[0].adherence).toEqual(
      expect.objectContaining({
        scheduledSessions: 1,
        completedSessions: 0,
        adherenceRate: null,
        insufficientReason: 'legacy-history',
      }),
    );
    expect(result.sessions[0]).toMatchObject({
      workoutLogId: null,
      finished: false,
      historyAmbiguous: true,
    });
    expect(prisma.workoutLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: student.id,
          OR: [
            { programAssignmentId: { in: ['current'] } },
            {
              programAssignmentId: null,
              sessionId: { in: ['session'] },
              durationMinutes: { not: null },
            },
          ],
        },
      }),
    );
  });
  it('un cierre confirmado del ciclo permite calcular adherencia aunque haya historial ambiguo', async () => {
    const { service } = setup([log('current', 30), log(null, 20)]);
    const result = await service.overview(student, student.id);
    expect(result.assignments[0].adherence).toEqual(
      expect.objectContaining({
        scheduledSessions: 1,
        completedSessions: 1,
        adherenceRate: 100,
      }),
    );
  });
  it('no mezcla un ciclo anterior con la nueva asignación del mismo programa', async () => {
    const { service } = setup(
      [log('previous', 30)],
      [assignment(), assignment('previous', 'FINISHED')],
    );
    const result = await service.overview(student, student.id, true);
    expect(
      result.assignments.find((a) => a.id === 'current')?.adherence
        .adherenceRate,
    ).toBe(0);
    expect(
      result.assignments.find((a) => a.id === 'previous')?.adherence
        .adherenceRate,
    ).toBe(100);
  });
  it('un registro antiguo sin finalizar no vuelve ambiguo el cumplimiento', async () => {
    const { service } = setup([log(null, null)]);
    const result = await service.overview(student, student.id);
    expect(result.assignments[0].adherence).toEqual(
      expect.objectContaining({
        scheduledSessions: 1,
        completedSessions: 0,
        adherenceRate: 0,
      }),
    );
  });
});
