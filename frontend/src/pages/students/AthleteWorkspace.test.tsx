import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRoute } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { AthleteWorkspace } from './AthleteWorkspace';
const student = {
  id: 's1',
  name: 'Atleta de prueba',
  email: 'atleta@example.com',
  role: 'STUDENT',
  isActive: true,
  coachId: 'c1',
  createdAt: '2026-01-01',
};
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(apiClient, 'get').mockImplementation(async (path) => ({
      data: path.startsWith('/programs') ? [] : path.startsWith('/students/')
      ? student
      : {
          student,
          workoutsRegistered: 0,
          workoutsFinished: 0,
          summary: { totalSetLogs: 0, lastWorkoutAt: null },
        },
    error: null,
    meta: {},
  }));
});
describe('Workspace del atleta', () => {
  it('mantiene exactamente cinco secciones y cambia por URL', async () => {
    renderWithRoute(<AthleteWorkspace />, {
      path: '/students/:id',
      route: '/students/s1',
    });
    const nav = await screen.findByRole('navigation', {
      name: 'Secciones del atleta',
    });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      'Resumen',
      'Programa',
      'Calendario',
      'Formularios',
      'Perfil Estadístico',
    ]);
    await userEvent.click(
      within(nav).getByRole('link', { name: 'Formularios' }),
    );
    expect(
      screen.getByText('No hay formularios disponibles actualmente.'),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole('link', { name: 'Formularios' }),
    ).toHaveAttribute('aria-current', 'page');
    await userEvent.click(
      within(nav).getByRole('link', { name: 'Calendario' }),
    );
    expect(screen.getByText('Sin fechas de planificación')).toBeInTheDocument();
  });
  it('no inventa una asignación del atleta y ofrece una acción válida', async () => {
    renderWithRoute(<AthleteWorkspace />, {
      path: '/students/:id',
      route: '/students/s1?tab=program',
    });
    expect(
      await screen.findByRole('link', { name: 'Ver programas y asignaciones' }),
    ).toHaveAttribute('href', '/programs');
  });
  it('muestra carga y error recuperable sin revelar datos', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(
      new ApiError(404, 'Alumno no encontrado'),
    );
    renderWithRoute(<AthleteWorkspace />, {
      path: '/students/:id',
      route: '/students/s1',
    });
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar la información.',
    );
    expect(
      screen.getByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Secciones del atleta' }),
    ).not.toBeInTheDocument();
  });
});
