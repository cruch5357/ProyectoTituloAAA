import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { setAccessTokenGetter } from '../lib/apiClient';
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
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  // Se registra una única vez: apiClient lee el token siempre a través de
  // esta función (nunca de un valor capturado), así siempre ve el valor
  // más reciente sin depender del ciclo de renders de React.
  useEffect(() => {
    setAccessTokenGetter(() => accessTokenRef.current);
  }, []);

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
    const result = await apiLogin(payload);
    accessTokenRef.current = result.accessToken;
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      // Best-effort: aunque la llamada al backend falle (ej. red caída), la
      // sesión se limpia igual del lado del cliente.
      accessTokenRef.current = null;
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
