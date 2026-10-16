import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { ExercisesListPage } from './ExercisesListPage';
import type { Exercise } from '../../types/exercise';

function buildExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'exercise-1',
    coachId: 'coach-1',
    name: 'Sentadilla trasera',
    muscleGroup: 'Piernas',
    muscleGroups: [],
    sports: [],
    instructions: null,
    videoUrl: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 07 — "renderizado de catálogo" + "carga de ejercicios".
describe('ExercisesListPage', () => {
  it('carga y renderiza los ejercicios del catálogo', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [
        buildExercise(),
        buildExercise({ id: 'exercise-2', name: 'Press banca' }),
      ],
      error: null,
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });

    renderWithProviders(<ExercisesListPage />);

    expect(screen.getByText('Cargando ejercicios…')).toBeInTheDocument();

    expect(await screen.findByText('Sentadilla trasera')).toBeInTheDocument();
    expect(screen.getByText('Press banca')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Editar Press banca' }),
    ).toHaveAttribute('href', '/exercises/exercise-2');
    expect(apiClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/exercises?page=1&limit=20'),
    );
  });

  it('muestra un mensaje cuando el catálogo está vacío', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [],
      error: null,
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });

    renderWithProviders(<ExercisesListPage />);

    expect(
      await screen.findByText(/Todavía no tienes ejercicios/),
    ).toBeInTheDocument();
  });

  // PROMPT 07 — "manejo básico de errores".
  it('muestra un mensaje de error si falla la carga', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(500, 'Error al comunicarse con el servidor'),
    );

    renderWithProviders(<ExercisesListPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Error al comunicarse con el servidor'),
      ).toBeInTheDocument();
    });
  });

  it('filtra por grupo muscular y deporte, y muestra sus nombres', async () => {
    const user = userEvent.setup();
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [
        buildExercise({
          muscleGroups: ['glutes', 'hamstrings'],
          muscleGroup: 'Glúteos, Isquiotibiales',
          sports: ['powerlifting'],
        }),
      ],
      error: null,
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    renderWithProviders(<ExercisesListPage />);

    expect(
      await screen.findByText('Glúteos, Isquiotibiales'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Powerlifting', { selector: 'small' }),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Grupo muscular'), 'glutes');
    await user.selectOptions(screen.getByLabelText('Deporte'), 'powerlifting');

    await waitFor(() => {
      expect(getSpy).toHaveBeenLastCalledWith(
        expect.stringContaining('muscleGroup=glutes&sport=powerlifting'),
      );
    });
  });
});
