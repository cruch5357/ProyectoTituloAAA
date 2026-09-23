import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRoute } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { SessionDetailPage } from './SessionDetailPage';

function buildSession() {
  return {
    id: 'session-1',
    weekId: 'week-1',
    name: 'Sesión A',
    dayOfWeek: 1,
    order: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildCatalogExercise() {
  return {
    id: 'exercise-1',
    coachId: 'coach-1',
    name: 'Sentadilla trasera',
    muscleGroup: 'Piernas',
    instructions: null,
    videoUrl: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildSessionExercise(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'session-exercise-1',
    sessionId: 'session-1',
    exerciseId: 'exercise-1',
    order: 1,
    targetSets: 4,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetRpe: null,
    targetRir: null,
    restSeconds: 90,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    exercise: {
      id: 'exercise-1',
      name: 'Sentadilla trasera',
      muscleGroup: 'Piernas',
      isActive: true,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockGetByPath(routes: Record<string, unknown>) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
    for (const [fragment, data] of Object.entries(routes)) {
      if (path.includes(fragment)) {
        return { data, error: null, meta: {} };
      }
    }
    throw new Error(`Ruta no mockeada en el test: ${path}`);
  });
}

// PROMPT 08 — "selección de ejercicios" y "configuración de prescripción".
describe('SessionDetailPage', () => {
  it('lista los ejercicios ya prescritos en la sesión con su prescripción', async () => {
    mockGetByPath({
      '/exercises?': [buildCatalogExercise()],
      '/sessions/session-1/exercises': [buildSessionExercise()],
      '/sessions/session-1': buildSession(),
    });

    renderWithRoute(<SessionDetailPage />, {
      path: '/sessions/:id',
      route: '/sessions/session-1',
    });

    expect(await screen.findByText('Sentadilla trasera')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // series
    expect(screen.getByText('8-12')).toBeInTheDocument(); // rango de reps
  });

  it('permite agregar un ejercicio existente del catálogo con su prescripción', async () => {
    const user = userEvent.setup();
    mockGetByPath({
      '/exercises?': [buildCatalogExercise()],
      '/sessions/session-1/exercises': [],
      '/sessions/session-1': buildSession(),
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: buildSessionExercise(),
      error: null,
      meta: {},
    });

    renderWithRoute(<SessionDetailPage />, {
      path: '/sessions/:id',
      route: '/sessions/session-1',
    });

    await screen.findByText('Agregar ejercicio del catálogo');
    await screen.findByRole('option', { name: /Sentadilla trasera/ });

    await user.selectOptions(
      screen.getByLabelText('Ejercicio'),
      'exercise-1',
    );
    await user.type(screen.getByLabelText('Series'), '4');
    await user.type(screen.getByLabelText('Reps mín.'), '8');
    await user.type(screen.getByLabelText('Reps máx.'), '12');
    await user.click(screen.getByRole('button', { name: 'Agregar ejercicio' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/sessions/session-1/exercises',
        expect.objectContaining({
          exerciseId: 'exercise-1',
          targetSets: 4,
          targetRepsMin: 8,
          targetRepsMax: 12,
        }),
      );
    });
  });

  // PROMPT 08 — "manejo de errores".
  it('muestra un mensaje de error si la sesión no existe o no pertenece al coach', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(404, 'Sesión no encontrada'),
    );

    renderWithRoute(<SessionDetailPage />, {
      path: '/sessions/:id',
      route: '/sessions/no-existe',
    });

    expect(await screen.findByText('Sesión no encontrada')).toBeInTheDocument();
  });
});
