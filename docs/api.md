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

---

## 8. Estado de implementación (PROMPT 04)

Esta sección documenta lo agregado en PROMPT 04: gestión de alumnos por parte del Coach y la primera autorización real por propiedad de recurso (`backend/src/students/`). Reemplaza/actualiza puntualmente lo dicho en la sección 7 sobre `POST /auth/students/invite`.

### Reorganización: `POST /auth/students/invite` → `POST /api/v1/students/invite`

**Decisión:** el endpoint de invitación se movió de `AuthModule` a un nuevo `StudentsModule`, sin cambiar su lógica ni su contrato (mismo body `{ email }`, misma respuesta `{ email, expiresAt, activationToken }`, mismo throttler `"auth"`). La ruta vieja (`/api/v1/auth/students/invite`) **ya no existe** (404) — no se dejaron dos endpoints haciendo lo mismo. Motivo: invitar a un alumno es, conceptualmente, gestión de alumnos (mismo dominio que listar/ver detalle/activar-desactivar), no un mecanismo de autenticación en sí mismo; agruparlo junto al resto de `/students` evita que la lógica de negocio de "alumnos" quede repartida entre dos módulos. `AuthService.inviteStudent()` se eliminó; su lógica pasó, sin modificaciones funcionales, a `StudentsService.invite()`.

### `GET /api/v1/students`

Requiere `Authorization: Bearer` + rol `COACH`. Devuelve **únicamente** los alumnos del coach autenticado — el `coachId` usado para filtrar sale siempre de `CurrentUser()` (token ya verificado), nunca de la query. Un `?coachId=...` enviado por el cliente es **rechazado con 400** (no simplemente ignorado): la configuración global de ValidationPipe (`whitelist`/`forbidNonWhitelisted`) rechaza cualquier query param no declarado en `ListStudentsQueryDto`, y ese DTO deliberadamente no declara `coachId`.

Query params opcionales: `page` (default `1`), `limit` (default `20`, máximo `100`), `search` (búsqueda simple por nombre o email, sin operadores). Respuesta: `{ data: PublicUser[], error: null, meta: { page, limit, total, totalPages } }`.

### `GET /api/v1/students/:id`

Requiere `Authorization: Bearer` + rol `COACH`. `:id` se valida contra el formato de cuid que genera Prisma (`c` + 24 caracteres alfanuméricos); un id con formato inválido responde `400` sin consultar la base de datos. Si el id tiene formato válido pero el alumno no existe, o existe pero pertenece a **otro** coach, responde **`404`** en ambos casos con el mismo mensaje genérico ("Alumno no encontrado") — nunca `403`. Ver `docs/security.md`, sección "Estado de implementación (PROMPT 04)" para la justificación completa de por qué 404 y no 403 acá.

### `PATCH /api/v1/students/:id/status`

Requiere `Authorization: Bearer` + rol `COACH`. Body: `{ isActive: boolean }` — **único** campo que este endpoint puede modificar (nunca `role`, `coachId`, `email` ni `passwordHash`, ni aunque el cliente los envíe: se rechazan con `400` por no estar declarados en `UpdateStudentStatusDto`). Mismo chequeo de propiedad que el detalle: `404` si el alumno no existe o pertenece a otro coach. Registra `students.status_changed` en `AuditLog`.

### `POST /api/v1/students/invite`

Idéntico en comportamiento a lo documentado en la sección 7 para `POST /auth/students/invite` (ver esa sección para el detalle completo), solo que ahora vive bajo `/students`.

### Alcance explícitamente fuera de PROMPT 04

No se implementó edición de perfil del alumno (`PATCH /students/:id` con nombre/email — la sección 4 lo menciona como parte del contrato conceptual, pero `requirements.md` RF-06 solo exige "listar, ver detalle, editar y desactivar"; se interpretó "desactivar" como el único caso de "editar" necesario para el MVP de este prompt, dejando la edición completa de perfil para un prompt futuro si se decide implementarla) ni `DELETE /students/:id` (baja lógica ya se cubre con `isActive: false`, que es reversible — no se agregó una baja adicional). Tampoco se agregó ningún endpoint de ejercicios, programas, sesiones, registros de entrenamiento, Excel, métricas ni mensajería (fuera de alcance explícito de PROMPT 04).

---

## 9. Estado de implementación (PROMPT 07)

Documenta lo agregado en PROMPT 07: el catálogo de ejercicios del Coach (`backend/src/exercises/`), siguiendo exactamente el mismo patrón de autorización y forma de respuesta ya establecido para `/students` en PROMPT 04.

Formato de respuesta y códigos de error: idénticos a los ya documentados en las secciones 5 y 7-8 (envoltorio `{ data, error, meta }`, `401`/`403`/`404` según corresponda).

### `GET /api/v1/exercises`

