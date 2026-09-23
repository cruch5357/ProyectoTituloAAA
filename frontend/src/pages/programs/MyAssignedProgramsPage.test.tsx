import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { MyAssignedProgramsPage } from './MyAssignedProgramsPage';

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assignment-1',
    programId: 'program-1',
    studentId: 'student-1',
    status: 'ACTIVE',
    assignedAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    program: {
      id: 'program-1',
      name: 'Fuerza - Bloque base',
      description: null,
      durationWeeks: 8,
      isActive: true,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 09 — "alumno visualizando su programación asignada".
describe('MyAssignedProgramsPage', () => {
  it('lista los programas asignados al alumno autenticado consultando /program-assignments/me', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [buildAssignment()],
      error: null,
      meta: {},
    });

    renderWithProviders(<MyAssignedProgramsPage />);

    expect(await screen.findByText('Fuerza - Bloque base')).toBeInTheDocument();
    expect(screen.getByText('8 semanas')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledWith('/program-assignments/me');
  });

  it('muestra un mensaje cuando el alumno todavía no tiene programas asignados', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [],
      error: null,
      meta: {},
    });

    renderWithProviders(<MyAssignedProgramsPage />);

    expect(
      await screen.findByText('Todavía no tienes ningún programa asignado por tu coach.'),
    ).toBeInTheDocument();
  });

  // PROMPT 09 — "manejo de errores".
  it('muestra un mensaje de error si la consulta falla', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(401, 'No autenticado'),
    );

    renderWithProviders(<MyAssignedProgramsPage />);

    expect(await screen.findByText('No autenticado')).toBeInTheDocument();
  });
});
