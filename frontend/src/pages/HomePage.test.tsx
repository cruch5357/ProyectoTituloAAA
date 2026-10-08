import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../auth/authContextObject';
import type { AuthContextValue } from '../auth/authContextObject';
import type { PublicUser } from '../types/user';
import { HomePage } from './HomePage';

// PROMPT 17: "/" ya no debe mostrar el placeholder de PROMPT 01. Si hay
// sesión, cada rol va a su propia pantalla de inicio (esto también cubre el
// caso de RequireAuth redirigiendo acá a alguien que entró a una ruta de
// otro rol); si no hay sesión, se ve una landing con accesos a login/registro.
function buildUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    role: 'STUDENT',
    name: 'Usuario de prueba',
    isActive: true,
    coachId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderHome(authValue: AuthContextValue) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<div>Panel del coach</div>} />
          <Route path="/home" element={<div>Mis programas asignados</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('HomePage', () => {
  it('muestra una landing con accesos a login y registro cuando no hay sesión', () => {
    renderHome({ status: 'anonymous', user: null, login: vi.fn(), logout: vi.fn() });

    expect(
      screen.getByRole('heading', {
        name: 'Entrena mejor.Planifica con datos.',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Iniciar sesión' })[0]).toHaveAttribute(
      'href',
      '/login',
    );
    expect(
      screen.getAllByRole('link', { name: 'Crear cuenta Coach' })[0],
    ).toHaveAttribute('href', '/register');
  });

  it('redirige a /dashboard cuando hay sesión de coach', () => {
    renderHome({
      status: 'authenticated',
      user: buildUser({ role: 'COACH' }),
      login: vi.fn(),
      logout: vi.fn(),
    });

    expect(screen.getByText('Panel del coach')).toBeInTheDocument();
  });

  it('redirige a /home cuando hay sesión de alumno', () => {
    renderHome({
      status: 'authenticated',
      user: buildUser({ role: 'STUDENT' }),
      login: vi.fn(),
      logout: vi.fn(),
    });

    expect(screen.getByText('Mis programas asignados')).toBeInTheDocument();
  });

  it('no muestra nada mientras el estado de sesión todavía está cargando', () => {
    renderHome({ status: 'loading', user: null, login: vi.fn(), logout: vi.fn() });

    expect(
      screen.queryByText('Panel del coach'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Entrena mejor.Planifica con datos.',
      }),
    ).toBeInTheDocument();
  });
});