Requiere `Authorization: Bearer` + rol `COACH`. Devuelve únicamente los ejercicios del coach autenticado (el `coachId` sale siempre de `CurrentUser()`, nunca de la query — un `?coachId=...` es rechazado con `400` por el mismo mecanismo `whitelist`/`forbidNonWhitelisted` que en `/students`). Query params opcionales: `page` (default `1`), `limit` (default `20`, máximo `100`), `search` (por nombre o grupo muscular). **No filtra por estado**: devuelve ejercicios activos e inactivos por igual (el cliente distingue con el campo `isActive` de cada item), igual que `GET /students` no excluye alumnos inactivos. Respuesta: `{ data: Exercise[], error: null, meta: { page, limit, total, totalPages } }`.

### `GET /api/v1/exercises/:id`

Requiere `Authorization: Bearer` + rol `COACH`. `:id` se valida contra el formato de cuid antes de consultar la base de datos (`400` si el formato es inválido). Si el ejercicio no existe o pertenece a otro coach, responde `404` en ambos casos con el mismo mensaje genérico ("Ejercicio no encontrado") — nunca `403`, mismo criterio documentado en `docs/security.md` para `/students/:id`.

### `POST /api/v1/exercises`

Requiere `Authorization: Bearer` + rol `COACH`. Body: `{ name, muscleGroup?, instructions?, videoUrl? }` — exactamente los campos que el modelo `Exercise` ya tenía (PROMPT 02); no se agregó ningún campo conceptual nuevo. El `coachId` del ejercicio creado sale siempre del token, nunca del body. `isActive` nace siempre en `true` (default del schema); este endpoint no lo recibe del cliente.

### `PATCH /api/v1/exercises/:id`

Requiere `Authorization: Bearer` + rol `COACH`. Body: cualquier subconjunto de `{ name, muscleGroup, instructions, videoUrl }` (edición parcial). Mismo chequeo de propiedad que el detalle (`404` si no existe o es de otro coach). **Nunca** modifica `isActive` — ese campo tiene su propio endpoint (ver abajo), igual que `/students` separa edición de estado en `PATCH /students/:id/status`.

### `PATCH /api/v1/exercises/:id/status`

Requiere `Authorization: Bearer` + rol `COACH`. Body: `{ isActive: boolean }` — único campo que este endpoint puede modificar. **Es la única forma de "eliminar" un ejercicio** (baja lógica, reversible): no existe `DELETE /exercises/:id`, mismo criterio ya documentado en la sección 8 para `/students` ("baja lógica ya se cubre con `isActive: false`, que es reversible — no se agregó una baja adicional"). Esto además satisface por diseño el requisito de PROMPT 07 de nunca poder romper una prescripción que ya use el ejercicio: como nunca se intenta un borrado físico desde la API, la restricción `RESTRICT` de la base de datos (`docs/database.md`, sección 8.2) ni siquiera llega a evaluarse desde este flujo.

### Alcance explícitamente fuera de PROMPT 07

No se agregó ningún endpoint de programación (`programs`, `blocks`, `weeks`, `sessions`, `session-exercises` como parte de una prescripción real — sección 4 de este documento sigue siendo conceptual para ese dominio). Tampoco se agregó el endpoint de solo lectura para que un alumno vea el detalle de un ejercicio prescrito (RF-09): depende de `SessionExercise` como parte de una programación real, que es alcance de PROMPT 08 en adelante.

---

## 10. Estado de implementación (PROMPT 08)

Documenta lo agregado en PROMPT 08: la jerarquía completa de prescripción (`Program -> Block -> Week -> Session -> SessionExercise`, `backend/src/programs/`, `blocks/`, `weeks/`, `sessions/`, `session-exercises/`), la integración con el catálogo de ejercicios (PROMPT 07) y la primera autorización real por **cadena de propiedad multi-nivel** del proyecto. Formato de respuesta y códigos de error: idénticos a los ya documentados (envoltorio `{ data, error, meta }`).

### Rutas anidadas vs. rutas de recurso propio

Siguiendo el contrato conceptual de la sección 4 (`GET/POST /programs/:id/blocks`, etc.), cada nivel expone dos controllers: uno anidado bajo su padre (solo `GET` lista y `POST` crea, porque ambas operaciones necesitan el id del padre en la ruta) y uno bajo su propio prefijo (`GET`/`PATCH` de detalle y edición, porque esas operaciones ya identifican el recurso por su propio id):

- `GET/POST /api/v1/programs` — CRUD raíz, sin padre.
- `GET/POST /api/v1/programs/:programId/blocks`, `GET/PATCH /api/v1/blocks/:id`
- `GET/POST /api/v1/blocks/:blockId/weeks`, `GET/PATCH /api/v1/weeks/:id`
- `GET/POST /api/v1/weeks/:weekId/sessions`, `GET/PATCH /api/v1/sessions/:id`
- `GET/POST /api/v1/sessions/:sessionId/exercises`, `GET/PATCH /api/v1/session-exercises/:id`

