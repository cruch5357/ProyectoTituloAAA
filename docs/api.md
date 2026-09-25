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

## 11. Estado de implementación (PROMPT 09)

Documenta lo agregado en PROMPT 09: la asignación de `Program` a alumnos (`ProgramAssignment`, `backend/src/program-assignments/`) — el puente entre la jerarquía de PRESCRIPCIÓN (sección 10) y, en un prompt futuro, la de EJECUCIÓN (`WorkoutLog`/`SetLog`, fuera de alcance). Formato de respuesta y códigos de error: idénticos a los ya documentados (envoltorio `{ data, error, meta }`).

### Endpoints

- `POST /api/v1/programs/:programId/assign` — asigna un programa propio a un alumno propio. Body: `{ studentId }`.
- `GET /api/v1/programs/:programId/assignments` — lista las asignaciones de un programa propio (vista Coach), sin paginación (mismo criterio que `blocks`/`weeks`/`sessions`/`session-exercises`: un programa acumula un número acotado de asignaciones).
- `GET /api/v1/program-assignments/:id` — detalle de una asignación propia (vista Coach).
- `PATCH /api/v1/program-assignments/:id/status` — activa/finaliza una asignación propia (vista Coach). Body: `{ status: 'ACTIVE' | 'FINISHED' }`.
- `GET /api/v1/program-assignments/me` — lista las asignaciones del **alumno autenticado** (vista Alumno). Requiere rol `STUDENT` en vez de `COACH` — el único grupo de endpoints del proyecto que combina ambos roles bajo el mismo controller (ver `docs/security.md` para el detalle de por qué `listOwn()` está declarado antes que `detail()` en el código, evitando que Express confunda `/program-assignments/me` con `:id = "me"`).

### `POST /programs/:programId/assign` acepta un único `studentId`, no una lista

La sección 4 de este documento (planificación conceptual, PROMPT 00) describía este endpoint con un body de **lista** de `studentId` ("asigna un programa a uno o varios alumnos"). Se implementa en cambio con un único `studentId` por llamada — exactamente como describe el enunciado de PROMPT 09 en su diagrama de flujo ("Coach → Programa propio → Selecciona Alumno propio → Asigna Programa", siempre en singular, tanto en la sección de reglas de propiedad como en la de frontend) y en su punto 1 ("Asignar un programa a **un** alumno"). Asignar a varios alumnos se logra invocando este mismo endpoint una vez por alumno; cada invocación se valida y audita de forma completamente independiente, lo que además evita tener que decidir un comportamiento "todo o nada" vs. "parcial" ante una lista con algún `studentId` inválido, que ni el enunciado ni `requirements.md` piden.

### Validación de la asignación (secuencia completa)

1-2-3. El `Program` debe existir y pertenecer al coach autenticado (`ProgramsService.findOwnedProgramOrThrow()`, reutilizado sin cambios desde PROMPT 08) → `404` genérico si no.
4-5. El `studentId` debe existir, ser `STUDENT` y pertenecer al coach autenticado → `404` genérico si no (mismo criterio de no-enumeración que el resto del proyecto: cross-coach nunca distingue "no existe" de "es de otro coach").
6. El alumno debe estar **activo** (`User.isActive`) → si existe, es propio, pero está inactivo, responde **`422`** (no `404`): el coach ya sabe que ese alumno es suyo (lo ve en `GET /students`), así que informar la causa exacta no es una fuga de información — es una regla de negocio, exactamente como los casos ya documentados de `422` en `session-exercises` (PROMPT 08, `targetRepsMax < targetRepsMin`).
7. No debe violar la restricción de asignación activa duplicada (`docs/database.md`, sección 13.1) → `409` si ya existe una asignación `ACTIVE` del mismo programa al mismo alumno. Se valida primero con una consulta explícita (mensaje de error más específico) y, como respaldo ante una condición de carrera, capturando el código `P2002` de Prisma si la base de datos rechaza el `INSERT` por el índice único parcial — mismo patrón ya usado en `AuthService.activate()` para el email único de `User`.

### `PATCH /program-assignments/:id/status` — enum, no booleano

