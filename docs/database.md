# Base de datos

Fuente ejecutable: `backend/prisma/schema.prisma` y `backend/prisma/migrations/`. PostgreSQL es obligatorio. Prisma 5.22.0 es la versión resuelta en el lockfile; no usar `db push` o `migrate reset` para actualizar bases existentes.

## Entidades

| Dominio | Modelos y relaciones |
| --- | --- |
| Identidad | User con COACH/STUDENT, relación 1:N Coach–Alumnos; UserProfile |
| Sesiones de acceso | RefreshSession, StudentInvitation, PasswordResetToken; hashes y fechas de expiración/consumo |
| Prescripción | Exercise; Program → Block → Week → Session → SessionExercise |
| Asignación | ProgramAssignment: programa, alumno, ACTIVE/FINISHED, startDate nullable |
| Ejecución | WorkoutLog → SetLog; referencias a Session y SessionExercise |
| Historia prescrita | WorkoutLog → WorkoutPrescription, snapshot por ejercicio |
| Importación | ExcelImportBatch/ExcelImportRow: revisión, errores y trazabilidad a prescripción normalizada |
| Comunicación | Message, MessageAttachment, Notification |
| Seguimiento | Competition y AuditLog |

Las bajas de programas, ejercicios y usuarios son lógicas. No hay endpoint de borrado físico para la jerarquía. Las FK Restrict protegen sesiones/ejercicios con ejecución y ahora también prescripciones congeladas. No debe eliminarse historia mediante SQL administrativo sin una decisión expresa.

## Integridad histórica

La migración aditiva `20261009000000_workout_prescription_snapshot` agrega `workout_logs.prescription_captured_at` nullable y la tabla `workout_prescriptions`. No hace backfill, reset ni elimina filas.

Al iniciar un WorkoutLog se leen todos sus SessionExercise con Exercise y se insertan, atómicamente con el workout, columnas de identidad/nombre del ejercicio, orden, targetSets, targetRepsMin/Max, targetRpe, targetRir, restSeconds y notes. La captura usa RepeatableRead para una vista consistente. No existe targetLoad en el modelo actual: actualLoad pertenece a SetLog y no se convierte en prescripción.

Cada snapshot tiene un único par `(workoutLogId, sessionExerciseId)`. La FK al workout usa Cascade y la FK a SessionExercise usa Restrict. `exerciseId`/`exerciseName` son valores capturados y no dependen del nombre actual. No existe API para editar snapshots; las correcciones de ejecución no los actualizan.

`prescriptionCapturedAt` distingue una captura vacía válida de un workout antiguo. Los nuevos workouts solo admiten series para ejercicios presentes en su captura. Los registros antiguos conservan NULL y muestran `prescriptionSource: legacy-current`: se usa la prescripción vigente, sin afirmar que fuera la original. El seed solo captura los workouts ficticios que crea; no modifica los existentes.

El mapper de SetLog resuelve snapshot primero y devuelve `prescriptionSource`; el detalle del workout devuelve también `prescriptions` para consultar ejercicios sin ejecución. Los nombres de programa/bloque/semana/sesión y otros atributos del catálogo (video, estado, grupo muscular) no son snapshots.

## Convenciones vigentes

- Reps fijas: min=max; rangos: min≤max. RPE y RIR son opcionales e independientes; Decimals se serializan a número.
- Workout en curso: durationMinutes NULL y estado provisional PARTIAL. Finalizado: durationMinutes no NULL. El estado COMPLETED/PARTIAL/SKIPPED es autorreportado.
- Correcciones: ventana de 24 horas desde createdAt del workout. Después de finalizar no se agregan nuevas series.
- Unicidad de SetLog: workout, ejercicio de sesión y número de serie. Unicidad de posiciones por padre e índice parcial de asignación ACTIVE definidos en migraciones.
- startDate y dayOfWeek sustentan calendario; sin startDate no se inventan fechas. Esto no define por sí solo adherencia.
- Multimedia binaria vive fuera de PostgreSQL; MessageAttachment conserva metadata y una clave privada de storage.

## Migraciones

```sh
npm run prisma:generate --prefix backend
npm run prisma:migrate:deploy --prefix backend
npm run prisma:migrate:status --prefix backend
```

Hacer backup antes de migrar una base valiosa. Para cambios futuros de schema, crear una migración revisable con `prisma migrate dev` en desarrollo y aplicar `migrate deploy` en CI/otros entornos. Conservar migraciones previas sin reescribirlas. [Backup y restauración](backup-local.md).

## P1 — SessionScheduleOverride

Migración aditiva 20261009010000_session_schedule_overrides, posterior a las siete de P0. Modelo: id, programAssignmentId, sessionId, originalDate (DATE), scheduledDate (DATE), reason opcional, createdByUserId, createdAt y updatedAt. Unique (programAssignmentId, sessionId); índices de FK sessionId/createdByUserId. originalDate conserva la fecha anterior al primer cambio; reset elimina el override. Se agregó SESSION_RESCHEDULED a NotificationType. Sin backfill, borrado de históricos ni cambios en WorkoutPrescription.

La validez de Session dentro del Program de la asignación se verifica en backend. Program y alumno deben pertenecer al Coach autenticado. Un lock de la fila del alumno coordina reprogramación, cambio de startDate e inicio de WorkoutLog. Duplicaciones de prescripción son transaccionales y serializadas por Coach; desplazan hermanos en orden descendente respetando las restricciones únicas.

## P1 cerrado / P2 — ciclo de ejecución

Migración aditiva 20261009020000_workout_assignment_occurrence: WorkoutLog.programAssignmentId nullable, FK a ProgramAssignment con ON DELETE SET NULL e índice (programAssignmentId, sessionId). Nueve migraciones en total. No existe una unicidad alumno/sesión que impida ejecutar otra vez la plantilla.

El backend resuelve la asignación ACTIVE del alumno autenticado y valida la pertenencia de Session al Program al iniciar; no acepta una asignación arbitraria del cliente. Se conserva el snapshot independiente WorkoutPrescription. Calendar y el listado de ejecución de la sesión actual usan el ciclo correspondiente. Adherencia solo cuenta logs finalizados con ese programAssignmentId; otro ciclo no suma. Los logs legacy NULL siguen en History, sin backfill ni atribución automática. Si hay ejecución legacy finalizada ambigua en una sesión vencida sin finalización inequívoca actual, adherencia queda null con insufficientReason=legacy-history.

Reprogramación y cambio de startDate bloquean ejecución del ciclo actual y conservadoramente registros legacy ambiguos, pero no ejecuciones de ciclos anteriores inequívocos.

Índices revisados: Competition(studentId,status,eventDate), Notification(userId,readAt,createdAt), Message(senderId,receiverId,createdAt), MessageAttachment(storageKey unique, messageId), ProgramAssignment(studentId/programId y unique parcial ACTIVE), SessionScheduleOverride(assignment/session unique y FK) y WorkoutLog(studentId,performedAt; sessionId; assignment/session). Se conservaron los existentes y solo se añadió el índice ligado al nuevo ciclo; sin optimización general.
