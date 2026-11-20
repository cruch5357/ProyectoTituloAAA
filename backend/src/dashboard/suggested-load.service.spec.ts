import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SuggestedLoadService } from './suggested-load.service';
import { PrismaService } from '../prisma/prisma.service';
import { StudentsService } from '../students/students.service';

const COACH = 'coach-1';
const STUDENT = 'student-1';
const EXERCISE = 'exercise-1';

function setup(dataScienceUrl = 'http://ds.local') {
  const prisma = {
    exercise: { findUnique: jest.fn().mockResolvedValue({ coachId: COACH }) },
    suggestedLoadLog: { upsert: jest.fn().mockResolvedValue({}) },
    setLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          actualLoad: 60,
          actualReps: 5,
          workoutLog: { performedAt: new Date('2026-10-10T12:00:00Z') },
        },
        {
          actualLoad: 62.5,
          actualReps: 6,
          actualRpe: 8.5,
          workoutLog: { performedAt: new Date('2026-10-10T12:00:00Z') },
        },
        {
          actualLoad: 60,
          actualReps: 8,
          workoutLog: { performedAt: new Date('2026-10-07T12:00:00Z') },
        },
      ]),
    },
  };
  const studentsService = {
    getOwnedByCoach: jest.fn().mockResolvedValue({ id: STUDENT }),
  };
  const config = { get: jest.fn().mockReturnValue(dataScienceUrl) };
  const service = new SuggestedLoadService(
    prisma as unknown as PrismaService,
    studentsService as unknown as StudentsService,
    config as unknown as ConfigService,
  );
  return { service, prisma, studentsService };
}

let fetchMock: jest.SpyInstance;
beforeEach(() => {
  fetchMock = jest.spyOn(global, 'fetch');
});
afterEach(() => {
  fetchMock.mockRestore();
});

