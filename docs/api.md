# API actual

Base: `/api/v1`. Swagger en `/api/v1/docs` en desarrollo; deshabilitado en producción. Los controladores y DTOs de `backend/src/` son la referencia exacta de payloads, límites y decoradores. Respuestas de negocio usan `{ data, error, meta }`; infraestructura puede responder directamente.

## Rutas por dominio

| Dominio | Rutas implementadas (relativas a la base) |
| --- | --- |
| Acceso público | POST `/auth/register` (solo Coach), `/auth/login`, `/auth/activate`, `/auth/forgot-password`, `/auth/reset-password` |
| Sesión autenticada | POST `/auth/refresh`, `/auth/logout`; GET `/users/me` |
| Alumnos Coach | GET `/students`, `/students/:id`; PATCH `/students/:id/status`; POST `/students/invite` |
| Catálogo Coach | GET/POST `/exercises`; GET/PATCH `/exercises/:id`; PATCH `/exercises/:id/status` |
| Programas Coach | GET/POST `/programs`; GET/PATCH `/programs/:id`; PATCH `/programs/:id/status` |
| Jerarquía Coach | GET/POST `/programs/:programId/blocks`, `/blocks/:blockId/weeks`, `/weeks/:weekId/sessions`, `/sessions/:sessionId/exercises`; GET/PATCH de recurso propio `/blocks/:id`, `/weeks/:id`, `/sessions/:id`, `/session-exercises/:id` |
| Asignaciones | POST `/programs/:programId/assign`; GET `/programs/:programId/assignments`, `/program-assignments/me`, `/program-assignments/:id`; PATCH `/program-assignments/:id/status`, `/program-assignments/:id/start-date` |
| Navegación Alumno | GET bajo `/student`: programas, bloques, semanas, sesiones y sus listados anidados según asignación |
| Ejecución Alumno | POST/GET `/sessions/:sessionId/workout-logs`; GET `/workout-logs`, `/workout-logs/evolution`, `/workout-logs/:id`; POST `/workout-logs/:id/set-logs`; PATCH `/workout-logs/:id/finish`, `/set-logs/:id` |
| Dashboard Coach | GET `/dashboard/summary`, `/dashboard/recent-activity`, `/dashboard/students/:studentId`, `/dashboard/operations` |
| Excel Coach | POST `/imports/excel`; GET `/imports/excel/:id`; POST `/imports/excel/:id/confirm`, `/imports/excel/:id/reject` |
| Calendario | GET `/calendar/me`, `/students/:id/calendar` |
| Competiciones | GET `/competitions/me`, `/students/:id/competitions`, `/competitions/:id`; POST `/competitions`; PATCH `/competitions/:id`, `/competitions/:id/coach-goal` |
| Perfil | GET/PATCH `/profile/me` |
| Mensajes | GET/POST `/messages/:peerId`; PATCH `/messages/:peerId/read`; GET `/messages/attachments/:id` |
| Notificaciones | GET `/notifications`, `/notifications/unread-count`; PATCH `/notifications/read-all`, `/notifications/:id/read` |
| Infraestructura | GET `/health` (solo liveness) |

No existen endpoints para duplicación de programas/semanas/sesiones, borrado físico de la planificación ni reprogramación de una ocurrencia individual.

## Contratos importantes

