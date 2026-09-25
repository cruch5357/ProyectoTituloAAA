import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DashboardStudentService } from './dashboard-student.service';
import { PrismaService } from '../prisma/prisma.service';
import { StudentsService } from '../students/students.service';

// Pruebas de DashboardStudentService (PROMPT 12, RF-26) -- foco explícito en
// el requisito CRÍTICO: un coach NUNCA puede ver las métricas de un alumno
// que no es suyo, ni siquiera enviando un id con formato válido de OTRO
// coach. La verificación de propiedad se delega en
// StudentsService.getOwnedByCoach() (reutilizado, no reimplementado).
type MockPrisma = {
  workoutLog: { count: jest.Mock; aggregate: jest.Mock; groupBy: jest.Mock };
  setLog: { count: jest.Mock; findMany: jest.Mock };
};

function buildMockPrisma(): MockPrisma {
  return {
    workoutLog: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    setLog: { count: jest.fn(), findMany: jest.fn() },
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
const STUDENT_ID = 'student-1';

function buildOwnedStudent() {
  return {
    id: STUDENT_ID,
    email: 'alumno@example.com',
    role: Role.STUDENT,
    name: 'Alumno Uno',
    isActive: true,
    coachId: COACH_ID,
    createdAt: new Date(),
  };
}

let prisma: MockPrisma;
let studentsService: jest.Mocked<StudentsService>;
let service: DashboardStudentService;

beforeEach(() => {
  prisma = buildMockPrisma();
  prisma.workoutLog.count.mockResolvedValue(0);
  prisma.workoutLog.aggregate.mockResolvedValue(emptyAggregate());
  prisma.workoutLog.groupBy.mockResolvedValue([]);
  prisma.setLog.count.mockResolvedValue(0);
  prisma.setLog.findMany.mockResolvedValue([]);

  studentsService = {
    getOwnedByCoach: jest.fn(),
  } as unknown as jest.Mocked<StudentsService>;

  service = new DashboardStudentService(
    prisma as unknown as PrismaService,
    studentsService,
  );
});

describe('DashboardStudentService.getStudentDashboard', () => {
  it('verifica propiedad vía StudentsService.getOwnedByCoach ANTES de consultar métricas (anti-IDOR)', async () => {
    studentsService.getOwnedByCoach.mockResolvedValue(buildOwnedStudent());

    await service.getStudentDashboard(COACH_ID, STUDENT_ID, {});

    expect(studentsService.getOwnedByCoach).toHaveBeenCalledWith(
      COACH_ID,
      STUDENT_ID,
    );
  });

  it('propaga el 404 genérico de getOwnedByCoach sin consultar ninguna métrica (alumno ajeno o inexistente)', async () => {
    studentsService.getOwnedByCoach.mockRejectedValue(
      new NotFoundException('Alumno no encontrado'),
    );

    await expect(
      service.getStudentDashboard(COACH_ID, 'student-de-otro-coach', {}),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.workoutLog.count).not.toHaveBeenCalled();
    expect(prisma.workoutLog.aggregate).not.toHaveBeenCalled();
  });

  it('scopea las métricas por `studentId` fijo (ya verificado), combinado con los filtros opcionales', async () => {
    studentsService.getOwnedByCoach.mockResolvedValue(buildOwnedStudent());

    await service.getStudentDashboard(COACH_ID, STUDENT_ID, {
      dateFrom: '2026-01-01',
      programId: 'program-1',
    });

    expect(prisma.workoutLog.count).toHaveBeenCalledWith({
      where: {
        studentId: STUDENT_ID,
        performedAt: { gte: new Date('2026-01-01') },
        session: { week: { block: { programId: 'program-1' } } },
      },
    });
  });

  it('sin exerciseId en la query, exerciseEvolution es null y no se consulta SetLog por ejercicio', async () => {
    studentsService.getOwnedByCoach.mockResolvedValue(buildOwnedStudent());

    const result = await service.getStudentDashboard(COACH_ID, STUDENT_ID, {});

    expect(result.exerciseEvolution).toBeNull();
    expect(prisma.setLog.findMany).not.toHaveBeenCalled();
  });

  it('con exerciseId, calcula la evolución de ESE ejercicio para el alumno ya verificado', async () => {
    studentsService.getOwnedByCoach.mockResolvedValue(buildOwnedStudent());
    prisma.setLog.findMany.mockResolvedValue([
      {
        workoutLogId: 'wl-1',
        actualLoad: 80,
        actualReps: 8,
        workoutLog: { performedAt: new Date('2026-01-05') },
      },
    ]);

    const result = await service.getStudentDashboard(COACH_ID, STUDENT_ID, {
      exerciseId: 'exercise-1',
    });

    expect(prisma.setLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionExercise: { exerciseId: 'exercise-1' },
          workoutLog: { studentId: STUDENT_ID },
        },
      }),
    );
    expect(result.exerciseEvolution).toEqual([
      {
        workoutLogId: 'wl-1',
        performedAt: new Date('2026-01-05'),
        maxActualLoad: 80,
        totalActualReps: 8,
        setCount: 1,
      },
    ]);
  });

  it('devuelve el alumno verificado (echo) junto con las métricas', async () => {
    const owned = buildOwnedStudent();
    studentsService.getOwnedByCoach.mockResolvedValue(owned);

    const result = await service.getStudentDashboard(COACH_ID, STUDENT_ID, {});

    expect(result.student).toEqual(owned);
  });
});
