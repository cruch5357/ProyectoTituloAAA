import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient } from '../../lib/apiClient';
import { ProgramBoard } from './ProgramBoard';
beforeEach(() => vi.restoreAllMocks());
describe('Tablero de programación', () => {
  it('carga bajo demanda la jerarquía real y conserva enlaces de edición', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
      const data = path.includes('/programs/')
        ? [{ id: 'b1', name: 'Bloque real', order: 1 }]
        : path.includes('/blocks/')
          ? [{ id: 'w1', number: 1 }]
          : path.includes('/weeks/')
            ? [{ id: 'ss1', name: 'Sesión real', order: 1 }]
            : [
                {
                  id: 'se1',
                  exercise: { name: 'Sentadilla', muscleGroup: 'Piernas' },
                  targetSets: 4,
                  targetRepsMin: 5,
                  targetRepsMax: 5,
                  targetRpe: 7,
                  targetRir: null,
                  restSeconds: 120,
                  notes: null,
                },
              ];
      return { data, error: null, meta: {} };
    });
    const post = vi.spyOn(apiClient, 'post');
    renderWithProviders(<ProgramBoard programId="p1" />);
    expect(
      await screen.findByRole('button', { name: 'Ver sesiones' }),
    ).toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith('/weeks/w1/sessions');
    await userEvent.click(screen.getByRole('button', { name: 'Ver sesiones' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ver ejercicios' }),
    );
    expect(await screen.findByText('Sentadilla')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Editar sesión / prescripción →' }),
    ).toHaveAttribute('href', '/sessions/ss1');
    expect(screen.getByText('Real').nextElementSibling).toHaveTextContent('—');
    expect(post).not.toHaveBeenCalled();
  });
  it('muestra un estado vacío sin crear bloques', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [],
      error: null,
      meta: {},
    });
    renderWithProviders(<ProgramBoard programId="p1" />);
    expect(
      await screen.findByText('Construye tu primer bloque'),
    ).toBeInTheDocument();
  });
});