A diferencia de `PATCH /programs/:id/status`, `/exercises/:id/status` y `/students/:id/status` (todos con un campo `isActive: boolean`), este endpoint acepta `status: 'ACTIVE' | 'FINISHED'`, porque `ProgramAssignment.status` ya era un enum real desde PROMPT 02 (`docs/database.md`, sección 8.1) — no se agregó un booleano `isActive` nuevo que duplicaría la misma información. Reactivar una asignación (`FINISHED` → `ACTIVE`) vuelve a validar la restricción de no-duplicados, por si mientras tanto se creó una nueva asignación `ACTIVE` del mismo programa/alumno.

### `GET /program-assignments/me` — acceso del Alumno

Primer endpoint del proyecto exclusivo del rol `STUDENT` fuera de `/auth/*`. El `studentId` usado para filtrar sale siempre de `CurrentUser()` (JWT ya verificado) — este endpoint no acepta ningún id externo, así que un alumno no tiene forma de pedir ni ver las asignaciones de otro alumno. Responde el resumen embebido del programa (`{ id, name, description, durationWeeks, isActive }`), pero **no** incluye información de `Block`/`Week`/`Session`: la navegación real del alumno a esa jerarquía (RF-09, RF-16 de `docs/requirements.md`) queda explícitamente fuera de alcance de este prompt, ya que `GET /programs/:id` y el resto de los endpoints de la sección 10 siguen siendo exclusivos de `COACH`.

### Alcance explícitamente fuera de PROMPT 09

No se implementó `DELETE /program-assignments/:id` (la única forma de "desactivar" una asignación es `PATCH .../status`, mismo criterio de no-borrado-físico ya establecido en todo el proyecto). No se implementó ningún endpoint de `WorkoutLog`/`SetLog` ni de navegación de solo lectura del alumno hacia `Block`/`Week`/`Session` — ambos quedan para prompts futuros, según `docs/roadmap.md`.

## 12. Estado de implementación (PROMPT 10)

Documenta lo agregado en PROMPT 10: el registro real de entrenamiento del alumno (`WorkoutLog`/`SetLog`), incluyendo el paso previo — inexistente hasta ahora — de que el alumno pueda **navegar de solo lectura** hacia la jerarquía de prescripción (`Program → Block → Week → Session`) que PROMPT 09 dejó pendiente. Formato de respuesta y códigos de error: idénticos a los ya documentados (envoltorio `{ data, error, meta }`).

### Endpoints — navegación del Alumno (solo lectura)

Nuevo controller `backend/src/student-training/`, exclusivo del rol `STUDENT`, siempre autorizado por existencia de un `ProgramAssignment` propio (nunca por `coachId`, que el alumno no tiene):

- `GET /api/v1/student/programs/:id`
- `GET /api/v1/student/programs/:id/blocks`
- `GET /api/v1/student/blocks/:id`
- `GET /api/v1/student/blocks/:id/weeks`
- `GET /api/v1/student/weeks/:id`
- `GET /api/v1/student/weeks/:id/sessions`
- `GET /api/v1/student/sessions/:id` — incluye los `SessionExercise` embebidos (la prescripción completa de la sesión).

Estos endpoints son deliberadamente paralelos a los ya existentes de `/programs`, `/blocks`, `/weeks`, `/sessions` (vista Coach, PROMPT 08) y no los reemplazan ni los reutilizan a nivel de ruta/controller: comparten únicamente los mappers puros (`toPublicProgram`, `toPublicBlock`, etc., que no tienen acoplamiento de autorización) para no duplicar la forma de la respuesta.

### Endpoints — ejecución del Alumno (`WorkoutLog`/`SetLog`)

