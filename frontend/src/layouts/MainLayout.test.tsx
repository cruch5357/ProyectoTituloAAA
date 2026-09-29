import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { AuthContext } from '../auth/authContextObject';
import { MainLayout } from './MainLayout';
import { apiClient } from '../lib/apiClient';
import type { UserRole } from '../types/user';
function renderRole(role: UserRole) {
  return renderWithProviders(
    <AuthContext.Provider
      value={{
        status: 'authenticated',
        user: {
          id: 'u1',
          name: 'Usuario',
          email: 'u@example.com',
          role,
          isActive: true,
          coachId: null,
          createdAt: '',
        },
        login: vi.fn(),
        logout: vi.fn().mockResolvedValue(undefined),
      }}
    >
      <MainLayout />
    </AuthContext.Provider>,
  );
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(apiClient, 'get').mockResolvedValue({
    data: [],
    error: null,
    meta: { page: 1, total: 0, totalPages: 0 },
  });
});
describe('Navegación por rol', () => {
  it('muestra navegación coach, lista limitada y sidebar colapsable', async () => {
    renderRole('COACH');
    expect(
      within(
        screen.getByRole('navigation', { name: 'Navegación principal' }),
      ).getByRole('link', { name: 'Mis alumnos' }),
    ).toHaveAttribute('href', '/students');
    expect(
      await screen.findByText('Sin alumnos para mostrar.'),
    ).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/students?page=1&limit=8');
    await userEvent.click(
      screen.getByRole('button', { name: 'Colapsar barra lateral' }),
    );
    expect(screen.queryByLabelText('Buscar alumnos')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Expandir barra lateral' }),
    );
    expect(screen.getByLabelText('Buscar alumnos')).toBeInTheDocument();
  });
  it('mantiene acciones secundarias en Más', async () => {
    renderRole('COACH');
    const mobile = screen.getByRole('navigation', { name: 'Navegación móvil' });
    expect(within(mobile).getAllByRole('link')).toHaveLength(4);
    await userEvent.click(within(mobile).getByRole('button', { name: 'Más' }));
    expect(
      screen.getByRole('button', { name: 'Cerrar menú' }),
    ).toBeInTheDocument();
  });
  it('alumno solo ve sus herramientas y no consulta alumnos', () => {
    renderRole('STUDENT');
    expect(
      screen.queryByRole('link', { name: 'Importar Excel' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Buscar alumnos')).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Navegación móvil' }),
      ).getByRole('link', { name: 'Entrenamiento' }),
    ).toHaveAttribute('href', '/training');
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
