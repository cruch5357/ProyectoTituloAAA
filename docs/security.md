# Seguridad

> Documento de planificación técnica — PROMPT 00. Define cómo deberán implementarse los controles de seguridad en etapas posteriores. Nada de esto se implementa todavía. El backend es siempre la barrera de seguridad autoritativa; el frontend nunca es la única validación.

## 1. Autenticación
JWT de dos tokens: **access token** de vida corta (propuesto 15 min) enviado en el header `Authorization`, y **refresh token** de vida más larga (propuesto 7 días) almacenado en una cookie `httpOnly`, `Secure`, `SameSite=Strict`. El refresh token se puede revocar (logout, cambio de contraseña) mediante una lista de invalidación o versión de token en la tabla `User`.

## 2. Autorización basada en roles
Guard de rol a nivel de endpoint (`COACH` vs `STUDENT`) implementado con decoradores/guards del framework backend, evaluado en el servidor antes de ejecutar cualquier lógica de negocio.

## 3. Autorización sobre recursos/objetos
Guard adicional de propiedad: el `coach_id`/`student_id` del recurso solicitado se compara siempre contra el id del usuario autenticado (extraído del token, nunca del payload del cliente). Aplica a alumnos, programas, ejercicios, sesiones y registros.

## 4. Protección alumno-alumno
Todo endpoint que retorna datos de un alumno filtra explícitamente por `student_id = req.user.id` (o, si lo consulta el coach, por pertenencia al `coach_id`). Se documenta como caso de prueba obligatorio: alumno A no puede leer ni escribir registros de alumno B, incluso conociendo su id.

## 5. Protección coach-coach
Análogamente, un coach no puede acceder a alumnos, programas o ejercicios de otro coach, incluso conociendo su id.

## 6. Validación de entrada
Toda entrada llega a través de DTOs validados en el backend (tipos, rangos, longitud, formato), independientemente de cualquier validación ya realizada en el frontend. Entradas no reconocidas se descartan (whitelist), no se ignoran silenciosamente ni se persisten.

## 7. SQL Injection
Uso exclusivo del ORM con consultas parametrizadas; cualquier consulta SQL cruda (si llegara a ser necesaria) debe usar parámetros bindados, nunca concatenación de strings.

## 8. XSS
El framework de frontend escapa por defecto el contenido renderizado. Cualquier campo que permita texto libre (comentarios, mensajes) se trata como texto plano, no como HTML. Se añade un header `Content-Security-Policy` restrictivo en el backend.

## 9. CSRF
Como el access token viaja en el header `Authorization` (no en una cookie), la mayoría de los endpoints no son susceptibles a CSRF clásico. El único endpoint que usa una cookie (`/auth/refresh`) se protege con un patrón de doble envío de token (double-submit cookie) o un header custom validado en el servidor.

## 10. CORS
Lista blanca explícita de orígenes permitidos (dominio del frontend en cada ambiente); `credentials: true` solo para el origen exacto del frontend, nunca con wildcard `*`.

## 11. Rate limiting
Throttling agresivo en endpoints de autenticación (ej. 5 intentos/minuto/IP) y throttling general más permisivo en el resto de la API, por usuario autenticado y por IP.

## 12. Manejo seguro de sesiones/tokens
Rotación del refresh token en cada uso (refresh token rotation) para detectar reutilización de tokens robados; invalidación inmediata de todos los tokens de un usuario en cambio de contraseña.

## 13. Contraseñas
Hashing con `bcrypt` (costo ≥ 12) o `argon2id`; nunca se almacena ni se loguea la contraseña en texto plano.

## 14. Variables de entorno y secretos
Archivos `.env` excluidos del control de versiones (`.gitignore`); secretos distintos por ambiente (desarrollo/demo); ningún secreto se hardcodea en el código fuente.

