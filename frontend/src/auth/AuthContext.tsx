import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidatePendingAuthRequests, setAccessTokenGetter, setSessionRecovery } from '../lib/apiClient';
import { login as apiLogin, logout as apiLogout, refreshSession } from '../api/auth';
import type { LoginPayload } from '../api/auth';
import type { PublicUser } from '../types/user';
import { AuthContext } from './authContextObject';
import type { AuthContextValue, AuthStatus } from './authContextObject';

// Estado de sesión (PROMPT 04). El access token vive ÚNICAMENTE en memoria
// (nunca en localStorage/sessionStorage — docs/security.md, "Manejo de
// sesiones/tokens"): si el usuario recarga la página, se pierde y se vuelve
// a obtener mediante `POST /auth/refresh`, que sí puede autenticarse porque
// depende de la cookie httpOnly de refresh, no de nada que JS pueda leer.
//
// IMPORTANTE (recordado explícitamente en PROMPT 04, punto 16): este
// contexto y el guard de ruta que lo usa (RequireAuth) son exclusivamente
// una ayuda de UX (ocultar navegación, redirigir a /login). La única
// barrera de seguridad real son los guards del backend (JwtAuthGuard,
// RolesGuard, verificación de propiedad en StudentsService) — cualquiera
// que llame a la API directamente sin pasar por esta UI sigue bloqueado ahí.
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const sessionGeneration = useRef(0);
  const recoveryRef = useRef<Promise<boolean> | null>(null);

  // Se registra una única vez: apiClient lee el token siempre a través de
  // esta función (nunca de un valor capturado), así siempre ve el valor
  // más reciente sin depender del ciclo de renders de React.
  useEffect(() => {
    setAccessTokenGetter(() => accessTokenRef.current);
    setSessionRecovery(() => {
      if (!recoveryRef.current) {
        const generation = sessionGeneration.current;
        recoveryRef.current = refreshSession().then((result) => {
          if (generation !== sessionGeneration.current) return false;
          accessTokenRef.current = result.accessToken;
          setUser(result.user);
          return true;
        }).catch(async () => {
          if (generation !== sessionGeneration.current) return false;
          accessTokenRef.current = null;
          setUser(null);
          setStatus('anonymous');
          await queryClient.cancelQueries();
          queryClient.clear();
          return false;
        }).finally(() => { recoveryRef.current = null; });
      }
      return recoveryRef.current;
    });
    return () => { setSessionRecovery(undefined); };
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

    refreshSession()
      .then((result) => {
        if (cancelled) return;
        accessTokenRef.current = result.accessToken;
        setUser(result.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        accessTokenRef.current = null;
        setUser(null);
        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    invalidatePendingAuthRequests();
    sessionGeneration.current += 1;
    const result = await apiLogin(payload);
    await queryClient.cancelQueries();
    queryClient.clear();
    accessTokenRef.current = result.accessToken;
    setUser(result.user);
    setStatus('authenticated');
    return result.user;
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await recoveryRef.current;
      await apiLogout();
    } finally {
      invalidatePendingAuthRequests();
      sessionGeneration.current += 1;
      // Best-effort: aunque la llamada al backend falle (ej. red caída), la
      // sesión se limpia igual del lado del cliente.
      accessTokenRef.current = null;
      await queryClient.cancelQueries();
      queryClient.clear();
      setUser(null);
      setStatus('anonymous');
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
