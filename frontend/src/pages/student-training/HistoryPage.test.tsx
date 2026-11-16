import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { HistoryPage } from './HistoryPage';

function buildWorkoutLog(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'workout-log-1',
    sessionId: 'session-1',
    studentId: 'student-1',
    performedAt: '2026-01-05T10:00:00.000Z',
    completionStatus: 'COMPLETED',
    overallRpe: 7,
    fatigue: 6,
    comments: null,
    durationMinutes: 45,
    createdAt: '2026-01-05T10:00:00.000Z',
    updatedAt: '2026-01-05T10:00:00.000Z',
    setLogsCount: 12,
    session: {
      id: 'session-1',
      name: 'Día 1 - Tren superior',
      week: {
        id: 'week-1',
        number: 1,
        block: {
          id: 'block-1',
          name: 'Bloque 1',
          program: { id: 'program-1', name: 'Fuerza General' },
        },
      },
    },
    ...overrides,
  };
}

function buildSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    totalWorkouts: 3,
    totalSetLogs: 30,
    averageDurationMinutes: 42,
    averageOverallRpe: 7.2,
    averageFatigue: 5.5,
    trainingFrequencyPerWeek: 2.1,
    firstWorkoutAt: '2026-01-01T00:00:00.000Z',
    lastWorkoutAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function mockGetByPath(responses: Record<string, unknown>) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
    for (const [prefix, data] of Object.entries(responses)) {
      if (path.startsWith(prefix)) {
        return {
          data,
          error: null,
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        };
      }
    }
    throw new Error(`Ruta no mockeada: ${path}`);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 11 (RF-25) — "Mi historial": lista de entrenamientos realmente
