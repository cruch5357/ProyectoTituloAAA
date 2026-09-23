// Cliente HTTP base para consumir la API del backend.
// Extendido en PROMPT 04 (ver docs/security.md) para adjuntar:
// - `Authorization: Bearer <accessToken>` en las peticiones que lo
//   necesitan (todo excepto login/register/activate/refresh).
// - `X-CSRF-Token` (leído de la cookie NO httpOnly `csrf_token`) en las
//   peticiones que dependen de la cookie de refresh (`/auth/refresh` y
//   `/auth/logout`), replicando el patrón de doble envío documentado en
//   docs/security.md, punto 9.
//
// El access token NUNCA se persiste en localStorage/sessionStorage (ver
// docs/security.md, "Manejo de sesiones/tokens"): vive únicamente en
// memoria, inyectado por AuthContext mediante `setAccessTokenGetter()`.

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

export class ApiError extends Error {
  status: number;
  code?: string | number;

  constructor(status: number, message: string, code?: string | number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Envoltorio de respuesta estándar del backend (docs/api.md, principio 2).
export interface ApiEnvelope<T, M = Record<string, unknown>> {
  data: T;
  error: null;
  meta: M;
}

interface ApiErrorBody {
  data: null;
  error: { code?: string | number; message?: string };
  meta: Record<string, unknown>;
}

type AccessTokenGetter = () => string | null;

let getAccessToken: AccessTokenGetter = () => null;

// Inyectado por AuthProvider al montar (ver src/auth/AuthContext.tsx). Antes
// de que exista una sesión, simplemente no hay token que adjuntar.
export function setAccessTokenGetter(getter: AccessTokenGetter): void {
  getAccessToken = getter;
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

export interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  // true = no adjuntar Authorization (login/register/activate/refresh son
  // públicos o dependen únicamente de la cookie de refresh).
  skipAuth?: boolean;
  // true = adjuntar X-CSRF-Token desde la cookie csrf_token (refresh/logout).
  withCsrf?: boolean;
}

async function request<T, M = Record<string, unknown>>(
  path: string,
  method: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T, M>> {
  const { skipAuth, withCsrf, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  };

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }

  if (withCsrf) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      finalHeaders[CSRF_HEADER_NAME] = csrfToken;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  const parsed = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = parsed as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      errorBody?.error?.message ?? 'Error al comunicarse con el servidor',
      errorBody?.error?.code,
    );
  }

  // Caso especial documentado en backend/src/auth/auth.controller.ts:
  // `POST /auth/refresh` sin cookie responde 200 OK con un envoltorio de
  // error en el body (no un status HTTP de error), para poder limpiar
  // cookies del lado del cliente con `passthrough`. Se trata siempre igual
  // que un error HTTP para que ningún llamador tenga que recordar este caso.
  if (parsed && (parsed as ApiErrorBody).error) {
    const errorBody = parsed as ApiErrorBody;
    throw new ApiError(
      Number(errorBody.error.code) || response.status,
      errorBody.error.message ?? 'Error al comunicarse con el servidor',
      errorBody.error.code,
    );
  }

  return parsed as ApiEnvelope<T, M>;
}

export const apiClient = {
  get: <T, M = Record<string, unknown>>(path: string, options?: RequestOptions) =>
    request<T, M>(path, 'GET', undefined, options),
  post: <T, M = Record<string, unknown>>(
    path: string,
    data?: unknown,
    options?: RequestOptions,
  ) => request<T, M>(path, 'POST', data, options),
  patch: <T, M = Record<string, unknown>>(
    path: string,
    data?: unknown,
    options?: RequestOptions,
  ) => request<T, M>(path, 'PATCH', data, options),
  delete: <T, M = Record<string, unknown>>(path: string, options?: RequestOptions) =>
    request<T, M>(path, 'DELETE', undefined, options),
};
