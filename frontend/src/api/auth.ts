// Llamadas de autenticación. Son acciones imperativas (login/refresh/logout
// cambian dónde vive la sesión), no datos remotos cacheables: por eso viven
// como funciones simples en vez de hooks de TanStack Query, consumidas
// únicamente desde AuthContext (ver src/auth/AuthContext.tsx). Las queries
// de negocio (alumnos) sí usan TanStack Query — ver src/api/students.ts.
import { apiClient } from '../lib/apiClient';
import type { PublicUser } from '../types/user';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SessionResult {
  accessToken: string;
  user: PublicUser;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

// Registro público de Coach (PROMPT 06, punto 1). A diferencia de login, el
// backend NO retorna access token ni setea cookie de refresh acá (ver
// AuthController.register): solo crea la cuenta. El caller debe redirigir a
// login para iniciar sesión — no hay "auto-login" tras registrarse.
export async function register(payload: RegisterPayload): Promise<PublicUser> {
  const res = await apiClient.post<PublicUser>('/auth/register', payload, {
    skipAuth: true,
  });
  return res.data;
}

export async function login(payload: LoginPayload): Promise<SessionResult> {
  const res = await apiClient.post<SessionResult>('/auth/login', payload, {
    skipAuth: true,
  });
  return res.data;
}

// Se llama al montar la app (sesión "silenciosa"): si existe una cookie de
// refresh válida, obtiene un access token nuevo sin pedir credenciales de
// nuevo. Si no hay cookie o es inválida, el backend responde con un error
// (ver nota en apiClient.ts) y este helper simplemente lo deja propagar;
// AuthProvider lo interpreta como "no hay sesión".
export async function refreshSession(): Promise<SessionResult> {
  const res = await apiClient.post<SessionResult>(
    '/auth/refresh',
    undefined,
    { skipAuth: true, withCsrf: true },
  );
  return res.data;
}

export async function logout(): Promise<void> {
  await apiClient.post<{ success: boolean }>('/auth/logout', undefined, {
    withCsrf: true,
  });
}