// registrados + evolución básica descriptiva.
describe('HistoryPage', () => {
  it('navega por períodos de dos semanas sin crear páginas para intervalos vacíos', async () => {
    const recent = buildWorkoutLog({
      id: 'recent-log',
      performedAt: '2026-11-13T15:00:00.000Z',
      session: {
        id: 'recent-session',
        name: 'Sesión del ciclo reciente',
        week: {
          id: 'recent-week',
          number: 1,
          block: {
            id: 'recent-block',
            name: 'Bloque reciente',
            program: { id: 'recent-program', name: 'Ciclo reciente' },
          },
        },
      },
    });
    const old = buildWorkoutLog({
      id: 'old-log',
      performedAt: '2026-10-05T15:00:00.000Z',
      session: {
        id: 'old-session',
        name: 'Sesión de un ciclo anterior',
        week: {
          id: 'old-week',
          number: 1,
          block: {
            id: 'old-block',
            name: 'Bloque anterior',
            program: { id: 'old-program', name: 'Ciclo anterior' },
          },
        },
      },
    });
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path.startsWith('/workout-logs/evolution')) {
        return {
          data: { summary: buildSummary(), exerciseEvolution: null },
          error: null,
          meta: {},
        };
      }
      if (path === '/program-assignments/me') {
        return { data: [], error: null, meta: {} };
      }
      if (path.startsWith('/workout-logs?')) {
        const secondPage = path.includes('page=2');
        return {
          data: secondPage ? [old] : [recent],
          error: null,
          meta: { page: secondPage ? 2 : 1, limit: 100, total: 2, totalPages: 2 },
        };
      }
      throw new Error(`Ruta no mockeada: ${path}`);
    });

    renderWithProviders(<HistoryPage />);

    const navigator = await screen.findByRole('navigation', {
      name: 'Navegación por períodos del historial',
    });
    expect(navigator).toHaveTextContent('9–22 de noviembre de 2026');
    expect(screen.getByText('Sesión del ciclo reciente')).toBeVisible();
    expect(screen.queryByText('Sesión de un ciclo anterior')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));

    expect(screen.getByText('Sesión de un ciclo anterior')).toBeVisible();
    expect(screen.getByText('Ciclo anterior')).toBeVisible();
    expect(screen.queryByText('Sesión del ciclo reciente')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('selecciona un período válido cuando un cambio de filtros elimina el período visible', async () => {
    const partial = buildWorkoutLog({
      id: 'partial-log',
      performedAt: '2026-11-13T15:00:00.000Z',
      completionStatus: 'PARTIAL',
      session: {
        id: 'partial-session',
        name: 'Parcial reciente',
        week: {
          id: 'partial-week',
          number: 1,
          block: {
            id: 'partial-block',
            name: 'Bloque parcial',
            program: { id: 'program-1', name: 'Ciclo actual' },
          },
        },
      },
    });
    const completed = buildWorkoutLog({
      id: 'completed-log',
      performedAt: '2026-10-05T15:00:00.000Z',
      completionStatus: 'COMPLETED',
      session: {
        id: 'completed-session',
        name: 'Completado antiguo',
        week: {
          id: 'completed-week',
          number: 1,
          block: {
            id: 'completed-block',
            name: 'Bloque completado',
            program: { id: 'program-2', name: 'Ciclo anterior' },
          },
        },
      },
    });
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path.startsWith('/workout-logs/evolution')) {
        return {
          data: { summary: buildSummary(), exerciseEvolution: null },
          error: null,
          meta: {},
        };
      }
      if (path === '/program-assignments/me') {
        return { data: [], error: null, meta: {} };
      }
      if (path.startsWith('/workout-logs?')) {
        const filtered = path.includes('completionStatus=PARTIAL');
        return {
          data: filtered ? [partial] : [partial, completed],
          error: null,
          meta: {
            page: 1,
            limit: 100,
            total: filtered ? 1 : 2,
            totalPages: 1,
          },
        };
      }
      throw new Error(`Ruta no mockeada: ${path}`);
    });

    renderWithProviders(<HistoryPage />);
    await screen.findByText('Parcial reciente');
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Completado antiguo')).toBeVisible();

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'PARTIAL');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));

    expect(await screen.findByText('Parcial reciente')).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText('Completado antiguo')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    });
  });

  it('muestra la evolución básica y el historial de entrenamientos', async () => {
    mockGetByPath({
      '/workout-logs/evolution': { summary: buildSummary(), exerciseEvolution: null },
      '/workout-logs?': [buildWorkoutLog()],
      '/program-assignments/me': [],
    });

    renderWithProviders(<HistoryPage />);

    expect(await screen.findByText('Día 1 - Tren superior')).toBeInTheDocument();
    expect(screen.getByText('Fuerza General')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // totalWorkouts
    expect(screen.getByText('45 min')).toBeInTheDocument();
  });

  it('muestra un mensaje cuando no hay entrenamientos finalizados suficientes para calcular evolución', async () => {
    mockGetByPath({
      '/workout-logs/evolution': {
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
        exerciseEvolution: null,
      },
      '/workout-logs?': [],
      '/program-assignments/me': [],
    });

    renderWithProviders(<HistoryPage />);

    expect(
      await screen.findByText(/Todavía no tienes entrenamientos finalizados/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Todavía no tienes entrenamientos registrados/),
    ).toBeInTheDocument();
  });

  it('aplica los filtros de fecha y estado en la consulta del historial', async () => {
    const getSpy = mockGetByPath({
      '/workout-logs/evolution': { summary: buildSummary(), exerciseEvolution: null },
      '/workout-logs?': [buildWorkoutLog()],
      '/program-assignments/me': [],
    });
    const user = userEvent.setup();

    renderWithProviders(<HistoryPage />);
    await screen.findByText('Día 1 - Tren superior');

    await user.type(screen.getByLabelText('Desde'), '2026-01-01');
    await user.selectOptions(screen.getByLabelText('Estado'), 'COMPLETED');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/workout-logs\?.*dateFrom=2026-01-01.*completionStatus=COMPLETED/),
      );
    });
  });

  it('muestra la evolución de un ejercicio cuando llega preseleccionado por la URL', async () => {
    mockGetByPath({
      '/workout-logs/evolution': {
        summary: buildSummary(),
        exerciseEvolution: [
          {
            workoutLogId: 'wl-1',
            performedAt: '2026-01-05T00:00:00.000Z',
            maxActualLoad: 65,
            totalActualReps: 18,
            setCount: 2,
          },
        ],
      },
      '/workout-logs?': [buildWorkoutLog()],
      '/program-assignments/me': [],
    });

    renderWithProviders(<HistoryPage />, {
      route: '/history?exerciseId=exercise-1&exerciseName=Press%20de%20banca',
    });

    expect(await screen.findByText(/Evolución de Press de banca/)).toBeInTheDocument();
    expect(screen.getByText('65')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('muestra un mensaje de error si falla la carga del historial', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(500, 'Error al comunicarse con el servidor'),
    );

    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(
        screen.getAllByText('Error al comunicarse con el servidor').length,
      ).toBeGreaterThan(0);
    });
  });
});
