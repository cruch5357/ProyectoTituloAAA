import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRoute } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { ProgramDetailPage } from './ProgramDetailPage';

function buildProgram() {
  return {
    id: 'program-1',
    coachId: 'coach-1',
    name: 'Fuerza - Bloque base',
    description: null,
    durationWeeks: 8,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildBlock() {
  return {
    id: 'block-1',
    programId: 'program-1',
    name: 'Bloque 1 - Acumulación',
    order: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 08 — "navegación Program -> Block".
describe('ProgramDetailPage', () => {
  it('carga el programa, permite editarlo y muestra sus bloques con link de navegación', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/blocks')) {
        return { data: [buildBlock()], error: null, meta: {} };
      }
      return { data: buildProgram(), error: null, meta: {} };
    });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: { ...buildProgram(), name: 'Fuerza 2.0' },
      error: null,
      meta: {},
    });

    renderWithRoute(<ProgramDetailPage />, {
      path: '/programs/:id',
      route: '/programs/program-1',
    });

    const nameInput = await screen.findByLabelText('Nombre');
    expect(nameInput).toHaveValue('Fuerza - Bloque base');

    // El bloque existente se lista y enlaza a su propia página de detalle
    // (siguiente nivel de la jerarquía Program -> Block -> Week -> Session).
    const blockLink = await screen.findByRole('link', {
      name: /Bloque 1 - Acumulación/,
    });
    expect(blockLink).toHaveAttribute('href', '/blocks/block-1');

    await user.clear(nameInput);
    await user.type(nameInput, 'Fuerza 2.0');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        '/programs/program-1',
        expect.objectContaining({ name: 'Fuerza 2.0' }),
      );
    });
  });

  it('permite crear un nuevo bloque desde el detalle del programa', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/blocks')) {
        return { data: [], error: null, meta: {} };
      }
      return { data: buildProgram(), error: null, meta: {} };
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: buildBlock(),
      error: null,
      meta: {},
    });

    renderWithRoute(<ProgramDetailPage />, {
      path: '/programs/:id',
      route: '/programs/program-1',
    });

    await screen.findByText('Este programa todavía no tiene bloques.');

    await user.type(
      screen.getByLabelText('Nombre del nuevo bloque'),
      'Bloque 1',
    );
    await user.click(screen.getByRole('button', { name: 'Agregar bloque' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/programs/program-1/blocks',
        expect.objectContaining({ name: 'Bloque 1' }),
      );
    });
  });

  // PROMPT 08 — "manejo de errores".
  it('muestra un mensaje de error si el programa no existe o no pertenece al coach', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(404, 'Programa no encontrado'),
    );

    renderWithRoute(<ProgramDetailPage />, {
      path: '/programs/:id',
      route: '/programs/no-existe',
    });

    expect(await screen.findByText('Programa no encontrado')).toBeInTheDocument();
  });
});
