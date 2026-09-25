import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRoute } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { StudentDashboardPage } from './StudentDashboardPage';

function buildStudentDashboard(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    student: {
      id: 'student-1',
      email: 'alumno@example.com',
      role: 'STUDENT',
      name: 'Alumno Uno',
      isActive: true,
      coachId: 'coach-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    workoutsRegistered: 5,
    workoutsFinished: 4,
    completionStatusBreakdown: { completed: 3, partial: 1, skipped: 0 },
    summary: {
      totalWorkouts: 4,
      totalSetLogs: 32,
      averageDurationMinutes: 40,
      averageOverallRpe: 7,
      averageFatigue: 5,
      trainingFrequencyPerWeek: 1.8,
      firstWorkoutAt: '2026-01-01T00:00:00.000Z',
      lastWorkoutAt: '2026-01-10T00:00:00.000Z',
    },
    exerciseEvolution: null,
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
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        };
      }
    }
    throw new Error(`Ruta no mockeada: ${path}`);
  });
}

function renderPage() {
  return renderWithRoute(<StudentDashboardPage />, {
    path: '/dashboard/students/:studentId',
    route: '/dashboard/students/student-1',
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 12 (RF-26) — Dashboard del Coach por alumno.
describe('StudentDashboardPage', () => {
  it('muestra el nombre del alumno y sus métricas', async () => {
    mockGetByPath({
      '/dashboard/students/student-1': buildStudentDashboard(),
      '/exercises': [],
    });

    renderPage();

    expect(await screen.findByText('Alumno Uno')).toBeInTheDocument();
    expect(screen.getByText('alumno@example.com')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // workoutsRegistered
    expect(screen.getByText('4')).toBeInTheDocument(); // workoutsFinished
  });

  it('muestra un mensaje cuando el alumno todavía no tiene entrenamientos registrados', async () => {
    mockGetByPath({
      '/dashboard/students/student-1': buildStudentDashboard({
        workoutsRegistered: 0,
        workoutsFinished: 0,
      }),
      '/exercises': [],
    });

    renderPage();

    expect(
      await screen.findByText(/todavía no tiene entrenamientos registrados/),
    ).toBeInTheDocument();
  });

  it('propaga el error (incluido un 404 por alumno ajeno o inexistente) sin inventar datos', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(404, 'Alumno no encontrado'),
    );

    renderPage();

    expect(await screen.findByText('Alumno no encontrado')).toBeInTheDocument();
  });

  it('selecciona un ejercicio del catálogo y consulta su evolución', async () => {
    const getSpy = mockGetByPath({
      '/dashboard/students/student-1': buildStudentDashboard(),
      '/exercises': [{ id: 'exercise-1', name: 'Press de banca' }],
    });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Alumno Uno');

    await user.selectOptions(screen.getByLabelText('Ejercicio'), 'exercise-1');

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/dashboard\/students\/student-1\?.*exerciseId=exercise-1/),
      );
    });
  });

  it('muestra la evolución del ejercicio cuando hay datos', async () => {
    mockGetByPath({
      '/dashboard/students/student-1': buildStudentDashboard({
        exerciseEvolution: [
          {
            workoutLogId: 'wl-1',
            performedAt: '2026-01-05T00:00:00.000Z',
            maxActualLoad: 70,
            totalActualReps: 24,
            setCount: 3,
          },
        ],
      }),
      '/exercises': [{ id: 'exercise-1', name: 'Press de banca' }],
    });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Alumno Uno');
    await user.selectOptions(screen.getByLabelText('Ejercicio'), 'exercise-1');

    expect(await screen.findByText('70')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
  });
});
