import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { ExerciseFormDialog } from './ExerciseFormDialog';

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 07 — "creación" (de ejercicio).
describe('ExerciseFormDialog', () => {
  it('crea un ejercicio con los datos del formulario', async () => {
    const user = userEvent.setup();
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        id: 'exercise-1',
        coachId: 'coach-1',
        name: 'Sentadilla trasera',
        muscleGroup: 'Piernas',
        instructions: null,
        videoUrl: null,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      error: null,
      meta: {},
    });

    renderWithProviders(<ExerciseFormDialog />);

    await user.click(screen.getByRole('button', { name: 'Nuevo ejercicio' }));
    await user.type(screen.getByLabelText('Nombre'), 'Sentadilla trasera');
    await user.type(screen.getByLabelText('Grupo muscular (opcional)'), 'Piernas');
    await user.click(screen.getByRole('button', { name: 'Crear ejercicio' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/exercises',
        expect.objectContaining({
          name: 'Sentadilla trasera',
          muscleGroup: 'Piernas',
        }),
      );
    });
  });

  // PROMPT 07 — "manejo básico de errores".
  it('muestra un mensaje de error si la creación falla', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiError(400, 'El nombre es obligatorio'),
    );

    renderWithProviders(<ExerciseFormDialog />);

    await user.click(screen.getByRole('button', { name: 'Nuevo ejercicio' }));
    await user.type(screen.getByLabelText('Nombre'), 'X');
    await user.click(screen.getByRole('button', { name: 'Crear ejercicio' }));

    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();
  });
});
