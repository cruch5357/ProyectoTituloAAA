# Modelo de Datos

> Documento de planificación técnica — PROMPT 00. Define el modelo conceptual inicial. No implica todavía la creación de la base de datos ni migraciones.

## 1. Principio rector: prescripción ≠ registro real

Todo el modelo se organiza alrededor de una separación estricta:

- **Rama de prescripción** (lo que el coach planifica): `Program → Block → Week → Session → SessionExercise`.
- **Rama de ejecución** (lo que el alumno realmente hizo): `WorkoutLog → SetLog`.

Ambas ramas se conectan por referencia (una `WorkoutLog` apunta a la `Session` que la originó; un `SetLog` apunta al `SessionExercise` prescrito), pero **nunca comparten tabla ni se sobrescriben entre sí**. Esto permite comparar planificado vs. real, que es la base de las métricas del dashboard y de una futura predicción.

## 2. Entidades principales

### Identidad y relación coach-alumno
- **User**: `id`, `email` (único), `password_hash`, `role` (`COACH` | `STUDENT`), `name`, `is_active`, `created_at`.
- **CoachStudent** *(o campo `coach_id` directo en la fila de alumno, dado que el MVP es 1 coach por alumno)*: relación entre un coach y sus alumnos. Se modela como campo `coach_id` en el perfil de alumno para simplicidad en el MVP, dejando documentado que una tabla puente `CoachStudent` sería el camino natural si se habilita multi-coach en el futuro.

### Catálogo del coach
- **Exercise**: `id`, `coach_id`, `name`, `muscle_group`, `instructions`, `video_url` (opcional).

### Prescripción (jerarquía de planificación)
- **Program**: `id`, `coach_id`, `name`, `description`, `duration_weeks`.
- **Block**: `id`, `program_id`, `name`, `order`.
- **Week**: `id`, `block_id`, `number`, `order`.
- **Session**: `id`, `week_id`, `name` (ej. "Sesión A"), `day_of_week`/`order`.
- **SessionExercise**: `id`, `session_id`, `exercise_id`, `order`, `target_sets`, `target_reps` (rango o valor), `target_rpe` (opcional), `target_rir` (opcional), `rest_seconds` (opcional), `notes`.
- **ProgramAssignment**: `id`, `program_id`, `student_id`, `assigned_at`, `status` (activo/finalizado) — permite asignar un programa a uno o varios alumnos sin duplicar la planificación.

### Ejecución (registro real del alumno)
- **WorkoutLog**: `id`, `session_id`, `student_id`, `performed_at`, `completion_status`, `overall_rpe`, `fatigue`, `comments`, `duration_minutes` (opcional).
- **SetLog**: `id`, `workout_log_id`, `session_exercise_id`, `set_number`, `actual_reps`, `actual_load`, `actual_rpe` (opcional), `actual_rir` (opcional), `comments`.

### Importación de Excel (trazabilidad, no una copia plana)
- **ExcelImportBatch**: `id`, `coach_id`, `original_filename`, `status` (`pending_review` | `confirmed` | `rejected`), `uploaded_at`, `confirmed_at`.
- **ExcelImportRow**: `id`, `batch_id`, `row_number`, `raw_data` (JSON de la fila original, solo para trazabilidad/depuración), `status` (`valid` | `invalid`), `errors` (lista de errores de validación), `program_id`/`session_exercise_id` resultante cuando se confirma.

Este diseño permite mostrar la vista previa y los errores por fila sin haber tocado aún las tablas normalizadas, y solo al confirmar se generan las filas reales en `Program/Block/Week/Session/SessionExercise`.

### Comunicación
- **Message**: `id`, `sender_id`, `receiver_id`, `body`, `session_id` (opcional, para contexto), `session_exercise_id` (opcional), `created_at`, `read_at`.

### Auditoría
- **AuditLog**: `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `metadata` (JSON, sin datos sensibles), `created_at`.

## 3. Relaciones principales

```
User (COACH) 1───N Exercise
User (COACH) 1───N Program
User (COACH) 1───N User (STUDENT)            [coach_id en STUDENT]

Program 1───N Block 1───N Week 1───N Session 1───N SessionExercise N───1 Exercise

Program 1───N ProgramAssignment N───1 User (STUDENT)

Session 1───N WorkoutLog N───1 User (STUDENT)
WorkoutLog 1───N SetLog N───1 SessionExercise

ExcelImportBatch 1───N ExcelImportRow
ExcelImportBatch N───1 User (COACH)

