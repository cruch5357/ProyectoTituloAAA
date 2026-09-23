import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRoute } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { StudentSessionPage } from './StudentSessionPage';

function buildSessionDetail(overrides: Partial<Record<string, unknown>> = {}) {
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

// PROMPT 10 — "navegar hasta una sesión" + "ver la prescripción del coach".
describe('StudentSessionPage', () => {
  it('muestra la prescripción de la sesión asignada y los entrenamientos propios ya registrados', async () => {
    mockGetByPath({
      '/student/sessions/session-1': buildSessionDetail(),
      '/sessions/session-1/workout-logs': [
        {
          id: 'workout-log-1',
          sessionId: 'session-1',
          studentId: 'student-1',
          performedAt: '2026-01-05T10:00:00.000Z',
          completionStatus: 'COMPLETED',
          overallRpe: 7,
          fatigue: 6,
          comments: null,
          durationMinutes: 40,
          createdAt: '2026-01-05T10:00:00.000Z',
          updatedAt: '2026-01-05T10:00:00.000Z',
        },
      ],
    });

    renderWithRoute(<StudentSessionPage />, {
      path: '/student/sessions/:id',
      route: '/student/sessions/session-1',
    });

    expect(await screen.findByText('Día 1 - Tren superior')).toBeInTheDocument();
    expect(screen.getByText('Press de banca')).toBeInTheDocument();
    expect(screen.getByText('8-12')).toBeInTheDocument();
    expect(await screen.findByText('Completado')).toBeInTheDocument();
  });

  it('permite iniciar un entrenamiento nuevo', async () => {
    const user = userEvent.setup();
    mockGetByPath({
      '/student/sessions/session-1': buildSessionDetail(),
      '/sessions/session-1/workout-logs': [],
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        id: 'workout-log-nuevo',
        sessionId: 'session-1',
        studentId: 'student-1',
        performedAt: '2026-01-06T10:00:00.000Z',
        completionStatus: 'PARTIAL',
        overallRpe: null,
        fatigue: null,
        comments: null,
        durationMinutes: null,
        createdAt: '2026-01-06T10:00:00.000Z',
        updatedAt: '2026-01-06T10:00:00.000Z',
      },
      error: null,
      meta: {},
    });

    renderWithRoute(<StudentSessionPage />, {
      path: '/student/sessions/:id',
      route: '/student/sessions/session-1',
    });

    await screen.findByText('Día 1 - Tren superior');
    await user.click(screen.getByRole('button', { name: 'Iniciar entrenamiento' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/sessions/session-1/workout-logs');
    });
  });

  // PROMPT 10 — "manejo de errores".
  it('muestra un mensaje de error si la sesión no está asignada al alumno', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(404, 'Sesión no encontrada'),
    );

    renderWithRoute(<StudentSessionPage />, {
      path: '/student/sessions/:id',
      route: '/student/sessions/session-ajena',
    });

    expect(await screen.findByText('Sesión no encontrada')).toBeInTheDocument();
  });
});
