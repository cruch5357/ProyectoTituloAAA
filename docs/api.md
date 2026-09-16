# API y Comunicación Frontend-Backend

> Documento de planificación técnica — PROMPT 00. Define el contrato conceptual de la API. No se implementan endpoints en esta etapa.

## 1. Principios

- REST sobre HTTPS, payloads JSON, versionado bajo el prefijo `/api/v1`.
- Formato de respuesta consistente: `{ "data": ..., "error": null, "meta": {...} }` en éxito, `{ "data": null, "error": { "code": "...", "message": "...", "details": [...] }, "meta": {...} }` en error.
- Listados paginados (`page`, `pageSize`) con filtros por query params (ej. `?studentId=...`, `?status=...`).
- Toda ruta protegida requiere un JWT válido en el header `Authorization: Bearer <token>`, salvo `/auth/login` y `/auth/refresh`.
- Documentación autogenerada con OpenAPI/Swagger a partir del propio backend, para que el contrato nunca se desincronice del código.

## 2. Autenticación

- `POST /auth/register` — registro de coach (los alumnos no se autorregistran, ver `requirements.md`).
- `POST /auth/students/invite` — coach invita a un alumno por correo (genera token de activación de un solo uso y con expiración).
- `POST /auth/activate` — el alumno define su contraseña usando el token de invitación.
- `POST /auth/login` — retorna access token (vida corta) y coloca el refresh token en una cookie `httpOnly`, `Secure`, `SameSite=Strict`.
- `POST /auth/refresh` — renueva el access token usando el refresh token de la cookie; protegido con mitigación CSRF (token de doble envío), ya que es el único endpoint que depende de una cookie.
- `POST /auth/logout` — invalida el refresh token vigente (revocación en base de datos o lista de invalidación).

## 3. Autorización

Cada request pasa por dos niveles de guard, en este orden:

1. **Guard de rol** — determina si el rol del token (`COACH`/`STUDENT`) puede acceder al endpoint.
2. **Guard de propiedad de recurso** — determina si el recurso solicitado (alumno, programa, sesión, registro) pertenece al usuario autenticado. Por ejemplo: un coach solo puede operar sobre `Program` cuyo `coach_id` coincide con su propio id; un alumno solo puede operar sobre `WorkoutLog` cuyo `student_id` es el suyo.

El scoping por `coach_id`/`student_id` se aplica siempre en la capa de servicio (no se confía en que el cliente envíe el id correcto): el id del usuario se toma del token, nunca del payload de la request.

## 4. Endpoints principales por dominio (conceptual)

### Usuarios
- `GET /users/me`

### Alumnos (Coach)
- `GET /students`, `GET /students/:id`, `PATCH /students/:id`, `DELETE /students/:id` (baja lógica)

### Ejercicios
- `GET /exercises`, `POST /exercises`, `PATCH /exercises/:id`, `DELETE /exercises/:id`

### Programación
- `GET/POST /programs`, `PATCH/DELETE /programs/:id`
- `GET/POST /programs/:id/blocks`
- `GET/POST /blocks/:id/weeks`
- `GET/POST /weeks/:id/sessions`
- `GET/POST /sessions/:id/exercises`
- `POST /programs/:id/assign` (body: lista de `studentId`)

### Importación de Excel
- `POST /imports/excel` — sube el archivo, ejecuta validación/normalización y retorna una vista previa (`ExcelImportBatch` en estado `pending_review`) sin persistir en el modelo normalizado.
- `GET /imports/excel/:id` — consulta el detalle/errores de una importación en curso.
- `POST /imports/excel/:id/confirm` — confirma la importación de las filas válidas hacia `Program/Block/Week/Session/SessionExercise`.
- `POST /imports/excel/:id/reject` — descarta el batch.

### Registro de entrenamiento (Alumno)
- `GET /students/me/sessions/today` (o `?weekId=`)
- `POST /sessions/:id/logs` — crea el `WorkoutLog` y sus `SetLog` asociados.
- `PATCH /logs/:id` — edición dentro de la ventana de tiempo permitida (ver `requirements.md`, RF-24).
- `GET /students/me/history`

### Dashboard y métricas (Coach)
- `GET /students/:id/metrics` — cumplimiento, evolución de carga, volumen, RPE promedio.
- `GET /coach/dashboard/summary` — resumen agregado de todos los alumnos del coach autenticado.

### Comunicación
- `GET /messages?withUserId=...`
- `POST /messages`

## 5. Manejo de errores

