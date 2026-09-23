import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { ProgramFormDialog } from './ProgramFormDialog';

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 08 — "creación" (de programa).
describe('ProgramFormDialog', () => {
  it('crea un programa con los datos del formulario', async () => {
    const user = userEvent.setup();
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        id: 'program-1',
        coachId: 'coach-1',
        name: 'Fuerza - Bloque base',
        description: null,
        durationWeeks: 8,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      error: null,
      meta: {},
    });

    renderWithProviders(<ProgramFormDialog />);

    await user.click(screen.getByRole('button', { name: 'Nuevo programa' }));
    await user.type(screen.getByLabelText('Nombre'), 'Fuerza - Bloque base');
    await user.type(
      screen.getByLabelText('Duración en semanas (opcional)'),
      '8',
    );
    await user.click(screen.getByRole('button', { name: 'Crear programa' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/programs',
        expect.objectContaining({ name: 'Fuerza - Bloque base', durationWeeks: 8 }),
      );
    });
  });

  // PROMPT 08 — "manejo de errores".
  it('muestra un mensaje de error si la creación falla', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiError(400, 'El nombre es obligatorio'),
    );

    renderWithProviders(<ProgramFormDialog />);

    await user.click(screen.getByRole('button', { name: 'Nuevo programa' }));
    await user.type(screen.getByLabelText('Nombre'), 'X');
    await user.click(screen.getByRole('button', { name: 'Crear programa' }));

    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();
  });
});