Todos requieren `Authorization: Bearer` + rol `COACH` (mismas dos capas de guard que `/students` y `/exercises`).

### `PATCH /api/v1/programs/:id/status` en vez de `DELETE /api/v1/programs/:id`

La sección 4 de este documento (planificación conceptual, PROMPT 00) mencionaba `DELETE /programs/:id`. Se aplica la misma desviación ya documentada en las secciones 8 y 9 para `/students` y `/exercises`: la única forma de "eliminar" un programa es `PATCH /programs/:id/status` con `{ isActive: boolean }` (baja lógica reversible). No existe `DELETE` para ningún recurso de esta jerarquía (`programs`, `blocks`, `weeks`, `sessions`, `session-exercises`) — ver "Alcance explícitamente fuera de este prompt" más abajo.

### Creación con posición (`order`) explícita o automática

`POST /programs/:programId/blocks`, `POST /blocks/:blockId/weeks`, `POST /weeks/:weekId/sessions` y `POST /sessions/:sessionId/exercises` aceptan un `order` opcional. Si se omite, el nuevo ítem se agrega al final (siguiente `order` disponible). Si se especifica una posición ya ocupada por un hermano, el servicio la abre corriendo hacia adelante el resto de los hermanos (`Prisma.$transaction`, ver `docs/database.md` sección 12.3) — nunca responde `409` por colisión de `order`, a diferencia de un email duplicado.

### `POST /api/v1/sessions/:sessionId/exercises` — integración con el catálogo (PROMPT 07)

Body: `{ exerciseId, order?, targetSets?, targetRepsMin?, targetRepsMax?, targetRpe?, targetRir?, restSeconds?, notes? }`. `exerciseId` debe referenciar un ejercicio **ya existente** del catálogo del mismo coach autenticado (`GET /exercises`) — nunca se copian sus datos, solo se guarda la relación (`SessionExercise.exerciseId`). `404` genérico ("Ejercicio no encontrado") si el ejercicio no existe o pertenece a otro coach, con el mismo mensaje que usaría `GET /exercises/:id` directamente. `422` si `targetRepsMax` es menor que `targetRepsMin`. Todos los campos de prescripción son exactamente los que ya existían en el modelo `SessionExercise` desde PROMPT 02 — no se expone ningún campo de carga/peso (eso es exclusivo del lado de ejecución, fuera de alcance).

`PATCH /api/v1/session-exercises/:id` acepta además reemplazar `exerciseId` (revalidando la propiedad del nuevo ejercicio); `GET /sessions/:sessionId/exercises` devuelve cada ítem con un resumen embebido del ejercicio (`{ id, name, muscleGroup, isActive }`) para que el frontend no necesite una consulta adicional por fila.

### Autorización por cadena de propiedad multi-nivel

- `Program`: propiedad directa (`Program.coachId`), igual que `Exercise`/`Student`.
- `Block`: propiedad indirecta vía `Block.program.coachId`.
- `Week`: propiedad indirecta vía `Week.block.program.coachId`.
- `Session`: propiedad indirecta vía `Session.week.block.program.coachId`.
- `SessionExercise`: propiedad indirecta vía `SessionExercise.session.week.block.program.coachId`, **más** una verificación independiente de que `exerciseId` pertenece al mismo coach.

Cada nivel resuelve su cadena completa en una única consulta anidada (`include` de Prisma), nunca con múltiples consultas encadenadas. Todos los niveles responden `404` (nunca `403`) tanto si el recurso no existe como si pertenece a otro coach, sin distinguir los dos casos — mismo criterio ya establecido para `/students` y `/exercises` (ver `docs/security.md`).

### Sin paginación en `blocks`, `weeks`, `sessions`, `session-exercises`

A diferencia de `/programs` y `/exercises` (que sí paginan), los listados anidados (`GET /programs/:id/blocks`, etc.) devuelven **todos** los ítems del padre, ordenados por `order`, sin `page`/`limit`. Justificación: un programa acumula un número acotado de bloques/semanas/sesiones (decenas, no miles), a diferencia de alumnos o del catálogo de ejercicios, que sí pueden crecer sin límite práctico.

### Alcance explícitamente fuera de PROMPT 08

No se implementó `DELETE` para ningún recurso de esta jerarquía (`programs`, `blocks`, `weeks`, `sessions`, `session-exercises`): el enunciado del prompt solo pide "crear, listar, consultar, editar" (y, únicamente para `Program`, "cambiar su estado") en cada nivel — nunca menciona eliminar bloques/semanas/sesiones/ítems de prescripción, así que no se agregó esa funcionalidad no solicitada. Tampoco se implementó `POST /programs/:id/assign` (asignación de un programa a un alumno, `ProgramAssignment`) ni ningún endpoint de registro de entrenamiento real (`WorkoutLog`/`SetLog`) — ambos permanecen conceptuales (sección 4), fuera de alcance según `docs/roadmap.md`.
