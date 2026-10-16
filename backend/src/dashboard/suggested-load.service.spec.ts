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

  it('envía solo fechas, cargas y repeticiones, y adapta la respuesta', async () => {
    const { service } = setup();
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
        model_version: 'v1',
      }),
    } as Response);

    const result = await service.getSuggestedLoad(COACH, STUDENT, EXERCISE);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ds.local/v1/suggested-load');
    expect(JSON.parse(init.body)).toEqual({
      history: [
        { date: '2026-10-10', load_kg: 60, reps: 5 },
        { date: '2026-10-10', load_kg: 62.5, reps: 6 },
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
      modelVersion: 'v1',
    });
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
