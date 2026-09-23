import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { ProgramsListPage } from './ProgramsListPage';
import type { Program } from '../../types/program';

function buildProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: 'program-1',
    coachId: 'coach-1',
    name: 'Fuerza - Bloque base',
    description: null,
    durationWeeks: 8,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 08 — "listado de programas".
describe('ProgramsListPage', () => {
  it('carga y renderiza los programas del coach', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [buildProgram(), buildProgram({ id: 'program-2', name: 'Hipertrofia' })],
      error: null,
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });

    renderWithProviders(<ProgramsListPage />);

    expect(screen.getByText('Cargando programas…')).toBeInTheDocument();

    expect(await screen.findByText('Fuerza - Bloque base')).toBeInTheDocument();
    expect(screen.getByText('Hipertrofia')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/programs?page=1&limit=20'),
    );
  });

  it('muestra un mensaje cuando todavía no hay programas', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [],
      error: null,
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });

    renderWithProviders(<ProgramsListPage />);

    expect(
      await screen.findByText(/Todavía no tienes programas/),
    ).toBeInTheDocument();
  });

  // PROMPT 08 — "manejo de errores".
  it('muestra un mensaje de error si falla la carga', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(500, 'Error al comunicarse con el servidor'),
    );

    renderWithProviders(<ProgramsListPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Error al comunicarse con el servidor'),
      ).toBeInTheDocument();
    });
  });
});
