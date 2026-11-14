import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { AuthContext } from '../../auth/authContextObject';
import { apiClient } from '../../lib/apiClient';
import { NotificationBell } from './Notifications';

const notice = {
  id: 'n1',
  title: 'Tu programa está listo',
  body: 'Ya puedes revisar el nuevo bloque.',
  resourceType: 'program',
  resourceId: 'p1',
  createdAt: '2026-10-07T12:00:00Z',
  readAt: null,
};

function renderBell() {
  return renderWithProviders(
    <AuthContext.Provider
      value={{
        status: 'authenticated',
        user: {
          id: 's1',
          name: 'Atleta',
          email: 's@example.com',
          role: 'STUDENT',
          coachId: 'coach1',
          isActive: true,
          createdAt: '',
        },
        login: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <NotificationBell />
      <Link to="/history">Ir al historial</Link>
      <button type="button">Fuera del panel</button>
    </AuthContext.Provider>,
    { route: '/home' },
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(apiClient, 'get').mockImplementation(async (path) => ({
    data: path === '/notifications/unread-count' ? { count: 1 } : [notice],
    error: null,
    meta: {},
  }));
  vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: {}, error: null, meta: {} });
});

async function openPanel() {
  await userEvent.click(await screen.findByRole('button', { name: 'Notificaciones: 1 sin leer' }));
  return screen.findByRole('region', { name: 'Notificaciones' });
}

describe('popover de notificaciones', () => {
  it('abre con la campana y cierra con la campana y el botón compacto', async () => {
    renderBell();
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones: 1 sin leer' }));
    expect(screen.queryByRole('region', { name: 'Notificaciones' })).not.toBeInTheDocument();
    const panel = await openPanel();
    const close = within(panel).getByRole('button', { name: 'Cerrar notificaciones' });
    expect(close).toHaveClass('notice-panel__close');
    await userEvent.click(close);
    expect(screen.queryByRole('region', { name: 'Notificaciones' })).not.toBeInTheDocument();
  });

  it('cierra con interacción exterior, Escape y navegación', async () => {
    renderBell();
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Fuera del panel' }));
    expect(screen.queryByRole('region', { name: 'Notificaciones' })).not.toBeInTheDocument();
    await openPanel();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Notificaciones' })).not.toBeInTheDocument();
    await openPanel();
    await userEvent.click(screen.getByRole('link', { name: 'Ir al historial' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Notificaciones' })).not.toBeInTheDocument());
  });

  it('mantiene contador, lectura masiva y enlace; al elegir una notificación marca y cierra', async () => {
    renderBell();
    const panel = await openPanel();
    expect(panel).toHaveClass('notice-panel');
    expect(panel.querySelector('.notice-unread')).toHaveTextContent('Sin leer');
    await userEvent.click(within(panel).getByRole('button', { name: 'Marcar todas como leídas' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/notifications/read-all', undefined));
    expect(screen.getByRole('region', { name: 'Notificaciones' })).toBeInTheDocument();
    const noticeLink = within(panel).getByRole('link', { name: 'Tu programa está listo' });
    expect(noticeLink).toHaveAttribute('href', '/student/programs/p1');
    await userEvent.click(noticeLink);
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/notifications/n1/read', undefined));
    expect(screen.queryByRole('region', { name: 'Notificaciones' })).not.toBeInTheDocument();
  });

  it('destaca una alerta de planificación y abre el chat correspondiente', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path) => ({
      data: path === '/notifications/unread-count' ? { count: 1 } : [{ ...notice, type: 'TRAINING_PLAN_WARNING', title: 'Alerta de planificación semanal', body: 'Tu coach recomienda revisar la distribución.', resourceType: 'message', resourceId: 'coach1' }],
      error: null,
      meta: {},
    }));
    renderBell();
    const panel = await openPanel();
    const link = within(panel).getByRole('link', { name: 'Alerta de planificación semanal' });
    expect(link.closest('li')).toHaveClass('notice-plan-warning');
    expect(link).toHaveAttribute('href', '/messages?peer=coach1');
  });
});