- Códigos HTTP estándar: `400` (validación), `401` (no autenticado), `403` (no autorizado sobre el recurso), `404` (no encontrado o no pertenece al usuario — se prefiere `404` sobre `403` cuando informar la existencia del recurso ya es una fuga de información, ej. sesiones de otro alumno), `409` (conflicto, ej. email duplicado), `422` (entidad válida en forma pero inválida en reglas de negocio), `429` (rate limit), `500` (error no controlado).
- Los mensajes de error hacia el cliente son genéricos y no exponen detalles internos (stack traces, nombres de tablas, consultas SQL); el detalle completo solo se registra en logs internos del servidor.

## 6. Rate limiting

- Límite estricto en `/auth/login`, `/auth/register` y `/auth/refresh` (ej. 5 intentos por minuto por IP) para mitigar fuerza bruta.
- Límite general más permisivo en el resto de la API, aplicado por usuario autenticado y por IP para peticiones anónimas.

---

## 7. Estado de implementación (PROMPT 03)

Las secciones 1 a 6 son la planificación conceptual (PROMPT 00). Esta sección documenta los endpoints de autenticación **realmente implementados** en `backend/src/auth/` y `backend/src/users/`. El resto de los dominios listados en la sección 4 sigue sin implementar (prompts futuros). La documentación interactiva OpenAPI/Swagger vive en `/api/v1/docs` una vez que el backend corre.

Formato de respuesta real: `{ "data": ..., "error": null, "meta": {} }` en éxito; en error, el filtro global (`AllExceptionsFilter`) produce `{ "data": null, "error": { "code", "message" }, "meta": {...} }`.

### `POST /api/v1/auth/register`
Público. Body: `{ email, password, name }`. Crea siempre un usuario `COACH` (los alumnos nunca se autorregistran). `409` si el email ya existe. `400` si la contraseña no cumple la política mínima (≥10 caracteres, al menos una letra y un número) o el email es inválido. Rate limit reforzado (`"auth"`).

### `POST /api/v1/auth/students/invite`
Requiere `Authorization: Bearer` + rol `COACH`. Body: `{ email }`. El `coachId` sale siempre del token, nunca del body. `409` si el email ya tiene cuenta. Respuesta: `{ email, expiresAt, activationToken }`. **Nota importante:** como el envío real de correo está fuera de alcance de PROMPT 03, `activationToken` (el token en texto plano) se retorna una única vez en esta respuesta para que el coach lo entregue manualmente al alumno; nunca se loguea ni se persiste en texto plano (solo su hash SHA-256 en `student_invitations.token_hash`). Debe reemplazarse por un envío de correo real antes de producción.

### `POST /api/v1/auth/activate`
Público. Body: `{ token, name, password }`. Crea el `User` (`STUDENT`) con el `coachId` de la invitación. `401` genérico si el token no existe, ya fue usado o expiró (mismo mensaje en los tres casos). `409` si por alguna razón el email ya tiene cuenta (colisión de unicidad).

### `POST /api/v1/auth/login`
Público. Body: `{ email, password }`. Éxito (`200`): `{ accessToken, user }` + cookies `refresh_token` (httpOnly) y `csrf_token` (legible por JS). `401` genérico (`"Credenciales inválidas"`) para email inexistente, usuario inactivo o contraseña incorrecta — nunca se distingue cuál de los tres ocurrió.

### `POST /api/v1/auth/refresh`
Público, pero requiere la cookie `refresh_token` **y** el header `X-CSRF-Token` con el mismo valor que la cookie `csrf_token` (protección CSRF de doble envío). Rota el refresh token (revoca el anterior, emite uno nuevo) y retorna un nuevo `accessToken`. `401`/`403` genérico ante cookie ausente/inválida/expirada, o `403` si falla la validación CSRF. Si el token presentado ya había sido rotado (reuso), se revocan todas las sesiones del usuario.

### `POST /api/v1/auth/logout`
Requiere `Authorization: Bearer` **y** CSRF (mismo mecanismo que refresh, porque también actúa sobre la cookie). Revoca la sesión de refresh vigente y limpia ambas cookies. Idempotente.

### `GET /api/v1/users/me`
Requiere `Authorization: Bearer`. El id del usuario sale únicamente del token verificado. Retorna los datos públicos del usuario autenticado (nunca `passwordHash` ni `tokenVersion`).

### Errores

Todos los endpoints anteriores respetan los códigos de la sección 5: `400` (DTO inválido o campo no declarado — `whitelist`/`forbidNonWhitelisted` global), `401` (no autenticado / credenciales inválidas / token inválido), `403` (rol incorrecto o CSRF fallido), `409` (email duplicado), `429` (rate limit).
