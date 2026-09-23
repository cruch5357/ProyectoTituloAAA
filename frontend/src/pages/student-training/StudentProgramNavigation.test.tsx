import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithRoute } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { StudentProgramPage } from './StudentProgramPage';
import { StudentBlockPage } from './StudentBlockPage';
import { StudentWeekPage } from './StudentWeekPage';

function mockGetByPath(responses: Record<string, unknown>) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
    for (const [prefix, data] of Object.entries(responses)) {
      if (path.startsWith(prefix)) {
        return { data, error: null, meta: {} };
      }
    }
    throw new Error(`Ruta no mockeada: ${path}`);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 10 — "navegar hasta una sesión" (tramos Program -> Block -> Week).
describe('Navegación de solo lectura del Alumno', () => {
  it('StudentProgramPage lista los bloques de un programa asignado', async () => {
    mockGetByPath({
      '/student/programs/program-1/blocks': [
        { id: 'block-1', programId: 'program-1', name: 'Bloque base', order: 1 },
      ],
      '/student/programs/program-1': {
        id: 'program-1',
        coachId: 'coach-1',
        name: 'Fuerza',
        description: 'Programa de fuerza',
        durationWeeks: 8,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    renderWithRoute(<StudentProgramPage />, {
      path: '/student/programs/:id',
      route: '/student/programs/program-1',
    });

    expect(await screen.findByText('Fuerza')).toBeInTheDocument();
    expect(screen.getByText('Bloque base')).toBeInTheDocument();
  });

  it('StudentBlockPage lista las semanas de un bloque asignado', async () => {
    mockGetByPath({
      '/student/blocks/block-1/weeks': [
        { id: 'week-1', blockId: 'block-1', number: 1, order: 1 },
      ],
      '/student/blocks/block-1': {
        id: 'block-1',
        programId: 'program-1',
        name: 'Bloque base',
        order: 1,
      },
    });

    renderWithRoute(<StudentBlockPage />, {
      path: '/student/blocks/:id',
      route: '/student/blocks/block-1',
    });

    expect(await screen.findByText('Bloque base')).toBeInTheDocument();
    expect(screen.getByText('Semana 1')).toBeInTheDocument();
  });

  it('StudentWeekPage lista las sesiones de una semana asignada', async () => {
    mockGetByPath({
      '/student/weeks/week-1/sessions': [
        { id: 'session-1', weekId: 'week-1', name: 'Día 1', dayOfWeek: 1, order: 1 },
      ],
      '/student/weeks/week-1': {
        id: 'week-1',
        blockId: 'block-1',
        number: 1,
        order: 1,
      },
    });

    renderWithRoute(<StudentWeekPage />, {
      path: '/student/weeks/:id',
      route: '/student/weeks/week-1',
    });

    expect(await screen.findByText('Semana 1')).toBeInTheDocument();
    expect(screen.getByText('1. Día 1')).toBeInTheDocument();
  });

  // PROMPT 10 — "manejo de errores" (IDOR: bloque/semana no asignados).
  it('StudentBlockPage muestra un mensaje de error ante un bloque no asignado', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(404, 'Bloque no encontrado'),
    );

    renderWithRoute(<StudentBlockPage />, {
      path: '/student/blocks/:id',
      route: '/student/blocks/ajeno',
    });

    expect(await screen.findByText('Bloque no encontrado')).toBeInTheDocument();
  });
});