describe('SuggestedLoadService', () => {
  it('verifica que el alumno sea del coach antes de leer datos', async () => {
    const { service, studentsService, prisma } = setup();
    studentsService.getOwnedByCoach.mockRejectedValue(
      new NotFoundException('Alumno no encontrado'),
    );

    await expect(
      service.getSuggestedLoad(COACH, STUDENT, EXERCISE),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.setLog.findMany).not.toHaveBeenCalled();
  });

  it('responde 404 si el ejercicio es de otro coach', async () => {
    const { service, prisma } = setup();
    prisma.exercise.findUnique.mockResolvedValue({ coachId: 'otro-coach' });

    await expect(
      service.getSuggestedLoad(COACH, STUDENT, EXERCISE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('queda desactivado si no hay DATA_SCIENCE_URL', async () => {
    const { service } = setup('');
    await expect(
      service.getSuggestedLoad(COACH, STUDENT, EXERCISE),
    ).resolves.toEqual({ available: false, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía solo fechas, cargas, repeticiones y RPE, y adapta la respuesta', async () => {
    const { service, prisma } = setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        suggested_load_kg: 65,
        target_reps: 6,
        last_e1rm_kg: 75,
        predicted_e1rm_kg: 76.5,
        expected_change_pct: 2,
        based_on_sessions: 2,
        last_session: { date: '2026-10-10', load_kg: 62.5, reps: 6 },
        suggested_load_range_kg: [62.5, 67.5],
        adjustments: ['reserve_progression'],
        model_version: 'v1',
      }),
    } as Response);

    const result = await service.getSuggestedLoad(COACH, STUDENT, EXERCISE);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ds.local/v1/suggested-load');
    expect(JSON.parse(init.body)).toEqual({
      history: [
        { date: '2026-10-10', load_kg: 60, reps: 5 },
        // El RPE solo se envía cuando se anotó.
        { date: '2026-10-10', load_kg: 62.5, reps: 6, rpe: 8.5 },
        { date: '2026-10-07', load_kg: 60, reps: 8 },
      ],
      // Sin targetReps se usan las repeticiones de la mejor serie de la
      // última sesión (62,5 × 6 supera a 60 × 5), no las de una serie cualquiera.
      target_reps: 6,
    });
    expect(result).toEqual({
      available: true,
      suggestedLoadKg: 65,
      targetReps: 6,
      lastE1rmKg: 75,
      predictedE1rmKg: 76.5,
      expectedChangePct: 2,
      basedOnSessions: 2,
      lastSession: { date: '2026-10-10', loadKg: 62.5, reps: 6 },
      suggestedLoadRangeKg: [62.5, 67.5],
      adjustments: ['reserve_progression'],
      modelVersion: 'v1',
    });
    // La predicción queda registrada para medir su acierto después.
    const logged = prisma.suggestedLoadLog.upsert.mock.calls[0][0];
    expect(logged.where).toEqual({
      studentId_exerciseId_lastSessionDate_targetReps_modelVersion: {
        studentId: STUDENT,
        exerciseId: EXERCISE,
        lastSessionDate: new Date('2026-10-10T00:00:00.000Z'),
        targetReps: 6,
        modelVersion: 'v1',
      },
    });
    expect(Number(logged.create.predictedE1rmKg)).toBe(76.5);
    expect(logged.create.adjustments).toEqual(['reserve_progression']);
    expect(logged.update).toEqual({});
  });

  it('si no se puede registrar la predicción, igual entrega la sugerencia', async () => {
    const { service, prisma } = setup();
    prisma.suggestedLoadLog.upsert.mockRejectedValue(new Error('db caída'));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        suggested_load_kg: 65,
        target_reps: 6,
        last_e1rm_kg: 75,
        predicted_e1rm_kg: 76.5,
        last_session: { date: '2026-10-10', load_kg: 62.5, reps: 6 },
        model_version: 'v1',
      }),
    } as Response);

    await expect(
      service.getSuggestedLoad(COACH, STUDENT, EXERCISE),
    ).resolves.toMatchObject({ available: true, suggestedLoadKg: 65 });
  });

  it('si el servicio falla no rompe la página: devuelve no disponible', async () => {
    const { service } = setup();
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      service.getSuggestedLoad(COACH, STUDENT, EXERCISE, 8),
    ).resolves.toEqual({ available: false, reason: 'service_unavailable' });
  });

  it('propaga el historial insuficiente informado por el modelo', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        available: false,
        reason: 'insufficient_history',
        min_sessions: 2,
        based_on_sessions: 1,
      }),
    } as Response);

    await expect(
      service.getSuggestedLoad(COACH, STUDENT, EXERCISE, 8),
    ).resolves.toEqual({
      available: false,
      reason: 'insufficient_history',
      minSessions: 2,
      basedOnSessions: 1,
    });
  });
});

