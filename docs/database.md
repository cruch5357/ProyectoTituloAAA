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