- Bearer JWT para recursos privados. Refresh/logout usan cookie opaca y doble envío CSRF mediante `X-CSRF-Token`. La identidad nunca se acepta desde el cliente para ampliar ownership.
- Listados de historial y catálogo admiten sus filtros/paginación DTO. Historial: `page`, `limit`, fechas, estado, programa/sesión y `state=in-progress`. No acepta studentId arbitrario.
- Iniciar workout captura toda la prescripción en una transacción. `prescriptionSource` vale `snapshot` o `legacy-current`; el detalle entrega `prescriptions` y `setLogs[].sessionExercise` ya resuelto con la copia histórica. Los Decimal se exponen como números.
- Añadir series recibe `{ setLogs: [...] }`. Es atómico, valida pertenencia al snapshot (o sesión para legacy), rechaza duplicados y workouts finalizados. Corregir una serie no cambia la copia prescrita.
- Finalizar recibe completionStatus y durationMinutes, más esfuerzo/fatiga/comentarios opcionales. Una duración no nula indica cierre. La edición se limita a 24h desde creación.
- Las fechas de asignación/competición usan `YYYY-MM-DD`; fechas inexistentes se rechazan. `startDate` puede estar ausente: el calendario no inventa planificación fechada. La referencia de día actual es APP_TIMEZONE (America/Santiago por defecto).
- Adjuntos se envían como multipart, campo `file`, con `body` opcional. Solo los participantes autorizados descargan por ID; nunca se devuelve una ruta pública/storageKey.
- La confirmación Excel convierte las filas validadas en la jerarquía normalizada. Plantilla y columnas exactas: `backend/src/common/imports/excel-template.ts`. No se ejecutan macros ni fórmulas; un archivo debe validarse y revisarse antes de confirmar.
- No se exponen contraseñas, hashes o tokens de invitación/reset en respuestas de negocio. Forgot-password conserva respuesta pública genérica.

Ownership se valida en backend; recursos ajenos normalmente devuelven 404 genérico. DTOs desconocidos o inválidos generan 400; conflictos de ejecución generan 409. Consultar [seguridad](security.md) y [datos](database.md).

## P1 — planificación y operación

Todos los endpoints conservan el prefijo /api/v1.

| Método / ruta | Acceso / resultado |
|---|---|
| POST /programs/:id/duplicate | Coach propietario; copia profunda de prescripción, 201 |
| POST /weeks/:id/duplicate | Coach propietario; copia dentro del mismo bloque, 201 |
| POST /sessions/:id/duplicate | Coach propietario; copia dentro de la misma semana, 201 |
| PATCH /program-assignments/:id/sessions/:sessionId/schedule | Coach propietario de programa y alumno; { scheduledDate: YYYY-MM-DD, reason?: string (máx. 500) } |
| POST /program-assignments/:id/sessions/:sessionId/schedule/reset | Coach propietario; elimina override, 201 |
| PATCH /program-assignments/:id/start-date | 409 si cambia una fecha con registros o overrides |
| GET /health/live | Proceso vivo; /health conserva compatibilidad |
| GET /health/ready | SELECT 1 mediante Prisma; 200 o 503 genérico |

Ownership ajeno devuelve 404 genérico; Alumno no puede duplicar/reprogramar (403). Un WorkoutLog del ciclo actual o legacy ambiguo de ese alumno/sesión bloquea cambio y reset (409), incluso en curso. Los logs inequívocos de otros ciclos no bloquean. La plantilla y otras asignaciones no se modifican. Reset también notifica al alumno.

Calendar (GET /calendar/me y GET /students/:id/calendar) agrega sessions[].rescheduled, originalDate y assignments[].adherence: { scheduledSessions, completedSessions, adherenceRate }. date es siempre efectiva; Home y Workspace usan la misma respuesta. rate es null sin fecha de inicio, sin sesiones vencidas o ante historial legacy ambiguo (insufficientReason: legacy-history). Solo se cuentan logs del programAssignmentId actual. Finalizada = durationMinutes !== null; se cuentan sesiones únicas, incluidas las finalizadas fuera del día previsto.

Cada request devuelve X-Request-Id (UUID validado o generado). Los errores del filtro global incluyen meta.requestId. Logs: requestId, método, ruta sin query, status y duración; nunca cuerpos, cookies ni tokens.

## P2 — ciclo y alumno inactivo

POST /sessions/:sessionId/workout-logs resuelve y devuelve programAssignmentId desde la asignación activa del alumno; no recibe ese ID del cliente. El listado de esa Session muestra el ciclo activo, mientras GET /workout-logs conserva todos los ciclos y legacy.

Al desactivar: JWT anterior y refresh sessions dejan de ser válidos; login/actividad del alumno responden 401. Crear o reactivar asignación del inactivo: 422. Enviar mensaje a un inactivo: 404 genérico; lectura de mensajes/adjuntos sigue autorizada para su Coach. No se crean notificaciones operacionales al inactivo. Reactivación requiere login nuevo.
