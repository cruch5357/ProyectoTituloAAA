import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';
import { apiClient, invalidatePendingAuthRequests, setAccessTokenGetter, setSessionRecovery } from '../lib/apiClient';

const user = { id: 'student', name: 'Demo', email: 'demo@example.com', role: 'STUDENT', isActive: true, coachId: 'coach', createdAt: '' };
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: null, meta: {} }), { status: 200 });
const denied = () => new Response(JSON.stringify({ data: null, error: { message: 'Token expirado' } }), { status: 401 });
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AuthProvider>{children}</AuthProvider></QueryClientProvider>;
}
afterEach(() => { vi.unstubAllGlobals(); setSessionRecovery(undefined); setAccessTokenGetter(() => null); });

describe('renovación de sesión durante el uso de la aplicación', () => {
  it('renueva una sola vez ante 401 simultáneos y repite JSON, upload y lectura privada con el token nuevo', async () => {
    let refreshes = 0;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return ok({ user, accessToken: ++refreshes === 1 ? 'expired' : 'renewed' });
      if (new Headers(init.headers).get('Authorization') !== 'Bearer renewed') return denied();
      return url.endsWith('/file') ? new Response('private video') : ok({ success: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      const results = await Promise.all([apiClient.get('/calendar/me'), apiClient.postFile('/messages/coach', new FormData()), apiClient.blob('/file')]);
      expect(results).toHaveLength(3);
    });
    expect(refreshes).toBe(2);
    expect(result.current.status).toBe('authenticated');
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('limpia la sesión si el refresh es revocado y no entra en un bucle de reintentos', async () => {
    let refreshes = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh') && ++refreshes === 1) return ok({ user, accessToken: 'expired' });
      return denied();
    }));
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => { await expect(apiClient.get('/calendar/me')).rejects.toMatchObject({ status: 401 }); });
    expect(result.current.status).toBe('anonymous');
    expect(result.current.user).toBeNull();
    expect(refreshes).toBe(2);
  });

  it('no renueva credenciales rechazadas en login ni repite indefinidamente un 401', async () => {
    const recover = vi.fn(async () => true);
    setAccessTokenGetter(() => 'expired');
    setSessionRecovery(recover);
    const fetchMock = vi.fn(async () => denied());
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiClient.post('/auth/login', {}, { skipAuth: true })).rejects.toMatchObject({ status: 401 });
    expect(recover).not.toHaveBeenCalled();
    await expect(apiClient.get('/calendar/me')).rejects.toMatchObject({ status: 401 });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('no repite una petición de la cuenta anterior al cambiar de usuario', async () => {
    const recover = vi.fn(async () => true);
    setAccessTokenGetter(() => 'previous-user');
    setSessionRecovery(recover);
    const fetchMock = vi.fn(async () => {
      invalidatePendingAuthRequests();
      setAccessTokenGetter(() => 'new-user');
      return denied();
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiClient.get('/calendar/me')).rejects.toMatchObject({ status: 401 });
    expect(recover).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renueva para cerrar una sesión con access token vencido y termina anónimo', async () => {
    document.cookie = 'csrf_token=initial; path=/';
    let refreshes = 0;
    let logoutCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        const token = ++refreshes === 1 ? 'expired' : 'renewed';
        document.cookie = `csrf_token=${token}; path=/`;
        return ok({ user, accessToken: token });
      }
      if (url.endsWith('/auth/logout')) {
        logoutCalls++;
        expect(new Headers(init.headers).get('X-CSRF-Token')).toBe(logoutCalls === 1 ? 'expired' : 'renewed');
        return new Headers(init.headers).get('Authorization') === 'Bearer renewed' ? ok({ success: true }) : denied();
      }
      return denied();
    }));
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => { await result.current.logout(); });
    expect(result.current.status).toBe('anonymous');
    expect(logoutCalls).toBe(2);
    expect(refreshes).toBe(2);
  });
});