- `POST /api/v1/sessions/:sessionId/workout-logs` — inicia un registro de entrenamiento para una sesión propia. Requiere que la `ProgramAssignment` correspondiente esté `ACTIVE` (no basta con que exista). Body: `{}` (sin campos; ver diseño de `completionStatus` más abajo).
- `GET /api/v1/sessions/:sessionId/workout-logs` — lista los `WorkoutLog` propios de esa sesión (un alumno puede repetir una sesión más de una vez).
- `GET /api/v1/workout-logs/:id` — detalle de un `WorkoutLog` propio, con sus `SetLog` embebidos (cada uno con su `SessionExercise` prescrito embebido, para que el frontend pueda mostrar prescrito-vs-real sin una segunda consulta).
- `POST /api/v1/workout-logs/:id/set-logs` — registra entre 1 y 50 series en una sola llamada. Body: `{ setLogs: [{ sessionExerciseId, setNumber, actualReps?, actualLoad?, actualRpe?, actualRir?, comments? }, ...] }`.
- `PATCH /api/v1/workout-logs/:id/finish` — finaliza (o actualiza el resumen de) un entrenamiento. Body: `{ completionStatus, durationMinutes, overallRpe?, fatigue?, comments? }` — `completionStatus` y `durationMinutes` son **obligatorios**.

### `POST /workout-logs/:id/set-logs` acepta un lote, no una serie a la vez

El enunciado de PROMPT 10 pide "Registrar SetLog" como un paso del flujo, sin especificar cardinalidad. Se implementó como lote (1 a 50 ítems) porque es el caso genuino de uso de `Prisma.$transaction` que el mismo enunciado exige ("usa transacciones solo donde varias escrituras relacionadas necesiten atomicidad"): si el alumno termina de registrar varias series de un mismo ejercicio y la serie 3 de 5 viola una restricción, ninguna de las 5 debe quedar guardada a medias. El frontend igual puede usarlo con un arreglo de un solo elemento para el flujo de "una serie a la vez" (ver sección de frontend más abajo) sin perder esta garantía.

### Diseño: `completionStatus` no tiene un valor "en progreso"

`WorkoutCompletionStatus` (`docs/database.md`) solo define `COMPLETED`, `PARTIAL`, `SKIPPED` — no existe un cuarto valor para "entrenamiento iniciado pero aún no finalizado", y el campo es `NOT NULL` sin default. Se decidió **no modificar el schema** (PROMPT 10 exige reutilizar únicamente los campos existentes) y en su lugar:

- `start()` crea el `WorkoutLog` con `completionStatus: PARTIAL` como valor provisorio — nunca visible como "el veredicto final" del alumno, porque `finish()` sobrescribe ese campo con el valor real que el alumno elige.
- `durationMinutes` (nullable en el schema) se usa como la señal de "finalizado": mientras sea `null`, el `WorkoutLog` se considera en curso; `finish()` lo exige como obligatorio en su DTO, así que un `WorkoutLog` que ya pasó por `finish()` siempre tiene `durationMinutes !== null`.
- Esa señal habilita una regla de negocio: `POST .../set-logs` responde `409 Conflict` si `durationMinutes !== null` (no se pueden agregar series nuevas a un entrenamiento ya finalizado), pero `finish()` puede volver a llamarse (para corregir el resumen) y los `SetLog` ya existentes se pueden seguir editando, ambos casos sujetos a la ventana de edición de RF-24.

Esta decisión queda documentada también como comentario de clase en `backend/src/workout-logs/workout-logs.service.ts`, para que quede visible en el código y no solo aquí.

### RF-24 — ventana de edición de 24 horas

`backend/src/common/training/edit-window.ts` centraliza la regla (`ensureWithinEditWindow(anchor)`, `EDIT_WINDOW_MS = 24h`) y se aplica en dos lugares con el mismo ancla — **siempre** `WorkoutLog.createdAt`, nunca `SetLog.createdAt` — para que toda la sesión de entrenamiento comparta una única ventana de edición en vez de que cada serie tenga la suya:

- `PATCH /workout-logs/:id/finish`, al volver a llamarse sobre un `WorkoutLog` ya finalizado.
- `PATCH /set-logs/:id`, al editar una serie ya registrada.

Pasada la ventana, ambos responden `422 Unprocessable Entity`. RF-24 en `requirements.md` sigue marcado como "propuesto, pendiente de validación con el equipo" — se implementó exactamente ese valor propuesto (24h) sin cambiar su estado de pendiente-de-validar.

### Autorización del Alumno — cadena vía `ProgramAssignment`