describe('SuggestedLoadService.getHighlights', () => {
  const set = (exercise: string, date: string, load: number, reps: number) => ({
    actualLoad: load,
    actualReps: reps,
    workoutLog: { performedAt: new Date(`${date}T22:00:00Z`) },
    sessionExercise: {
      exercise: { id: exercise, name: exercise.toUpperCase() },
    },
  });

  it('elige los ejercicios con más sesiones y resume su fuerza por día', async () => {
    const { service, prisma, studentsService } = setup();
    prisma.setLog.findMany.mockResolvedValue([
      set('bench', '2026-11-11', 55, 8),
      set('bench', '2026-11-11', 55, 6),
      set('bench', '2026-11-09', 55, 7),
      set('bench', '2026-11-06', 52.5, 8),
      set('squat', '2026-11-12', 80, 5),
      set('squat', '2026-11-10', 77.5, 5),
      set('row', '2026-11-12', 50, 10),
      set('curl', '2026-11-08', 12, 10),
    ]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, suggested_load_kg: 57.5 }),
    } as Response);

    const result = await service.getHighlights(COACH, STUDENT);

    expect(studentsService.getOwnedByCoach).toHaveBeenCalledWith(
      COACH,
      STUDENT,
    );
    // Solo ejercicios activos del propio coach.
    expect(prisma.setLog.findMany.mock.calls[0][0].where).toMatchObject({
      workoutLog: { studentId: STUDENT },
      sessionExercise: { exercise: { coachId: COACH, isActive: true } },
    });
    expect(result.enabled).toBe(true);
    // 3 como máximo: bench (3 sesiones), squat (2), y de las de 1 la más reciente.
    expect(result.items.map((item) => item.exerciseId)).toEqual([
      'bench',
      'squat',
      'row',
    ]);
    expect(result.items[0]).toMatchObject({
      exerciseName: 'BENCH',
      sessions: 3,
      // Un punto por día con su mejor serie (Epley), del más antiguo al más reciente.
      trend: [
        { date: '2026-11-06', e1rmKg: 66.5 },
        { date: '2026-11-09', e1rmKg: 67.8 },
        { date: '2026-11-11', e1rmKg: 69.7 },
      ],
      suggestion: { available: true, suggestedLoadKg: 57.5 },
    });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.target_reps).toBe(8);
    expect(sent.history).toHaveLength(4);
  });

  it('queda desactivado sin DATA_SCIENCE_URL y no lee series', async () => {
    const { service, prisma } = setup('');

    await expect(service.getHighlights(COACH, STUDENT)).resolves.toEqual({
      enabled: false,
      items: [],
    });
    expect(prisma.setLog.findMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SuggestedLoadService.getStudentProgress', () => {
  const set = (exercise: string, date: string, load: number, reps: number) => ({
    actualLoad: load,
    actualReps: reps,
    workoutLog: { performedAt: new Date(`${date}T22:00:00Z`) },
    sessionExercise: { exercise: { id: exercise, name: 'Press banca' } },
  });
  const history = [
    set('bench', '2026-11-11', 55, 8),
    set('bench', '2026-10-12', 47.5, 8),
    set('bench', '2026-09-21', 40, 8),
    set('curl', '2026-11-08', 12, 10),
  ];

  it('calcula el progreso propio y solo la previsión de fuerza, sin carga', async () => {
    const { service, prisma, studentsService } = setup();
    prisma.setLog.findMany.mockResolvedValue(history);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        suggested_load_kg: 57.5,
        predicted_e1rm_kg: 72.1,
        expected_change_pct: 3.4,
      }),
    } as Response);

    const result = await service.getStudentProgress(STUDENT);

    // Datos del propio alumno, sin filtrar por coach desde la ruta.
    expect(studentsService.getOwnedByCoach).not.toHaveBeenCalled();
    expect(prisma.setLog.findMany.mock.calls[0][0].where).toMatchObject({
      workoutLog: { studentId: STUDENT },
      sessionExercise: { exercise: { isActive: true } },
    });
    // Un ejercicio con una sola sesión no muestra progreso.
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      exerciseId: 'bench',
      exerciseName: 'Press banca',
      sessions: 3,
      since: '2026-09-21',
      firstE1rmKg: 50.7,
      lastE1rmKg: 69.7,
      changePct: 37.5,
      trend: [
        { date: '2026-09-21', e1rmKg: 50.7 },
        { date: '2026-10-12', e1rmKg: 60.2 },
        { date: '2026-11-11', e1rmKg: 69.7 },
      ],
      forecast: { predictedE1rmKg: 72.1, expectedChangePct: 3.4 },
    });
    expect(JSON.stringify(result)).not.toContain('57.5');
  });

  it('muestra el progreso aunque el modelo esté desactivado o caído', async () => {
    const disabled = setup('');
    disabled.prisma.setLog.findMany.mockResolvedValue(history);
    const off = await disabled.service.getStudentProgress(STUDENT);
    expect(off.items[0]).toMatchObject({ changePct: 37.5, forecast: null });
    expect(fetchMock).not.toHaveBeenCalled();

    const down = setup();
    down.prisma.setLog.findMany.mockResolvedValue(history);
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const failed = await down.service.getStudentProgress(STUDENT);
    expect(failed.items[0].forecast).toBeNull();
  });
});