Message N───1 User (sender)
Message N───1 User (receiver)
```

## 4. Integridad y constraints

- `User.email` único; `role` restringido a un enum (`COACH`, `STUDENT`).
- Toda entidad de prescripción (`Program`, `Block`, `Week`, `Session`, `SessionExercise`) hereda el `coach_id` de forma indirecta a través de `Program`, y toda consulta debe filtrar por ese `coach_id` (ver `security.md`, autorización por recurso).
- `WorkoutLog.student_id` y `ProgramAssignment.student_id` deben corresponder a alumnos cuyo `coach_id` sea dueño del `Program`/`Session` referenciado — se valida en la capa de servicio, no solo con una FK.
- `actual_rpe`/`target_rpe` con `CHECK` entre 0 y 10; `actual_rir`/`target_rir` con `CHECK >= 0`.
- Borrado de `Program`/`Session` con `WorkoutLog` asociados: `RESTRICT` (no se permite eliminar prescripciones que ya tienen historial real; se pueden archivar/desactivar en su lugar). Borrado de entidades de prescripción sin registros asociados: `CASCADE` controlado dentro de su propia jerarquía.

## 5. Migraciones

- Prisma Migrate, migraciones versionadas y comprometidas al repositorio.
- Ambientes separados (desarrollo, staging si existe, producción/demo final) con sus propias bases de datos.
- Ninguna migración destructiva (`DROP COLUMN`, `DROP TABLE`) se aplica sin respaldo previo y revisión en pull request.

## 6. Backups

- `pg_dump` periódico documentado como práctica obligatoria antes de cualquier migración en el ambiente de demo/producción.
- Retención mínima de los últimos backups relevantes al ciclo de evaluación del proyecto (no se exige una política empresarial completa).
- Prueba de restauración al menos una vez antes de la entrega final, para validar que el backup es utilizable.

## 7. Índices recomendados

- `WorkoutLog(student_id, performed_at)` — consultas de historial y dashboard.
- `SessionExercise(session_id)` y `Session(week_id)` — navegación de la jerarquía de prescripción.
- `Program(coach_id)` y `Exercise(coach_id)` — scoping por coach en cada request.
- `Message(sender_id, receiver_id, created_at)` — hilos de conversación.

---

## 8. Estado de implementación (PROMPT 02)

Las secciones 1 a 7 de este documento describen el modelo **conceptual** (PROMPT 00). Esta sección describe el modelo **realmente implementado** en `backend/prisma/schema.prisma` y su migración inicial, y es la que prevalece ante cualquier diferencia menor de detalle con las secciones anteriores.

### 8.1 Decisiones de implementación

- **IDs como `String @default(cuid())`** en todas las entidades, en vez de enteros autoincrementales. Motivo: un ID secuencial adivinable (`/api/v1/programs/42`, `/43`, `/44`...) facilita intentos de acceso a recursos ajenos; usar `cuid()` es una capa adicional de defensa en profundidad junto a la autorización por recurso (`docs/security.md`, puntos 3 y 4), sin costo de complejidad relevante.
- **Nombres de columna en `snake_case`** vía `@map`/`@@map`, para que las tablas de PostgreSQL coincidan exactamente con los nombres usados en la sección conceptual de este documento (`password_hash`, `coach_id`, `muscle_group`, etc.), mientras el código TypeScript sigue usando `camelCase` (convención de Prisma/JS).
- **`User.tokenVersion`** (`token_version`, entero, default `0`): estructura mínima que el mecanismo de invalidación de refresh tokens descrito en `docs/security.md` (punto 12) necesita. No se usa todavía — se conecta en PROMPT 03 (autenticación). No se agregó una tabla `RefreshToken` separada porque, para el alcance del MVP, invalidar por versión alcanza y evita una entidad adicional no justificada.
- **`target_reps` como rango relacional**: `target_reps_min` y `target_reps_max` (ambos enteros opcionales). Un valor fijo se representa con `min = max`; un rango, con `min < max`. Se descartó JSON porque el rango se representa perfectamente con dos columnas normalizadas y consultables.
- **Valores de enums no detallados en la sección conceptual**, definidos como decisión mínima de implementación:
  - `WorkoutCompletionStatus`: `COMPLETED`, `PARTIAL`, `SKIPPED`.
  - `ProgramAssignmentStatus`: `ACTIVE`, `FINISHED` (tal como se describía como "activo/finalizado").
  - `ExcelImportStatus`: `PENDING_REVIEW`, `CONFIRMED`, `REJECTED`.
  - `ExcelImportRowStatus`: `VALID`, `INVALID`.
- **Restricciones que Prisma no expresa de forma portable en su DSL** se agregaron directamente en la migración SQL (no en `schema.prisma`), siguiendo el patrón recomendado por Prisma para estos casos:
  - Un **índice único parcial** en `program_assignments(program_id, student_id) WHERE status = 'ACTIVE'`, que impide una asignación activa duplicada sin bloquear una reasignación futura del mismo programa una vez finalizado.
  - **`CHECK` constraints** numéricos: RPE (`target_rpe`, `actual_rpe`, `overall_rpe`) entre 0 y 10; RIR (`target_rir`, `actual_rir`) ≥ 0; `target_sets` > 0; `target_reps_min`/`max` ≥ 0 y `max ≥ min`; `rest_seconds`, `duration_minutes`, `actual_reps`, `actual_load` ≥ 0; `set_number` y `row_number` > 0; `fatigue` entre 0 y 10 (valor no detallado en la sección conceptual, definido aquí como rango razonable); `duration_weeks` > 0.

### 8.2 Estrategia de borrado implementada

Se usó `CASCADE` dentro de la jerarquía de prescripción (`Program → Block → Week → Session → SessionExercise`), porque borrar un nodo de planificación sin historial real asociado es una operación segura y esperada.

Se usó `RESTRICT` exactamente en los dos puntos donde la rama de ejecución referencia a la rama de prescripción: `workout_logs.session_id → sessions.id` y `set_logs.session_exercise_id → session_exercises.id`. Esto tiene un efecto importante y deliberado: como el borrado en cascada es una única transacción, si se intenta borrar un `Program` (o cualquier nodo por encima) y en algún punto de la jerarquía existe una `Session` con `WorkoutLog` o una `SessionExercise` con `SetLog`, PostgreSQL rechaza el `DELETE` completo. En otras palabras, **es imposible borrar accidentalmente un `Program` que contenga historial real de entrenamiento en cualquier nivel de su jerarquía**, sin necesidad de lógica adicional en el backend. Esto se verificó explícitamente (ver sección 8.4).

`Exercise` también usa `RESTRICT` hacia `SessionExercise`: un ejercicio no puede eliminarse mientras esté prescrito en alguna sesión.

`AuditLog.actorId` usa `SET NULL` (no `RESTRICT`): el registro de auditoría debe sobrevivir aunque el usuario actor sea eliminado en el futuro, a diferencia del historial de entrenamiento.

### 8.3 Migración

La migración inicial vive en `backend/prisma/migrations/20260916150000_init_prescripcion_ejecucion/migration.sql`.

**Limitación del entorno (importante):** en el entorno donde se preparó esta migración, `binaries.prisma.sh` (de donde Prisma CLI descarga sus motores nativos `schema-engine` y `query-engine`) está bloqueado por la política de red del entorno (403 Forbidden) — la misma limitación ya reportada en el informe de PROMPT 01 para `prisma generate`. Esto impide ejecutar `npx prisma migrate dev`, `prisma validate` o `prisma generate` en ese entorno.

Por esta razón, la migración se escribió a mano siguiendo exactamente la estructura que `schema.prisma` describe y el formato de carpeta/archivo que usa Prisma Migrate (`prisma/migrations/<timestamp>_<nombre>/migration.sql` + `migration_lock.toml`), de modo que sea indistinguible de una migración generada por la herramienta y que el equipo pueda seguir usando `prisma migrate dev`/`deploy` normalmente desde aquí en adelante.

**Antes de dar por buena esta migración, el equipo debe, en un entorno con acceso normal a internet y PostgreSQL disponible:**
1. Ejecutar `npx prisma generate` (genera el cliente TypeScript).
2. Ejecutar `npx prisma migrate deploy` (o `migrate dev` en desarrollo) contra una base de datos vacía y confirmar que Prisma la reconoce sin pedir una migración adicional (sin *drift*).

### 8.4 Verificación realizada

Como Prisma CLI no pudo ejecutarse en el entorno de preparación, el SQL de la migración se verificó ejecutándolo contra una instancia real de PostgreSQL compilada a WebAssembly (`@electric-sql/pglite`, usada solo como herramienta de verificación puntual, no es una dependencia del proyecto). Se comprobó:

- La migración completa se aplica sin errores.
- La relación `coach → alumnos` (`users.coachId`) funciona correctamente.
- Los `CHECK` de `target_rpe` (rango 0–10) y del rango `target_reps_min/max` rechazan valores inválidos.
- El índice único parcial de `program_assignments` rechaza una segunda asignación `ACTIVE` duplicada, pero permite una asignación `FINISHED` adicional del mismo programa/alumno.
- El `CHECK` de `set_number > 0` rechaza `0`.
- **El caso central del modelo**: intentar borrar una `Session` con un `WorkoutLog` real asociado es rechazado por `RESTRICT`; intentar borrar el `Program` completo que contiene esa `Session` también es rechazado (la cascada se detiene en el punto protegido). Un `Program` sin historial real sí se borra en cascada correctamente.
- `users.email` único rechaza un correo duplicado.

### 8.5 Seed de desarrollo

Se agregó `backend/prisma/seed.ts`: crea un coach, un alumno, un ejercicio, un programa con un bloque/semana/sesión/ejercicio prescrito de ejemplo, y una asignación — todo con datos claramente ficticios y sin contraseñas ni hashes reales (placeholder explícito `DEV_SEED_NO_REAL_HASH`, ya que el hashing se implementa en PROMPT 03). No se sembraron `WorkoutLog`/`SetLog`: simular "ejecución real" del alumno no aporta valor de prueba en esta etapa y se presta a confundirse con datos reales. Por la misma limitación de entorno del punto 8.3, este seed no pudo ejecutarse en el entorno de preparación (requiere un cliente Prisma generado); el equipo debe correrlo localmente con `npm run prisma:seed` una vez configurado `DATABASE_URL`.

---

## 9. Estado de implementación (PROMPT 03)

Agrega dos tablas de soporte a autenticación (migración `backend/prisma/migrations/20260916190000_auth_refresh_sessions_invitations/migration.sql`), sobre el modelo ya implementado en la sección 8.

### 9.1 `refresh_sessions`

Una fila por sesión de refresh token emitida (login o rotación). Columnas: `id`, `user_id` (FK a `users`, `ON DELETE CASCADE` — una sesión no es historial real que deba preservarse), `token_hash` (único, SHA-256 del token opaco — nunca el valor en texto plano), `expires_at`, `revoked_at` (nulo mientras la sesión está vigente), `replaced_by_id` (**no es una foreign key real**, solo trazabilidad/depuración de qué sesión reemplazó a esta durante la rotación — deliberadamente sin FK auto-referenciada para no agregar complejidad de integridad referencial innecesaria, ya que la lógica de seguridad real depende únicamente de `revoked_at`/`expires_at`), `user_agent`, `ip_address`, `created_at`.

**Reemplaza, para el caso concreto del refresh token, el mecanismo de `User.tokenVersion`** planteado originalmente en PROMPT 00/02 (ver `docs/security.md`, sección de implementación de PROMPT 03, y `docs/architecture.md`, registro de decisiones): permite revocar/rotar una sesión puntual y detectar reuso, algo que un único contador de versión por usuario no puede expresar. `tokenVersion` se mantiene en `users` (no se eliminó ni se migró) como posible mecanismo futuro de invalidación global gruesa.

### 9.2 `student_invitations`

Una fila por invitación de alumno emitida por un coach. Columnas: `id`, `email` (del alumno invitado), `coach_id` (FK a `users`, `ON DELETE CASCADE`), `token_hash` (único, SHA-256 del token de activación), `expires_at`, `used_at` (nulo hasta que el alumno activa su cuenta; marca de uso único), `created_at`.

### 9.3 Por qué no hay un enum `InvitationStatus`/`RefreshSessionStatus`

Se evaluó agregar estos dos enums (como se hizo con `ProgramAssignmentStatus` en PROMPT 02) pero se descartó: el estado de ambas tablas se deriva completamente de columnas de fecha (`expiresAt`/`revokedAt`/`usedAt`), y un enum de estado adicional sería una segunda fuente de verdad que podría desincronizarse de esas fechas (ej. una fila con `status = ACTIVE` pero `expiresAt` ya vencido). La capa de aplicación (`AuthService`) centraliza el cálculo de estado a partir de las fechas, sin strings mágicos sueltos.

### 9.4 Verificación realizada

Misma limitación de entorno que en PROMPT 02 (`binaries.prisma.sh` bloqueado — ver sección 8.3 y el informe de cierre de PROMPT 03, que además descarta `prisma@8` como alternativa). La migración se verificó con el mismo método (`@electric-sql/pglite`): aplica sin errores sobre la migración de PROMPT 02, el índice único de `token_hash` rechaza duplicados en ambas tablas, la FK hacia `users` rechaza un `user_id`/`coach_id` inexistente, y borrar un `User` elimina en cascada sus `refresh_sessions`/`student_invitations` (verificado explícitamente).

---

## 10. Estado de implementación (PROMPT 05)

PROMPT 05 fue una etapa de **verificación y hardening de configuración**, no de modelado nuevo: el modelo relacional (sección 8) y sus dos migraciones (secciones 8 y 9) ya estaban completos e implementados desde PROMPT 02/03. Se confirmó explícitamente, antes de tocar nada, que no había ninguna funcionalidad de este alcance pendiente de crear desde cero.

### 10.1 Verificación del cliente Prisma real

A diferencia de los informes anteriores (que solo pudieron verificar el SQL con `@electric-sql/pglite` por el bloqueo de red del entorno de preparación), esta vez se pudo inspeccionar el cliente Prisma **real**, ya generado por el propio desarrollador en su máquina (`backend/node_modules/.prisma/client/`, generado el 16 de septiembre con Prisma `5.22.0`, dentro del rango `^5.20.0` declarado en `package.json`). Se verificó:

- El motor nativo (`query_engine-windows.dll.node`) está presente y corresponde al binario de Windows — coherente con que el equipo desarrolla en Windows.
- El `schema.prisma` embebido en el cliente generado es **idéntico en contenido** al `schema.prisma` fuente actual (la única diferencia es alineación de espacios, un efecto normal de cómo Prisma reformatea internamente el schema al generarlo) — es decir, el cliente generado **no está desactualizado** respecto al modelo de PROMPT 02/03, incluyendo `RefreshSession`/`StudentInvitation`.

Esto confirma que `prisma generate` ya se ejecutó correctamente en el entorno real de desarrollo (fuera de este sandbox) y que el backend puede usar Prisma Client con normalidad ahí.

### 10.2 Limitación de entorno persistente (reconfirmada, no nueva)

Se volvió a intentar `npx prisma generate` en un entorno aislado de verificación (una copia descartable, nunca sobre el cliente real ya funcionando, para no arriesgar corromperlo). Falla exactamente igual que en PROMPT 01/02/03:

```
Error: Failed to fetch sha256 checksum at https://binaries.prisma.sh/.../debian-openssl-3.0.x/libquery_engine.so.node.gz.sha256 - 403 Forbidden
```

Adicionalmente, se confirmó un segundo límite, no documentado explícitamente hasta ahora: el puente que permite ejecutar comandos en la máquina del desarrollador **no comparte red con `localhost` del host real** — un intento de conexión TCP directa a `localhost:<puerto de Postgres>` desde ese puente es rechazado (`Connection refused`), aunque Postgres sí esté corriendo en la máquina real. En conjunto, estos dos límites (binarios de Prisma bloqueados + red aislada del puente) significan que **ninguna prueba de conectividad real contra Postgres, ni ninguna prueba e2e con datos reales, puede ejecutarse directamente por el asistente** en este proyecto — deben correrse siempre en la máquina del equipo. Esto ya era cierto desde PROMPT 01, pero antes no estaba probado ni documentado con esta precisión.

### 10.3 Cambio realizado: `DATABASE_URL` ahora obligatoria

Único cambio de código de este prompt. `backend/src/config/env.validation.ts` marcaba `DATABASE_URL` como opcional, con la justificación (válida en PROMPT 01, cuando todavía no existía ningún modelo) de que `PrismaService` no se conecta de forma eager. Esa justificación ya no aplica: el modelo de datos está completo desde PROMPT 02, y toda la autenticación (PROMPT 03) y gestión de alumnos (PROMPT 04) son inútiles sin una base de datos real configurada. Se quitó `@IsOptional()` de ese campo — el backend ahora falla rápido al arrancar si falta `DATABASE_URL`, en vez de fallar más adelante con un error menos claro en la primera consulta real.

Esto **no** cambia la estrategia de conexión de `PrismaService` (sigue conectando de forma perezosa, sin `$connect()` eager) — se evaluó agregar conexión eager para fallar aún más rápido, pero se descartó: rompería las pruebas e2e existentes (`test/*.e2e-spec.ts`), que levantan `AppModule` completo sin una base de datos real disponible (ver `docs/testing.md`), y ese comportamiento ya está establecido y probado desde PROMPT 03. Se prefirió el cambio mínimo y no romper lo que ya funciona.

Como `DATABASE_URL` pasó a ser obligatoria, `test/jest.setup.ts` (que ya definía secretos JWT de prueba para que las pruebas e2e puedan levantar `AppModule` sin un `.env` real) ahora también define un valor de relleno para `DATABASE_URL`, con el mismo criterio: nunca se usa para conectarse de verdad (ninguna prueba e2e ejecuta una consulta real), solo necesita tener forma válida para pasar la validación de arranque.

### 10.4 Migraciones: sin cambios

No se creó ninguna migración nueva. Las dos migraciones existentes (secciones 8.3 y 9) siguen siendo la fuente de verdad, están completas, coinciden exactamente con `schema.prisma`, y no había ninguna razón técnica para tocarlas (el modelo no cambió).