A diferencia del Coach (que tiene `coachId` directo en `Program`), el Alumno no tiene una columna de propiedad directa en `Block`/`Week`/`Session`. La cadena de autorización, implementada en `StudentTrainingService.findAssignedSessionOrThrow()` y reutilizada por `WorkoutLogsService.start()`, hace dos verificaciones independientes:

1. Resuelve `Session → Week → Block → Program` con un único `include` anidado (igual patrón que el resto del proyecto) → `404` si la cadena no existe.
2. Verifica, aparte, que exista una fila `ProgramAssignment` para `{ programId, studentId }` (con `status: ACTIVE` cuando la operación lo exige, como iniciar un entrenamiento) → `404` si no hay asignación, sin distinguir "no está asignado" de "no existe" (mismo criterio de no-enumeración de todo el proyecto).

Para `WorkoutLog`/`SetLog` en sí (que sí tienen `studentId`/`workoutLogId` directos), la verificación es directa por igualdad de `studentId`, sin necesidad de recorrer la cadena de nuevo — igual patrón que `Program.coachId` en el Coach.

### Separación prescripción/ejecución — cómo se mantiene en la práctica

Ningún endpoint de este prompt escribe en `Session`, `SessionExercise`, `Week`, `Block` ni `Program`: `StudentTrainingService` es 100% de lectura, y `WorkoutLogsService`/`SetLogsService` solo escriben en `WorkoutLog`/`SetLog`. Los valores prescritos que el frontend muestra junto a los reales (`targetReps`, `targetLoad`, `targetRpe`, `targetRir`) llegan siempre embebidos desde el `include` de `SessionExercise` en la respuesta de `GET /workout-logs/:id`, nunca copiados a una columna de `SetLog` — si el coach edita la prescripción después, el registro ya guardado del alumno sigue mostrando el prescrito vigente al momento de la consulta, no uno "congelado", que es la interpretación más simple compatible con el schema actual (no existe versionado de prescripción).

### Alcance explícitamente fuera de PROMPT 10

No se implementó historial de sesiones ni evolución básica (RF-25: "consultar su historial de sesiones y evolución básica"), dashboard o métricas del coach, comparación coach-vs-alumno, gráficos, service worker/PWA avanzada, edición del alumno sobre la prescripción, ni borrado de `WorkoutLog`/`SetLog` — todos quedan para prompts futuros según `docs/roadmap.md`.

## 13. Estado de implementación (PROMPT 11)

Documenta lo agregado en PROMPT 11: el historial de entrenamientos y una primera capa de evolución básica descriptiva del alumno (RF-25), cerrando así el bloque RF-21 a RF-25 completo. Formato de respuesta y códigos de error: idénticos a los ya documentados (envoltorio `{ data, error, meta }`).

### Endpoints nuevos

- `GET /api/v1/workout-logs` — historial paginado y filtrable de los `WorkoutLog` propios. Query params opcionales: `page`, `limit` (mismo criterio de paginación que `/exercises`), `dateFrom`, `dateTo` (ISO 8601, ambos inclusive), `completionStatus` (`COMPLETED` | `PARTIAL` | `SKIPPED`), `programId`, `sessionId`. Cada fila trae embebido el contexto de sesión/semana/bloque/programa vigente y un `setLogsCount` (conteo, no el detalle de cada serie).
- `GET /api/v1/workout-logs/evolution` — métricas descriptivas simples (`WorkoutSummaryMetrics`) más, opcionalmente, la evolución de carga/repeticiones de un ejercicio puntual del catálogo. Query params opcionales: `dateFrom`, `dateTo`, `programId` (se aplican también al cálculo del resumen) y `exerciseId` (agrega el arreglo `exerciseEvolution`; sin él, ese campo es `null`).

Ambos endpoints viven en el mismo controller que ya existía (`/workout-logs`, PROMPT 10) y comparten su guard de clase (`JwtAuthGuard` + `Roles(STUDENT)`) — no se creó un módulo nuevo.

`GET /workout-logs/:id` (detalle, ya existente desde PROMPT 10) se **amplió** — no se duplicó — para embeber el mismo contexto de sesión/programa que el historial, ya que PROMPT 11 pide poder ver "sesión" y "programa relacionado" en el detalle.

