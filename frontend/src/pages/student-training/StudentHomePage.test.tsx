import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient } from '../../lib/apiClient';
import { AuthContext } from '../../auth/authContextObject';
import { StudentHomePage } from './StudentHomePage';
function renderHome() {
  return renderWithProviders(
    <AuthContext.Provider
      value={{
        status: 'authenticated',
        user: {
          id: 's1',
          name: 'Atleta',
          email: 'a@example.com',
          role: 'STUDENT',
          coachId: 'c1',
          isActive: true,
          createdAt: '',
        },
        login: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <StudentHomePage training />
    </AuthContext.Provider>,
  );
}
function mockSession(logs: unknown[] = []) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
    let data: unknown = [];
    if (path === '/program-assignments/me')
      data = [
        {
          id: 'a1',
          programId: 'p1',
          status: 'ACTIVE',
          program: { id: 'p1', name: 'Programa real', isActive: true },
        },
      ];
    else if (path === '/student/programs/p1/blocks')
      data = [{ id: 'b1', name: 'Bloque real' }];
    else if (path === '/student/blocks/b1/weeks')
      data = [{ id: 'w1', number: 1 }];
    else if (path === '/student/weeks/w1/sessions')
      data = [{ id: 'ss1', name: 'Sesión real' }];
    else if (path === '/student/sessions/ss1')
      data = {
        id: 'ss1',
        name: 'Sesión real',
        exercises: [
          {
            id: 'se1',
            exercise: { name: 'Sentadilla' },
            targetSets: 3,
            targetRepsMin: 5,
            targetRepsMax: 5,
          },
        ],
      };
    else if (path === '/sessions/ss1/workout-logs') data = logs;
    else if (path.startsWith('/workout-logs/evolution'))
      data = {
        summary: { totalWorkouts: 0, totalSetLogs: 0, averageOverallRpe: null },
      };
    return { data, error: null, meta: { page: 1, total: 0, totalPages: 0 } };
  });
}
beforeEach(() => vi.restoreAllMocks());
describe('Inicio del alumno', () => {
  it('presenta sesión disponible sin adjudicarle una fecha y comienza con el endpoint existente', async () => {
    mockSession();
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: { id: 'log1' }, error: null, meta: {} });
    renderHome();
    expect(await screen.findByText('Sentadilla')).toBeInTheDocument();
    expect(screen.getByText('Entrenamiento disponible')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Iniciar entrenamiento' }),
    );
    expect(post).toHaveBeenCalledWith('/sessions/ss1/workout-logs');
  });
  it('ofrece continuar sin duplicar un entrenamiento en curso', async () => {
    mockSession([{ id: 'log1', durationMinutes: null }]);
    const post = vi.spyOn(apiClient, 'post');
    renderHome();
    expect(
      await screen.findByRole('link', { name: 'Continuar entrenamiento' }),
    ).toHaveAttribute('href', '/workout-logs/log1');
    expect(
      screen.queryByRole('button', { name: 'Iniciar entrenamiento' }),
    ).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