## 15. Headers de seguridad
Middleware tipo Helmet: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`, deshabilitación de headers que exponen tecnología (`X-Powered-By`).

## 16. Manejo seguro de errores
Respuestas de error genéricas hacia el cliente (sin stack traces, nombres de tabla o consultas); el detalle completo se registra únicamente en logs del servidor.

## 17. Logging sin exponer información sensible
Nunca se loguean contraseñas, tokens completos ni datos de tarjetas/pagos (no aplica en este proyecto). Los logs de error incluyen contexto técnico (endpoint, id de request) sin datos personales sensibles.

## 18. Auditoría de acciones críticas
Tabla `AuditLog` (ver `database.md`) que registra creación/edición/eliminación de programas, cambios sobre datos de otro usuario e intentos de login fallidos, sin almacenar datos sensibles en el campo de metadata.

## 19. Principio de mínimo privilegio
El usuario de base de datos que usa el backend principal tiene solo los permisos que necesita (sin `DROP`/`ALTER` en producción). El futuro servicio de ciencia de datos, si existe, usa un rol de base de datos **de solo lectura** y acotado a las tablas que realmente necesita.

## 20. Seguridad de PostgreSQL
Conexión con SSL/TLS habilitado; usuario de aplicación sin privilegios de superusuario; contraseñas de base de datos gestionadas como secretos, no en el código.

## 21. Migraciones
Toda migración se revisa en pull request antes de aplicarse; ninguna migración destructiva se ejecuta en el ambiente de demo/producción sin un backup previo confirmado.

## 22. Backups
`pg_dump` periódico documentado como práctica obligatoria; al menos una prueba de restauración antes de la entrega final del proyecto.

## 23. Seguridad del proceso de importación de Excel
El archivo se valida por extensión **y** por contenido real (magic bytes), se rechaza cualquier formato con macros (`.xlsm`), se limita el tamaño máximo (propuesto 5 MB) y el número máximo de filas procesadas por importación, y el parseo se realiza con una librería mantenida y actualizada, nunca ejecutando contenido del archivo.

## 24. Validación de archivos y tamaño máximo
Límite de tamaño aplicado tanto en el cliente (UX) como, de forma autoritativa, en el backend antes de procesar el archivo.

## 25. Protección ante archivos maliciosos o inesperados
El parseo de Excel corre de forma aislada de la lógica crítica del proceso principal (por ejemplo, en un *worker*/proceso hijo con límites de tiempo y memoria), de modo que un archivo malformado o diseñado para agotar recursos no pueda afectar la disponibilidad del resto del sistema.

## 26. Dependencias vulnerables
Auditoría periódica de dependencias (`npm audit` o equivalente) y actualización de librerías con vulnerabilidades conocidas antes de cada entrega relevante del proyecto.

## 27. Pruebas de seguridad
Casos de prueba específicos para autorización cruzada (alumno-alumno, coach-coach), validación de entrada en los formularios críticos, y revisión manual orientada a los riesgos más relevantes del OWASP Top 10 para el alcance de esta aplicación (ver `testing.md`).

---

## Estado de implementación (PROMPT 03)

Las secciones 1 a 27 de este documento son la planificación técnica original (PROMPT 00). Esta sección describe lo que **realmente se implementó** en PROMPT 03 (autenticación + primera capa de autorización) y prevalece ante cualquier diferencia de detalle con las secciones anteriores.

### Autenticación (punto 1)

- **Access token:** JWT firmado (HS256, `@nestjs/jwt`), vida corta configurable (`JWT_ACCESS_EXPIRES_IN`, por defecto `15m`), enviado en el header `Authorization: Bearer`. Claims mínimos: `sub` (id de usuario), `role`, `tokenVersion`, `iat`, `exp` — nunca password ni datos innecesarios. Se verifica solo por firma/expiración (sin consulta a la base de datos en cada request); ver `src/auth/tokens/token.service.ts`.
- **Refresh token:** **decisión revisada respecto a lo planificado en PROMPT 00/02.** En vez de un JWT de refresh, se implementó como un valor aleatorio opaco de 256 bits (`crypto.randomBytes(32)`), del que solo se almacena su hash SHA-256 en la nueva tabla `refresh_sessions` (nunca el valor en texto plano). Motivo: la validez real de un refresh token siempre depende de una fila en la base de datos para poder revocar/rotar/detectar reuso (ver más abajo); un JWT de refresh agregaría una segunda fuente de verdad sin aportar nada. El token viaja únicamente en una cookie `httpOnly`, `Secure` (en producción), `SameSite=Strict`, con `Path` restringido a `/api/v1/auth`.
- **`User.tokenVersion`:** se mantiene en el modelo (ver `docs/database.md`), pero **no es el mecanismo principal de invalidación de refresh tokens** como se planteó originalmente — se reemplazó por revocación por sesión individual en `refresh_sessions` (ver abajo), que permite invalidar una sesión puntual sin cerrar todas las demás. `tokenVersion` queda disponible como claim del access token para un futuro mecanismo de invalidación global gruesa (ej. "cerrar sesión en todos los dispositivos"), no implementado todavía.

### Autorización basada en roles (punto 2)

`JwtAuthGuard` (autenticación) + `RolesGuard` + `@Roles(Role.COACH | Role.STUDENT)` (`src/auth/guards/`, `src/auth/decorators/roles.decorator.ts`). Se usan siempre en ese orden (`@UseGuards(JwtAuthGuard, RolesGuard)`). Un endpoint sin `@Roles(...)` solo exige autenticación.

### Autorización sobre recursos/objetos (puntos 3, 4, 5)

**Preparada, no implementada sobre recursos concretos todavía** (PROMPT 03 no agrega endpoints de negocio). Se dejó la abstracción reutilizable `assertOwnsResource()` en `src/auth/authorization/resource-ownership.ts`, documentada con los casos de prueba obligatorios (alumno-alumno, coach-coach) que los prompts futuros deben implementar junto con cada recurso real, con pruebas unitarias ya cubriendo la función genérica (`resource-ownership.spec.ts`).

### CSRF (punto 9)

Patrón de doble envío de token, extendido deliberadamente a **dos** endpoints (no solo `/auth/refresh` como decía el punto 9 original): `/auth/refresh` y `/auth/logout`, porque ambos actúan sobre la cookie de refresh. Mecanismo: al hacer login/refresh exitoso se setea, además de la cookie de refresh, una cookie NO `httpOnly` (`csrf_token`) con un valor aleatorio independiente; el frontend debe repetir su valor en el header `X-CSRF-Token`. `CsrfGuard` (`src/auth/guards/csrf.guard.ts`) compara ambos valores con `crypto.timingSafeEqual`. No se removió por tener `SameSite=Strict` (instrucción explícita de PROMPT 03): es defensa en profundidad adicional.

### Rate limiting (punto 11)

Throttler nombrado `"auth"` (`@nestjs/throttler`, named throttlers) aplicado a `register`, `students/invite`, `activate` y `login`, configurable vía `AUTH_THROTTLE_TTL_MS`/`AUTH_THROTTLE_LIMIT` (`.env`), independiente del throttler `"default"` general. Ver `src/app.module.ts`.

### Manejo de sesiones/tokens (punto 12)

Nueva tabla `refresh_sessions` (ver `docs/database.md`, sección "Estado de implementación (PROMPT 03)"): cada login/refresh crea una fila con `tokenHash`, `expiresAt`, `revokedAt`. Rotación: cada `POST /auth/refresh` válido marca la sesión usada como `revokedAt = now()` y crea una nueva. **Detección de reuso:** si se presenta un token cuya sesión ya tiene `revokedAt` distinto de `null`, se asume compromiso y se revocan **todas** las sesiones activas del usuario (defensivo), y se registra `auth.refresh_reuse_detected` en `AuditLog`. Ver `AuthService.refresh()`.

### Contraseñas (punto 13)

**Argon2id** (paquete `argon2`, bindings nativos), no bcrypt. Justificación: es la opción preferida explícitamente por este mismo documento, resiste mejor ataques por GPU/ASIC que bcrypt, y se verificó que la librería funciona en el entorno de desarrollo sin depender de binarios descargados en la instalación (a diferencia de los motores de Prisma — ver limitación de entorno más abajo). Funciones separadas `hashPassword`/`verifyPassword` en `src/auth/password/password.service.ts`; ningún llamador conoce el algoritmo ni sus parámetros.

### Manejo seguro de errores / no enumeración (puntos 16, 17)

- `login()` devuelve exactamente el mismo mensaje genérico (`"Credenciales inválidas"`) para: usuario inexistente, usuario inactivo y contraseña incorrecta — verificado con una prueba unitaria explícita que compara los tres mensajes. Además, siempre ejecuta un `argon2.verify()` (contra un hash de relleno si el usuario no existe) para mitigar enumeración de usuarios por temporización.
- `activate()` devuelve el mismo mensaje genérico para token inexistente, expirado o ya usado.
- Ningún log ni metadata de `AuditLog` incluye contraseñas, tokens completos ni el contenido de las cookies — verificado explícitamente en pruebas unitarias.

### Auditoría (punto 18)

Nuevo `AuditService` (`src/audit/`), global, usado por `AuthService` para registrar: registro de coach, invitación de alumno, activación, login exitoso/fallido, logout, rotación de refresh y reuso de refresh detectado. Un fallo al escribir el audit log nunca interrumpe el flujo principal (se captura y se loguea aparte).

### Documentación (Swagger/OpenAPI)

`@nestjs/swagger` configurado en `src/main.ts`, expuesto en `/api/v1/docs`. Documenta únicamente los endpoints de `/auth/*` y `/users/me` que existen hoy.

### Frontend

No se construyó ninguna UI de login en PROMPT 03 (instrucción explícita: la lógica de auth es responsabilidad del backend). No se modificó `frontend/`.

### Limitación de entorno persistente (Prisma)

`prisma generate`/`migrate` siguen sin poder ejecutarse en el entorno de preparación por el bloqueo de red hacia `binaries.prisma.sh` ya reportado en PROMPT 01/02. En PROMPT 03 se evaluó explícitamente actualizar a `prisma@8` (rc) como posible salida: se descartó porque esa versión reestructura la CLI en torno a "Prisma Platform" (comandos `deploy`/`project`/`postgres`/etc.) y **ya no tiene un comando `generate` clásico equivalente**, por lo que no es compatible con el flujo de PostgreSQL autoalojado de este proyecto. El detalle de cómo se verificó el código igualmente (shim local de tipos, no versionado) está en el informe de cierre de PROMPT 03.

---

## Estado de implementación (PROMPT 04)

Esta sección documenta la **primera autorización real sobre un recurso de negocio** (`Student`, en `backend/src/students/`), y prevalece sobre la sección 3 del documento en caso de diferencia de detalle.

### Autorización sobre recursos/objetos (puntos 3, 4, 5) — primer caso real

Los cuatro endpoints de `StudentsController` (`GET /students`, `GET /students/:id`, `PATCH /students/:id/status`, `POST /students/invite`) aplican las dos capas de autorización descritas en `docs/api.md`, sección 3:

1. **Guard de rol:** `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.COACH)` a nivel de clase — un alumno (`STUDENT`) autenticado recibe `403` en cualquiera de los cuatro endpoints.
2. **Guard de propiedad de recurso:** resuelto en `StudentsService`, nunca en un guard genérico, porque requiere cargar el alumno desde la base de datos antes de poder comparar su `coachId` — un guard no tiene forma de hacer esto sin acoplarse al servicio de negocio. El `coachId` contra el que se compara sale siempre de `CurrentUser()` (JWT ya verificado), nunca de un parámetro de ruta, query o body.

**Desviación documentada respecto a `assertOwnsResource()`:** `resource-ownership.ts` (preparado en PROMPT 03) lanza `ForbiddenException` (403) cuando el recurso no pertenece al usuario. Para `Student` específicamente, `StudentsService` **no usa esa función**: implementa su propio chequeo (`ensureOwnedStudent()`) que lanza `NotFoundException` (404) tanto si el alumno no existe como si existe pero pertenece a otro coach, sin distinguir los dos casos con el mismo mensaje genérico. Motivo (ya establecido en `docs/api.md`, sección 5): un `403` en este caso confirmaría al coach que consulta que *existe* un alumno con ese id (perteneciente a otro coach), lo cual ya es una fuga de información que un id es válido y está en uso. `assertOwnsResource()` sigue disponible sin cambios para recursos futuros donde esa fuga no aplique.

### Prevención de IDOR/BOLA (punto 21)

- El `:id` de ruta se valida contra el formato de cuid (`StudentIdParamDto`, `/^c[a-z0-9]{24}$/`) **antes** de tocar la base de datos: un id con forma inválida responde `400`, nunca dispara una consulta con un valor arbitrario del cliente.
- `GET /students` nunca acepta un `coachId` de query como mecanismo de autorización: `ListStudentsQueryDto` no declara ese campo, así que la configuración global de ValidationPipe (`whitelist`/`forbidNonWhitelisted`) lo rechaza con `400` automáticamente si el cliente lo envía.
- El filtro `coachId` se aplica siempre en la cláusula `where` de la consulta Prisma (`role: STUDENT, coachId`), nunca cargando todos los alumnos y filtrando en memoria.

### Prevención de mass assignment (puntos 7, 8, 21)

`PATCH /students/:id/status` usa `UpdateStudentStatusDto`, que declara **únicamente** `isActive: boolean`. `StudentsService.updateStatus()` además construye su propio objeto `data` explícito para Prisma (`{ isActive: dto.isActive }`), nunca reenvía el DTO completo ni el body crudo — así que aunque `whitelist`/`forbidNonWhitelisted` fallaran por algún motivo, el servicio seguiría sin poder escribir `role`, `coachId`, `email` ni `passwordHash` por este endpoint. Verificado con una prueba unitaria explícita (`students.service.spec.ts`) que inspecciona las claves del objeto `data` enviado a `prisma.user.update()`.

### Exposición de información (punto 21)

Las respuestas de los cuatro endpoints reutilizan `toPublicUser()` (`src/common/mappers/public-user.mapper.ts`, ya usado desde PROMPT 03 en login/register/activate/me): nunca se creó una forma de respuesta nueva ni distinta para "alumno" que pudiera, por descuido, exponer `passwordHash` o `tokenVersion`.

### Auditoría (punto 18)

Nueva acción `students.status_changed` en `AUDIT_ACTIONS` (`auth.constants.ts`), registrada por `StudentsService.updateStatus()` con metadata `{ isActive }` únicamente (nunca el estado anterior completo del usuario ni ningún campo sensible). La invitación (`students.invite`, acción `auth.student_invited` sin cambios) se reubicó junto con el resto de `StudentsService.invite()`, sin alterar qué se audita.

### Rate limiting (punto 11)

`POST /students/invite` mantiene el throttler nombrado `"auth"`, igual que cuando vivía bajo `/auth`. Los endpoints de solo lectura/gestión (`GET /students`, `GET /students/:id`, `PATCH /students/:id/status`) usan el throttler `"default"` general: no son endpoints de autenticación ni de alto riesgo de fuerza bruta (requieren ya estar autenticado como Coach).

### Base de datos (sin cambios de esquema)

No se modificó `prisma/schema.prisma` ni se agregó ninguna migración para PROMPT 04. El estado "activo/inactivo" de un alumno ya existía como `User.isActive` (agregado en PROMPT 02, ver `docs/database.md`): `PATCH /students/:id/status` simplemente expone, de forma controlada y auditada, una operación de escritura sobre una columna que ya estaba modelada. Antes de escribir cualquier código se verificó explícitamente que el modelo actual ya soportaba esta funcionalidad (`requirements.md` RF-06/RF-07 no piden ningún campo adicional para el MVP de este prompt).

### Frontend

Ver `docs/api.md` para el contrato de los endpoints. La UI "Mis alumnos" (React Router + TanStack Query) consume estos cuatro endpoints; la protección de rutas en el frontend (ocultar el link de navegación, redirigir si no hay sesión) es exclusivamente una mejora de UX — la única barrera de seguridad real son los guards del backend documentados arriba, verificable llamando a la API directamente sin pasar por la UI.

---

## Estado de implementación (PROMPT 06)

Este prompt pedía implementar autenticación segura completa (registro, login, refresh, logout, roles, CSRF, rate limiting). La inspección previa a cualquier cambio (obligatoria según las reglas del prompt) confirmó que **todo el alcance de backend ya estaba implementado correctamente desde PROMPT 03**, con cobertura de pruebas que ya satisface el punto 16 del prompt en su totalidad. Por eso esta sección documenta principalmente una **verificación**, no una reimplementación, más el único gap real encontrado (frontend).

### Verificación de lo ya implementado (sin duplicar nada)

Se releyeron íntegramente, antes de tocar cualquier archivo:

- `token.service.spec.ts`: cubre firma/verificación válida con el set exacto de claims, rechazo de firma alterada, **rechazo de token expirado** (con `JWT_ACCESS_EXPIRES_IN: '1ms'`), rechazo de secreto incorrecto, hash SHA-256 de refresh tokens.
- `jwt-auth.guard.spec.ts`: sin header → 401, header no-Bearer → 401, token inválido/alterado → 401, **token expirado → 401**, usuario borrado → 401, usuario inactivo → 401, éxito con `request.user` verificado explícitamente sin `passwordHash`.
- `roles.guard.spec.ts`: passthrough sin `@Roles`, rechazo cruzado COACH/STUDENT en ambos sentidos, éxito con rol correcto, rechazo sin usuario en el request.
- `auth.service.spec.ts`: cobertura exhaustiva de `register` (3 pruebas), `login` (6, incluyendo paridad de mensaje genérico y que `argon2.verify` siempre se ejecuta), `refresh` (5, incluyendo rotación, detección de reuso que revoca todas las sesiones, y que el token viejo falla tras rotar), `logout` (2, incluyendo idempotencia), `activate` (2).

**Conclusión:** el diseño de refresh token opaco con hash-only en DB (no JWT), Argon2id, cookies `httpOnly`/`Secure`/`SameSite`, CSRF de doble envío, rate limiting nombrado `"auth"`, guards de rol y la separación autenticación/autorización ya cumplen exactamente lo que este prompt pedía preservar explícitamente ("si el proyecto ya tiene una implementación basada en token opaco... CONSÉRVALA y no la reemplaces por JWT"). No se modificó ningún archivo de `backend/src/auth/` ni sus pruebas: no había nada que corregir.

### Único gap real encontrado: UI de registro (frontend)

`docs/security.md` (sección PROMPT 03) ya dejaba constancia de que no se había construido ninguna UI de login en ese prompt; PROMPT 04 luego agregó login pero no registro. Al inspeccionar `frontend/src/pages/` y `frontend/src/routes/AppRouter.tsx` se confirmó que efectivamente no existía `RegisterPage` ni ruta `/register` — el único punto del alcance de PROMPT 06 (punto 14: "UI mínima funcional... registro de Coach") que faltaba.

Se agregó:

- `register()` / `RegisterPayload` en `frontend/src/api/auth.ts`, siguiendo el mismo patrón que `login`/`refreshSession`/`logout` (función simple, no hook de TanStack Query, ya que es una acción imperativa). Llama a `POST /auth/register` con `skipAuth: true`. **Importante:** a diferencia de login, el backend no retorna token ni setea cookie en el registro (`AuthController.register` solo crea la cuenta) — por eso el flujo de UI redirige a `/login` en vez de autenticar automáticamente.
- `frontend/src/pages/RegisterPage.tsx`: formulario (nombre, correo, contraseña, confirmación de contraseña — esta última es únicamente una ayuda de UX que el backend ni siquiera conoce). Redirige a `/login` con un mensaje de éxito tras registrarse. Misma estructura y clases CSS (`.login-page`, `.field`, `.field-error`) que `LoginPage.tsx`, reutilizadas sin cambios.
- Ruta `/register` en `AppRouter.tsx`.
- Links cruzados: "¿No tienes cuenta? Regístrate" en `LoginPage`, "¿Ya tienes cuenta? Inicia sesión" en `RegisterPage`, y un link "Registrarme" agregado junto a "Iniciar sesión" en la navegación anónima de `MainLayout.tsx`.

Como en PROMPT 04, la validación real (formato de contraseña, unicidad de email, longitud) la hace siempre el backend (`RegisterDto`); la UI no duplica esas reglas más allá de atributos HTML básicos (`minLength`/`maxLength`/`type="email"`) que son solo una ayuda de UX.

### Documentación (punto 18)

No se encontró ninguna divergencia entre `docs/security.md`/`docs/api.md` y el código de autenticación real — por lo tanto no se modificó el contrato documentado de ningún endpoint (`docs/api.md` no cambió). Esta sección es la única actualización de documentación necesaria para PROMPT 06.

### Pruebas, lint y build

- Backend: 78 pruebas unitarias (13 suites) y 14 pruebas e2e (3 suites) — el mismo número que antes de este prompt, sin cambios porque no se modificó código de backend. `nest build` y `eslint --fix` sin errores.
- Frontend: `tsc -b`, `oxlint` (0 advertencias/errores) y `npm run build` (`vite build`) sin errores, verificados en el directorio de trabajo temporal habitual (ver limitación de entorno abajo) antes de sincronizar los cambios al repositorio real.

### Limitación de entorno persistente (sin cambios)

Sigue vigente el bloqueo de red hacia `binaries.prisma.sh` (documentado desde PROMPT 01) y la imposibilidad de conectar al Postgres real del usuario desde este entorno de preparación (documentado en PROMPT 05, sección 10.2). Ninguna de las dos afecta el alcance de este prompt: no se tocó `schema.prisma` ni se requirió una conexión real a la base de datos para verificar nada de lo anterior.