### Por qué `GET /workout-logs` y `GET /workout-logs/evolution` conviven con `GET /workout-logs/:id` sin ambigüedad

NestJS/Express resuelve las rutas de un controller en el orden en que se declaran. `history()` (`@Get()`) y `evolution()` (`@Get('evolution')`) están declaradas **antes** que `detail()` (`@Get(':id')`) en `WorkoutLogsController`: si `:id` se declarara primero, una petición a `GET /workout-logs/evolution` matchearía ese patrón con `id = "evolution"` en vez de llegar al handler correcto. Queda documentado también como comentario en el propio controller para que nadie reordene los métodos sin darse cuenta de esta dependencia.

### Autorización — por qué los filtros no necesitan una verificación de propiedad aparte

El enunciado de PROMPT 11 exige explícitamente no aceptar `studentId`/`userId` desde el cliente y no permitir que un alumno obtenga información de otro alumno. Ninguno de los dos DTOs de query (`ListWorkoutLogsQueryDto`, `GetWorkoutEvolutionQueryDto`) declara esos campos — con `whitelist`/`forbidNonWhitelisted` globales, enviarlos se rechaza con `400` antes de llegar al servicio. El `studentId` real sale siempre de `CurrentUser()` y `WorkoutLogsService` lo agrega **siempre** al `where` de Prisma junto con los filtros opcionales (`dateFrom`/`dateTo`/`completionStatus`/`programId`/`sessionId`).

Esto hace que los demás filtros sean seguros **por construcción**, sin necesidad de una verificación de propiedad adicional: como el `where` combina `studentId` (fijo) con `AND` los demás filtros, pedir un `programId` o `sessionId` que no es propio simplemente no coincide con ninguna fila del alumno autenticado y devuelve una lista vacía — nunca puede "ampliar" el resultado hacia los datos de otro alumno. La única cadena de propiedad real que existía para este dominio (`ProgramAssignment`, PROMPT 09/10) se sigue resolviendo en `start()`/`findAssignedSessionOrThrow()`, sin cambios.

No existe todavía ningún endpoint de historial/evolución para el Coach (eso es el dashboard, explícitamente fuera de alcance de este prompt): el requisito de PROMPT 11 de que "un Coach no obtenga automáticamente historial de cualquier alumno" se cumple hoy porque ese acceso simplemente no existe. Cuando se construya, debe reutilizar las mismas funciones de `common/training/workout-metrics.ts` pasando un `where` con `student: { coachId }` en vez de `studentId`, nunca un cálculo aparte (ver siguiente sección).

### Cómo se calculan las métricas de evolución

`backend/src/common/training/workout-metrics.ts` concentra el cálculo, deliberadamente **fuera** de `WorkoutLogsService`, con dos funciones puras:

- `computeWorkoutSummaryMetrics(prisma, where)`: total de entrenamientos **finalizados** (`durationMinutes !== null`, la misma señal de PROMPT 10 — un entrenamiento en curso no cuenta para no inflar el promedio), total de series registradas (esta sí cuenta también las de un entrenamiento aún en curso, ya que una serie registrada es un dato real independiente de si la sesión se cerró), duración/RPE/fatiga promedio (`Prisma.aggregate`, `_avg`), y frecuencia de entrenamiento por semana calculada sobre el rango real que cubren los datos (`_min`/`_max` de `performedAt`) — **nunca** sobre una ventana fija inventada. Con menos de 2 entrenamientos finalizados no hay un rango real que promediar, así que la frecuencia queda en `null` en vez de mostrar un número sin sentido (ej. "1/semana" con un solo dato).
- `computeExerciseEvolution(prisma, where, exerciseId)`: trae los `SetLog` de ese ejercicio del catálogo (a través de `SessionExercise.exerciseId`) dentro del `where` dado, y los agrupa **por entrenamiento** (no por serie suelta): cada punto de la evolución es "carga máxima alcanzada y repeticiones totales ese día", ordenado cronológicamente. Devuelve un arreglo vacío — nunca un dato inventado — si el alumno nunca registró ese ejercicio.

