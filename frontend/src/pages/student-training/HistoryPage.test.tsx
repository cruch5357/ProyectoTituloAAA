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
