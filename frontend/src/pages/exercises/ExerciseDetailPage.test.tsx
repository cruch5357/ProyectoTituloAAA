import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRoute } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { ExerciseDetailPage } from './ExerciseDetailPage';
import type { Exercise } from '../../types/exercise';

function buildExercise(overrides: Partial<Exercise> = {}): Exercise {
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 07 — "edición" (de ejercicio).
describe('ExerciseDetailPage', () => {
  it('carga el ejercicio y permite editarlo', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: buildExercise(),
      error: null,
      meta: {},
    });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: buildExercise({ name: 'Sentadilla frontal' }),
      error: null,
      meta: {},
    });

    renderWithRoute(<ExerciseDetailPage />, {
      path: '/exercises/:id',
      route: '/exercises/exercise-1',
    });

    const nameInput = await screen.findByLabelText('Nombre');
    expect(nameInput).toHaveValue('Sentadilla trasera');

    await user.clear(nameInput);
    await user.type(nameInput, 'Sentadilla frontal');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        '/exercises/exercise-1',
        expect.objectContaining({ name: 'Sentadilla frontal' }),
      );
    });
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
  });

  // PROMPT 07 — "manejo básico de errores".
  it('muestra un mensaje de error si el ejercicio no existe o no pertenece al coach', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(404, 'Ejercicio no encontrado'),
    );

    renderWithRoute(<ExerciseDetailPage />, {
      path: '/exercises/:id',
      route: '/exercises/no-existe',
    });

    expect(await screen.findByText('Ejercicio no encontrado')).toBeInTheDocument();
  });
});