Ambas funciones reciben el `where` ya armado por el llamador (nunca deciden ellas de quién son los datos), precisamente para poder reutilizarse sin cambios desde el futuro dashboard del Coach. `buildWorkoutLogFilterWhere()` (mismo archivo) arma la porción de filtros común a `dateFrom`/`dateTo`/`completionStatus`/`programId`/`sessionId`, reutilizada tanto por `listHistory()` como por `getEvolution()`.

Ninguna de estas funciones usa Machine Learning, predicción ni un algoritmo propio: son agregaciones descriptivas simples (conteos, promedios, máximos) calculadas por PostgreSQL vía Prisma, exactamente lo que pide PROMPT 11.

### `dateTo` sin hora se interpreta como el fin de ese día

Un filtro `dateTo=2026-03-15` (sin componente de hora) se normaliza internamente a `2026-03-15T23:59:59.999Z` antes de usarse en el `where` (`parseDateTo()`, `common/training/workout-metrics.ts) — de lo contrario, `lte` contra la medianoche excluiría todo lo registrado ese mismo día, el resultado menos intuitivo posible para alguien filtrando "hasta hoy". `dateFrom` no necesita el ajuste simétrico: la medianoche de ese día ya es su inicio natural.

### Alcance explícitamente fuera de PROMPT 11

No se modificó ningún endpoint/lógica de `start()`/`addSetLogs()`/`finish()` (PROMPT 10) ni de `ProgramAssignment` (PROMPT 09). No se introdujo versionado de prescripciones: el detalle sigue mostrando la prescripción vigente al momento de la consulta, igual que desde PROMPT 10. No se implementó dashboard ni métricas del Coach, comparación coach-vs-alumno, gráficos con librerías de visualización, Excel, mensajería, PWA avanzada/service worker, Machine Learning/predicciones, pagos ni wearables — todos quedan para prompts futuros según `docs/roadmap.md`.

## 14. Estado de implementación (PROMPT 12)

Documenta lo agregado en PROMPT 12: el Dashboard del Coach (RF-26) — resumen agregado de todos sus alumnos, actividad reciente y métricas por alumno puntual. Formato de respuesta y códigos de error: idénticos a los ya documentados (envoltorio `{ data, error, meta }`).

### Endpoints nuevos

Todos viven en un módulo nuevo (`DashboardModule`, `backend/src/dashboard/`), con guard de clase `JwtAuthGuard` + `Roles(COACH)` — exclusivos del coach autenticado, nunca accesibles a un STUDENT.

- `GET /api/v1/dashboard/summary` — resumen agregado de **todos** los alumnos del coach: alumnos totales/activos, asignaciones activas, entrenamientos registrados/finalizados, promedios (duración/RPE/fatiga), frecuencia semanal y distribución de cumplimiento. Sin query params.
- `GET /api/v1/dashboard/recent-activity` — actividad reciente (`WorkoutLog`) de todos los alumnos del coach, paginada y ordenada por `performedAt` descendente. Query params opcionales: `page`, `limit`, `dateFrom`, `dateTo`, `completionStatus` (mismo criterio de paginación/fechas que `GET /workout-logs`, PROMPT 11). Cada fila embebe el resumen del alumno (`id`/`name`/`email`) además del contexto de sesión/programa ya existente, para poder distinguir de quién es cada entrenamiento en una sola tabla.
- `GET /api/v1/dashboard/students/:studentId` — métricas de **un** alumno propio puntual: entrenamientos registrados/finalizados, promedios, frecuencia, distribución de cumplimiento y, opcionalmente, evolución de un ejercicio del catálogo. Query params opcionales: `dateFrom`, `dateTo`, `programId`, `exerciseId` — literalmente el mismo `GetWorkoutEvolutionQueryDto` que ya usa `GET /workout-logs/evolution` (PROMPT 11), reutilizado sin cambios ni duplicación.

### Aislamiento entre coaches (CRÍTICO) — de dónde sale cada `coachId`/`studentId`

El `coachId` que scopea `summary`/`recent-activity` **siempre** sale de `CurrentUser()` en el controller — ningún DTO de este módulo declara un campo `coachId`, así que un intento de enviarlo se rechaza con `400` (whitelist/forbidNonWhitelisted globales), igual que el criterio ya aplicado a `studentId`/`userId` en PROMPT 11. `DashboardSummaryService` fija `student: { coachId }` como base de **todo** `where` de `WorkoutLog`/`ProgramAssignment`/`User` que construye (método privado `coachWorkoutLogWhere()`), y los filtros opcionales (fechas, estado) solo pueden **acotar** ese conjunto, nunca ampliarlo — mismo argumento anti-IDOR "seguro por construcción" ya documentado en PROMPT 11 para los filtros del historial del alumno, aplicado ahora al `coachId` del coach en vez del `studentId` del alumno.

Para `GET /dashboard/students/:studentId`, el `studentId` de la URL es del cliente y **sí** podría apuntar a un alumno de otro coach — por eso `DashboardStudentService.getStudentDashboard()` empieza siempre por `StudentsService.getOwnedByCoach(coachId, studentId)` (el mismo método que ya usa `GET /students/:id` desde PROMPT 04, ahora exportado desde `StudentsModule` para este reuso) **antes** de tocar cualquier tabla de `WorkoutLog`: responde `404` genérico (nunca `403`) si el alumno no existe, no es `STUDENT`, o pertenece a otro coach, exactamente como ya lo hace `StudentsController`. Ninguna métrica se calcula sin pasar primero por esa verificación — ver `dashboard-student.service.spec.ts`, que prueba explícitamente que ninguna consulta de Prisma se dispara si `getOwnedByCoach()` rechaza.

### Reutilización — nada de esto duplica lo de PROMPT 11

Las tres funciones puras de `backend/src/common/training/workout-metrics.ts` (`buildWorkoutLogFilterWhere`, `computeWorkoutSummaryMetrics`, `computeExerciseEvolution`) se reutilizan **sin ningún cambio de comportamiento**, pasando un `where` scopeado por coach (`student: { coachId }`) o por alumno ya verificado (`studentId`) en vez del `studentId` del propio alumno autenticado — exactamente el reuso que ese archivo anticipó explícitamente en su comentario de cabecera desde PROMPT 11. `GetWorkoutEvolutionQueryDto` (PROMPT 11) se importa directamente desde `workout-logs/dto/` para el endpoint por-alumno, en vez de declarar un DTO paralelo con los mismos campos. La verificación de propiedad coach→alumno reutiliza `StudentsService.getOwnedByCoach()` (PROMPT 04) en vez de reimplementar ese chequeo.

Se agregaron dos funciones nuevas al mismo archivo `workout-metrics.ts` (no un servicio nuevo aparte), porque son agregaciones puras y genéricas sobre un `where` arbitrario, igual que las tres anteriores:

- `countRegisteredWorkouts(prisma, where)`: `prisma.workoutLog.count({ where })` — **todo** `WorkoutLog` existente, sin filtrar por `durationMinutes` (a diferencia de `computeWorkoutSummaryMetrics`, cuyo `totalWorkouts` describe solo los ya finalizados).
- `computeCompletionStatusBreakdown(prisma, where)`: distribución de `completionStatus` (`COMPLETED`/`PARTIAL`/`SKIPPED`) entre los `WorkoutLog` ya finalizados, vía `prisma.workoutLog.groupBy`.

El Dashboard quedó separado en dos servicios (`DashboardSummaryService` para la vista agregada, `DashboardStudentService` para la vista por alumno) en vez de uno solo, siguiendo la instrucción explícita de PROMPT 12 de no construir "un único servicio gigantesco".

### Definiciones (fórmulas exactas, ninguna es una estimación)

- **Entrenamientos registrados** = `countRegisteredWorkouts(where)`: cuenta cualquier `WorkoutLog` existente para el `where` dado, incluyendo uno todavía en curso (`completionStatus: PARTIAL` provisional, `durationMinutes: null` — ver la decisión de diseño de PROMPT 10).
- **Entrenamientos finalizados** = `computeWorkoutSummaryMetrics(where).totalWorkouts`: subconjunto de los anteriores que pasó por `finish()` al menos una vez (`durationMinutes !== null`, misma señal ya establecida en PROMPT 10/11 sin cambios).
- **Duración/RPE/fatiga promedio** y **frecuencia de entrenamiento por semana**: idénticas a PROMPT 11 (`Prisma.aggregate` sobre los finalizados; frecuencia = entrenamientos finalizados ÷ semanas reales entre el primero y el último, `null` con menos de 2 para no dividir por un rango casi nulo).
- **Distribución de cumplimiento** = `computeCompletionStatusBreakdown(where)`: conteo de `completionStatus` entre los entrenamientos finalizados — un valor que el propio alumno ya registró al finalizar, nunca una comparación contra algo prescrito.
- **Asignaciones activas** = `prisma.programAssignment.count({ where: { status: 'ACTIVE', student: { coachId } } })` — `ProgramAssignment` no tiene columna `coachId` propia (ver `docs/database.md`), así que se llega al coach a través del alumno asignado, mismo camino ya usado por `ProgramAssignmentsService` para verificar propiedad (PROMPT 09), acá usado solo para contar.

**Por qué NO existe un porcentaje de "adherencia"**: PROMPT 12 prohíbe explícitamente inventar esa definición. Calcularla exigiría comparar "entrenamientos realizados" contra "entrenamientos que se esperaban", y el esquema actual no modela eso de forma confiable — una `Session` pertenece a una `Week` de un `Program`, pero un `ProgramAssignment` no tiene fecha de fin planificada por semana ni una cantidad de sesiones esperadas por período, así que cualquier fórmula de adherencia construida hoy sería una suposición del equipo, no un dato real. La distribución de cumplimiento (arriba) es la única lectura de "cumplimiento" que este prompt implementa, porque cuenta exclusivamente datos que el alumno ya registró.

### Datos insuficientes — qué muestra el frontend cuando no hay suficiente base

Ningún endpoint devuelve `403`/error cuando un coach no tiene alumnos, asignaciones o entrenamientos: los conteos son `0` y los promedios/frecuencia son `null` (igual que en PROMPT 11), nunca un valor inventado ni una división por cero disfrazada. El frontend (`DashboardPage`/`StudentDashboardPage`) muestra un mensaje explícito en vez de las tarjetas de métricas cuando `totalStudents === 0` (coach sin alumnos), `workoutsRegistered === 0` (alumno sin entrenamientos) o `workoutsFinished === 0` (sin base para la distribución de cumplimiento) — nunca se renderiza un `0%`/promedio sin la base que lo sostiene.

### Seguridad y performance

Ninguna consulta trae `WorkoutLog`/`SetLog` completos a memoria para calcular algo en Node más allá de lo ya justificado en PROMPT 11 (`computeExerciseEvolution`, agrupación por entrenamiento). El resumen agregado (`getSummary`) resuelve sus 6 conteos/agregaciones con `Promise.all` (sin cascada secuencial) y `recent-activity` siempre pagina (nunca "traer todo"). No se agregó ningún índice nuevo: `WorkoutLog(student_id, performed_at)` (definido desde PROMPT 02, ver `docs/database.md` sección 7) ya cubre las consultas por alumno, y el `where: { student: { coachId } }` a nivel de coach resuelve el join usando el índice ya existente `User(coachId)` — exactamente el escenario que `docs/database.md` anticipó al comentar ese índice como "consultas de historial y dashboard".

### Alcance explícitamente fuera de PROMPT 12

No se modificó ningún endpoint/lógica de `start()`/`addSetLogs()`/`finish()` (PROMPT 10) ni de `listHistory()`/`getEvolution()` (PROMPT 11) — se reutilizaron sin cambios. No se implementó: comparación planificado-vs-real a nivel de sesión (más allá de la distribución de cumplimiento), gráficos con librerías de visualización (los "stat cards"/tablas siguen el mismo criterio visual simple que PROMPT 11), exportación a Excel/PDF, mensajería, notificaciones, PWA avanzada/service worker, Machine Learning/predicciones, ranking o comparación entre alumnos, pagos ni wearables — todos quedan para prompts futuros según `docs/roadmap.md`.
