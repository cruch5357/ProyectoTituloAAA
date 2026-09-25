import {
  ProgramAssignmentStatus,
  Role,
  WorkoutCompletionStatus,
} from '@prisma/client';
import { DashboardSummaryService } from './dashboard-summary.service';
import { PrismaService } from '../prisma/prisma.service';

// Pruebas de DashboardSummaryService (PROMPT 12, RF-26). Foco explícito en
// el requisito CRÍTICO del enunciado: CADA consulta debe quedar scopeada al
// coach autenticado (`coachId` fijo, nunca del cliente) -- nunca un alumno
// ni una actividad de otro coach debe poder colarse en el resumen.
type MockPrisma = {
  user: { count: jest.Mock };
  programAssignment: { count: jest.Mock };
  workoutLog: {
    count: jest.Mock;
    aggregate: jest.Mock;
    groupBy: jest.Mock;
    findMany: jest.Mock;
  };
  setLog: { count: jest.Mock };
};

function buildMockPrisma(): MockPrisma {
  return {
    user: { count: jest.fn() },
    programAssignment: { count: jest.fn() },
    workoutLog: {
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    setLog: { count: jest.fn() },
  };
}

function emptyAggregate() {
  return {
    _count: { _all: 0 },
    _avg: { durationMinutes: null, overallRpe: null, fatigue: null },
    _min: { performedAt: null },
    _max: { performedAt: null },
  };
}

const COACH_ID = 'coach-1';

let prisma: MockPrisma;
let service: DashboardSummaryService;

beforeEach(() => {
  prisma = buildMockPrisma();
  prisma.user.count.mockResolvedValue(0);
  prisma.programAssignment.count.mockResolvedValue(0);
  prisma.workoutLog.count.mockResolvedValue(0);
  prisma.workoutLog.aggregate.mockResolvedValue(emptyAggregate());
  prisma.workoutLog.groupBy.mockResolvedValue([]);
  prisma.workoutLog.findMany.mockResolvedValue([]);
  prisma.setLog.count.mockResolvedValue(0);

  service = new DashboardSummaryService(prisma as unknown as PrismaService);
});

describe('DashboardSummaryService.getSummary', () => {
  it('cuenta alumnos totales/activos y asignaciones activas SIEMPRE scopeadas al coach autenticado', async () => {
    await service.getSummary(COACH_ID);

    expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
      where: { role: Role.STUDENT, coachId: COACH_ID },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(2, {
      where: { role: Role.STUDENT, coachId: COACH_ID, isActive: true },
    });
    expect(prisma.programAssignment.count).toHaveBeenCalledWith({
      where: {
        status: ProgramAssignmentStatus.ACTIVE,
        student: { coachId: COACH_ID },
      },
    });
  });

  it('scopea las métricas de WorkoutLog por `student: { coachId }`, nunca por un studentId suelto', async () => {
    await service.getSummary(COACH_ID);

    expect(prisma.workoutLog.count).toHaveBeenCalledWith({
      where: { student: { coachId: COACH_ID } },
    });
    expect(prisma.workoutLog.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          student: { coachId: COACH_ID },
          durationMinutes: { not: null },
        },
      }),
    );
    expect(prisma.workoutLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          student: { coachId: COACH_ID },
          durationMinutes: { not: null },
        },
      }),
    );
  });

  it('sin ningún dato, devuelve ceros y métricas nulas (sin inventar datos)', async () => {
    const result = await service.getSummary(COACH_ID);

    expect(result).toEqual({
      totalStudents: 0,
      activeStudents: 0,
      activeAssignments: 0,
      workoutsRegistered: 0,
      workoutsFinished: 0,
      completionStatusBreakdown: { completed: 0, partial: 0, skipped: 0 },
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
    });
  });

  it('combina conteos reales: registrados incluye entrenamientos en curso, finalizados solo los cerrados', async () => {
    prisma.workoutLog.count.mockResolvedValue(10); // registrados: cualquier estado
    prisma.workoutLog.aggregate.mockResolvedValue({
      ...emptyAggregate(),
      _count: { _all: 6 }, // finalizados: durationMinutes !== null
    });
    prisma.user.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prisma.programAssignment.count.mockResolvedValue(4);
    prisma.workoutLog.groupBy.mockResolvedValue([
      {
        completionStatus: WorkoutCompletionStatus.COMPLETED,
        _count: { _all: 5 },
      },
      {
        completionStatus: WorkoutCompletionStatus.PARTIAL,
        _count: { _all: 1 },
      },
    ]);

    const result = await service.getSummary(COACH_ID);

    expect(result.totalStudents).toBe(3);
    expect(result.activeStudents).toBe(2);
    expect(result.activeAssignments).toBe(4);
    expect(result.workoutsRegistered).toBe(10);
    expect(result.workoutsFinished).toBe(6);
    expect(result.completionStatusBreakdown).toEqual({
      completed: 5,
      partial: 1,
      skipped: 0,
    });
  });
});

describe('DashboardSummaryService.listRecentActivity', () => {
  const baseQuery = { page: 1, limit: 20 };

  it('scopea SIEMPRE por `student: { coachId }`, combinado con los filtros de fecha/estado', async () => {
    await service.listRecentActivity(COACH_ID, {
      ...baseQuery,
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      completionStatus: WorkoutCompletionStatus.COMPLETED,
    });

    const callArgs = prisma.workoutLog.findMany.mock.calls[0][0];
    expect(callArgs.where.student).toEqual({ coachId: COACH_ID });
    expect(callArgs.where.completionStatus).toBe(
      WorkoutCompletionStatus.COMPLETED,
    );
    expect(callArgs.where.performedAt.gte).toEqual(new Date('2026-01-01'));
    // dateTo de solo-fecha se normaliza a fin de día (ver parseDateTo).
    expect(callArgs.where.performedAt.lte.toISOString()).toBe(
      '2026-01-31T23:59:59.999Z',
    );
  });

  it('pagina con skip/take derivados de page/limit y ordena por performedAt desc', async () => {
    await service.listRecentActivity(COACH_ID, { page: 3, limit: 10 });

    expect(prisma.workoutLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { performedAt: 'desc' },
        skip: 20,
        take: 10,
      }),
    );
  });

  it('mapea cada fila incluyendo el resumen del alumno (para distinguir de quién es la actividad)', async () => {
    prisma.workoutLog.findMany.mockResolvedValue([
      {
        id: 'wl-1',
        sessionId: 'session-1',
        studentId: 'student-1',
        performedAt: new Date('2026-02-01'),
        completionStatus: WorkoutCompletionStatus.COMPLETED,
        overallRpe: null,
        fatigue: null,
        comments: null,
        durationMinutes: 40,
        createdAt: new Date(),
        updatedAt: new Date(),
        student: {
          id: 'student-1',
          name: 'Alumno Uno',
          email: 'a@example.com',
        },
        _count: { setLogs: 3 },
      },
    ]);
    prisma.workoutLog.count.mockResolvedValue(1);

    const result = await service.listRecentActivity(COACH_ID, baseQuery);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].student).toEqual({
      id: 'student-1',
      name: 'Alumno Uno',
      email: 'a@example.com',
    });
    expect(result.items[0].setLogsCount).toBe(3);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('sin actividad, devuelve una lista vacía (nunca datos inventados)', async () => {
    const result = await service.listRecentActivity(COACH_ID, baseQuery);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
  });
});
