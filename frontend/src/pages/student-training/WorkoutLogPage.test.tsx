import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRoute } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { WorkoutLogPage } from './WorkoutLogPage';

function buildSessionDetail() {
  return {
    id: 'session-1',
    weekId: 'week-1',
    name: 'Día 1 - Tren superior',
    dayOfWeek: 1,
    order: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    exercises: [
      {
        id: 'session-exercise-1',
        sessionId: 'session-1',
        exerciseId: 'exercise-1',
        order: 1,
        targetSets: 4,
        targetRepsMin: 8,
        targetRepsMax: 12,
        targetRpe: 8,
        targetRir: 2,
        restSeconds: 90,
        notes: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        exercise: {
          id: 'exercise-1',
          name: 'Press de banca',
          muscleGroup: 'Pecho',
          isActive: true,
        },
      },
    ],
  };
}

function buildWorkoutLog(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'workout-log-1',
    sessionId: 'session-1',
    studentId: 'student-1',
    performedAt: '2026-01-05T10:00:00.000Z',
    completionStatus: 'PARTIAL',
    overallRpe: null,
    fatigue: null,
    comments: null,
    durationMinutes: null,
    createdAt: '2026-01-05T10:00:00.000Z',
    updatedAt: '2026-01-05T10:00:00.000Z',
    setLogs: [],
    ...overrides,
  };
}

function mockGetByPath(responses: Record<string, unknown>) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
    for (const [prefix, data] of Object.entries(responses)) {
      if (path.startsWith(prefix)) {
        return { data, error: null, meta: {} };
      }
    }
    throw new Error(`Ruta no mockeada: ${path}`);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('WorkoutLogPage', () => {
  // PROMPT 10 — "ver claramente qué fue prescrito y qué fue realizado".
  it('muestra las series ya registradas junto a lo prescrito', async () => {
    mockGetByPath({
      '/workout-logs/workout-log-1': buildWorkoutLog({
        setLogs: [
          {
            id: 'set-log-1',
            workoutLogId: 'workout-log-1',
            sessionExerciseId: 'session-exercise-1',
            setNumber: 1,
            actualReps: 10,
            actualLoad: 60,
            actualRpe: 8,
            actualRir: 2,
            comments: null,
            createdAt: '2026-01-05T10:00:00.000Z',
            updatedAt: '2026-01-05T10:00:00.000Z',
            sessionExercise: {
              id: 'session-exercise-1',
              order: 1,
              targetSets: 4,
              targetRepsMin: 8,
              targetRepsMax: 12,
              targetRpe: 8,
              targetRir: 2,
              exercise: {
                id: 'exercise-1',
                name: 'Press de banca',
                muscleGroup: 'Pecho',
                isActive: true,
              },
            },
          },
        ],
      }),
      '/student/sessions/session-1': buildSessionDetail(),
    });

    renderWithRoute(<WorkoutLogPage />, {
      path: '/workout-logs/:id',
      route: '/workout-logs/workout-log-1',
    });

    expect(await screen.findByText('Press de banca')).toBeInTheDocument();
    expect(screen.getByText('8-12 reps / RPE 8 / RIR 2')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  // PROMPT 10 — "registrar series ejecutadas".
  it('registra una serie nueva contra un ejercicio prescrito de la sesión', async () => {
    const user = userEvent.setup();
    mockGetByPath({
      '/workout-logs/workout-log-1': buildWorkoutLog(),
      '/student/sessions/session-1': buildSessionDetail(),
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: [
        {
          id: 'set-log-1',
          workoutLogId: 'workout-log-1',
          sessionExerciseId: 'session-exercise-1',
          setNumber: 1,
          actualReps: 10,
          actualLoad: 60,
          actualRpe: 8,
          actualRir: 2,
          comments: null,
          createdAt: '2026-01-05T10:00:00.000Z',
          updatedAt: '2026-01-05T10:00:00.000Z',
        },
      ],
      error: null,
      meta: {},
    });

    renderWithRoute(<WorkoutLogPage />, {
      path: '/workout-logs/:id',
      route: '/workout-logs/workout-log-1',
    });

    await screen.findByText('1. Press de banca');
    await user.selectOptions(screen.getByLabelText('Ejercicio'), 'session-exercise-1');
    await user.type(screen.getByLabelText('Reps realizadas'), '10');
    await user.click(screen.getByRole('button', { name: 'Registrar serie' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/workout-logs/workout-log-1/set-logs', {
        setLogs: [
          expect.objectContaining({
            sessionExerciseId: 'session-exercise-1',
            setNumber: 1,
            actualReps: 10,
          }),
        ],
      });
    });
  });

  // PROMPT 10 — "finalizar entrenamiento".
  it('finaliza el entrenamiento con el resumen de sesión', async () => {
    const user = userEvent.setup();
    mockGetByPath({
      '/workout-logs/workout-log-1': buildWorkoutLog(),
      '/student/sessions/session-1': buildSessionDetail(),
    });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: buildWorkoutLog({
        completionStatus: 'COMPLETED',
        durationMinutes: 45,
        overallRpe: 7,
      }),
      error: null,
      meta: {},
    });

    renderWithRoute(<WorkoutLogPage />, {
      path: '/workout-logs/:id',
      route: '/workout-logs/workout-log-1',
    });

    await screen.findByLabelText('Duración (minutos)');
    await user.type(screen.getByLabelText('Duración (minutos)'), '45');
    await user.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        '/workout-logs/workout-log-1/finish',
        expect.objectContaining({ completionStatus: 'COMPLETED', durationMinutes: 45 }),
      );
    });
    expect(await screen.findByText('Resumen guardado.')).toBeInTheDocument();
  });

  // PROMPT 10 — "manejo de errores" (por ejemplo, ventana de edición vencida, RF-24).
  it('muestra un mensaje de error si el backend rechaza la finalización', async () => {
    const user = userEvent.setup();
    mockGetByPath({
      '/workout-logs/workout-log-1': buildWorkoutLog(),
      '/student/sessions/session-1': buildSessionDetail(),
    });
    vi.spyOn(apiClient, 'patch').mockRejectedValue(
      new ApiError(422, 'La ventana de 24 horas para editar este registro ya expiró'),
    );

    renderWithRoute(<WorkoutLogPage />, {
      path: '/workout-logs/:id',
      route: '/workout-logs/workout-log-1',
    });

    await screen.findByLabelText('Duración (minutos)');
    await user.type(screen.getByLabelText('Duración (minutos)'), '45');
    await user.click(screen.getByRole('button', { name: 'Finalizar entrenamiento' }));

    expect(
      await screen.findByText(
        'La ventana de 24 horas para editar este registro ya expiró',
      ),
    ).toBeInTheDocument();
  });

  it('muestra un mensaje de error ante un WorkoutLog ajeno o inexistente', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(404, 'Entrenamiento no encontrado'),
    );

    renderWithRoute(<WorkoutLogPage />, {
      path: '/workout-logs/:id',
      route: '/workout-logs/ajeno',
    });

    expect(await screen.findByText('Entrenamiento no encontrado')).toBeInTheDocument();
  });
});
