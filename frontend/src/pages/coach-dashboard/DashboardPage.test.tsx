import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { DashboardPage } from './DashboardPage';

function buildSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    totalStudents: 3,
    activeStudents: 2,
    activeAssignments: 4,
    workoutsRegistered: 12,
    workoutsFinished: 10,
    completionStatusBreakdown: { completed: 7, partial: 2, skipped: 1 },
    summary: {
      totalWorkouts: 10,
      totalSetLogs: 90,
      averageDurationMinutes: 42,
      averageOverallRpe: 7.2,
      averageFatigue: 5.5,
      trainingFrequencyPerWeek: 2.1,
      firstWorkoutAt: '2026-01-01T00:00:00.000Z',
      lastWorkoutAt: '2026-01-15T00:00:00.000Z',
    },
    ...overrides,
  };
}

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
    student: { id: 'student-1', name: 'Alumno Uno', email: 'a@example.com' },
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

// PROMPT 12 (RF-26) — Dashboard del Coach: resumen agregado + actividad
// reciente de todos sus alumnos.
describe('DashboardPage', () => {
  it('muestra el resumen agregado y la actividad reciente', async () => {
    mockGetByPath({
      '/dashboard/summary': buildSummary(),
      '/dashboard/recent-activity': [buildWorkoutLog()],
    });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Alumno Uno')).toBeInTheDocument();
    expect(screen.getByText('Día 1 - Tren superior')).toBeInTheDocument();
    expect(screen.getByText('Fuerza General')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // totalStudents
    expect(screen.getByText('45 min')).toBeInTheDocument();
  });

  it('muestra un mensaje cuando el coach todavía no tiene alumnos', async () => {
    mockGetByPath({
      '/dashboard/summary': buildSummary({
        totalStudents: 0,
        activeStudents: 0,
        activeAssignments: 0,
        workoutsRegistered: 0,
        workoutsFinished: 0,
      }),
      '/dashboard/recent-activity': [],
    });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText(/Todavía no tienes alumnos/)).toBeInTheDocument();
  });

  it('aplica los filtros de fecha y estado en la consulta de actividad reciente', async () => {
    const getSpy = mockGetByPath({
      '/dashboard/summary': buildSummary(),
      '/dashboard/recent-activity': [buildWorkoutLog()],
    });
    const user = userEvent.setup();

    renderWithProviders(<DashboardPage />);
    await screen.findByText('Alumno Uno');

    await user.type(screen.getByLabelText('Desde'), '2026-01-01');
    await user.selectOptions(screen.getByLabelText('Estado'), 'COMPLETED');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/dashboard\/recent-activity\?.*dateFrom=2026-01-01.*completionStatus=COMPLETED/,
        ),
      );
    });
  });

  it('enlaza cada fila de actividad al dashboard del alumno correspondiente', async () => {
    mockGetByPath({
      '/dashboard/summary': buildSummary(),
      '/dashboard/recent-activity': [buildWorkoutLog()],
    });

    renderWithProviders(<DashboardPage />);

    const link = await screen.findByRole('link', { name: 'Alumno Uno' });
    expect(link).toHaveAttribute('href', '/dashboard/students/student-1');
  });

  it('muestra un mensaje de error si falla la carga del resumen', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(500, 'Error al comunicarse con el servidor'),
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getAllByText('Error al comunicarse con el servidor').length,
      ).toBeGreaterThan(0);
    });
  });
});
