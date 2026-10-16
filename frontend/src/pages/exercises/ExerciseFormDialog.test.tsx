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
    await user.selectOptions(
      screen.getByLabelText('Grupo muscular 1'),
      'quadriceps',
    );
    await user.click(
      screen.getByRole('button', { name: '+ Agregar grupo muscular' }),
    );
    await user.selectOptions(
      screen.getByLabelText('Grupo muscular 2'),
      'glutes',
    );
    await user.click(screen.getByRole('button', { name: 'Powerlifting' }));
    await user.type(
      screen.getByLabelText('Video demostrativo (opcional)'),
      'https://youtu.be/dQw4w9WgXcQ',
    );
    expect(
      screen.getByRole('button', { name: 'Vista previa' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear ejercicio' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/exercises',
        expect.objectContaining({
          name: 'Sentadilla trasera',
          muscleGroups: ['quadriceps', 'glutes'],
          sports: ['powerlifting'],
          videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        }),
      );
    });
  }, 15_000);

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

    expect(
      await screen.findByText('El nombre es obligatorio'),
    ).toBeInTheDocument();
  });

  it('muestra solo la imagen de los grupos elegidos y las reacomoda', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExerciseFormDialog />);
    await user.click(screen.getByRole('button', { name: 'Nuevo ejercicio' }));

    expect(
      screen.queryAllByRole('img', { name: /Zona muscular/ }),
    ).toHaveLength(0);

    await user.selectOptions(
      screen.getByLabelText('Grupo muscular 1'),
      'chest',
    );
    expect(screen.getAllByRole('img', { name: /Zona muscular/ })).toHaveLength(
      1,
    );
    expect(
      screen.getByRole('img', { name: 'Zona muscular: Pecho' }),
    ).toBeInTheDocument();

    const addButton = screen.getByRole('button', {
      name: '+ Agregar grupo muscular',
    });
    await user.click(addButton);
    // Mientras haya una fila vacía no se puede agregar otra.
    expect(addButton).toBeDisabled();
    // Un grupo ya elegido no se ofrece de nuevo en otra fila.
    expect(
      screen
        .getByLabelText('Grupo muscular 2')
        .querySelector('option[value="chest"]'),
    ).toBeNull();

    await user.selectOptions(
      screen.getByLabelText('Grupo muscular 2'),
      'triceps',
    );
    const preview = screen.getByLabelText('Zonas musculares trabajadas');
    expect(preview).toHaveAttribute('data-count', '2');
    expect(preview.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');

    // Con 3 se mantienen 2 columnas: la tercera baja a una nueva fila.
    await user.click(addButton);
    await user.selectOptions(screen.getByLabelText('Grupo muscular 3'), 'abs');
    expect(preview).toHaveAttribute('data-count', '3');
    expect(preview.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    await user.click(screen.getByRole('button', { name: 'Quitar Abdomen' }));

    await user.click(screen.getByRole('button', { name: 'Quitar Pecho' }));
    expect(screen.getAllByRole('img', { name: /Zona muscular/ })).toHaveLength(
      1,
    );
    expect(
      screen.getByRole('img', { name: 'Zona muscular: Tríceps' }),
    ).toBeInTheDocument();
  });
});
