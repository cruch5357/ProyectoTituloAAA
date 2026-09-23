// Constantes centralizadas de autenticación. Ningún módulo de auth debe usar
// strings mágicos sueltos para nombres de cookies, headers o claims del JWT
// (docs/security.md; requisito explícito de PROMPT 03).

// Nombre de la cookie httpOnly que transporta el refresh token.
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Nombre de la cookie NO httpOnly (legible por JS del frontend) usada en el
// patrón de doble envío de token para mitigar CSRF sobre /auth/refresh y
// /auth/logout (docs/security.md, punto 9). No contiene el refresh token:
// es un valor aleatorio independiente, ligado a la sesión de refresh vigente
// únicamente para comparación.
export const CSRF_COOKIE = 'csrf_token';

// Header custom que el frontend debe repetir con el mismo valor de la cookie
// CSRF_COOKIE para que /auth/refresh y /auth/logout acepten la petición.
export const CSRF_HEADER = 'x-csrf-token';

// Path al que se restringe la cookie de refresh: solo los endpoints de auth
// que efectivamente la necesitan la reciben en cada request.
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

// Claves usadas dentro del payload del JWT de access token. Mínimas a
// propósito (docs/security.md, sección de claims): nunca password, nunca
// listas de alumnos, nunca datos innecesarios.
export const JWT_CLAIM_SUBJECT = 'sub';
export const JWT_CLAIM_ROLE = 'role';
export const JWT_CLAIM_TOKEN_VERSION = 'tokenVersion';

// Metadata key usada por el decorador @Roles()/RolesGuard.
export const ROLES_METADATA_KEY = 'auth:roles';

// Nombre del throttler nombrado (docs/security.md, punto 11) aplicado a los
// endpoints sensibles de autenticación.
export const AUTH_THROTTLER_NAME = 'auth';

// Acciones de auditoría registradas en AuditLog (docs/security.md, punto 18).
// Centralizadas para no repetir strings distintos por accidente entre
// servicios futuros que también quieran auditar eventos de auth.
export const AUDIT_ACTIONS = {
  COACH_REGISTERED: 'auth.coach_registered',
  STUDENT_INVITED: 'auth.student_invited',
  STUDENT_ACTIVATED: 'auth.student_activated',
  STUDENT_STATUS_CHANGED: 'students.status_changed',
  LOGIN_SUCCESS: 'auth.login_success',
  LOGIN_FAILURE: 'auth.login_failure',
  LOGOUT: 'auth.logout',
  REFRESH_ROTATED: 'auth.refresh_rotated',
  REFRESH_REUSE_DETECTED: 'auth.refresh_reuse_detected',
  // PROMPT 07: mismo criterio que STUDENT_STATUS_CHANGED — se audita el
  // cambio de estado (activar/desactivar), no cada creacion/edicion de un
  // ejercicio (acciones de bajo riesgo sobre un recurso propio del coach,
  // sin el mismo peso de seguridad que dar de baja algo que puede estar en
  // uso en una prescripcion).
  EXERCISE_STATUS_CHANGED: 'exercises.status_changed',
} as const;

export const AUDIT_ENTITY_USER = 'User';
export const AUDIT_ENTITY_REFRESH_SESSION = 'RefreshSession';
export const AUDIT_ENTITY_STUDENT_INVITATION = 'StudentInvitation';
export const AUDIT_ENTITY_EXERCISE = 'Exercise';
