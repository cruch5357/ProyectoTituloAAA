# Baseline de rendimiento local — P1

Fecha: 2026-10-09 (America/Santiago).

Entorno: win32 x64, Node v24.21.0, Intel(R) Core(TM) i5-10400 CPU @ 2.90GHz, 16 GiB RAM. PostgreSQL local; API Nest compilada.

Seed P0 sin modificaciones, esquema temporal aislado (3 alumnos, 24 sesiones, 18 entrenamientos).

Medición del alumno: 1 asignaciones activas y 24 sesiones para el alumno medido; 6 entrenamientos registrados. Resumen agregado del Coach: {"totalStudents":3,"activeStudents":3,"activeAssignments":3,"workoutsRegistered":18,"workoutsFinished":18,"completionStatusBreakdown":{"completed":15,"partial":3,"skipped":0},"summary":{"totalWorkouts":18,"totalSetLogs":162,"averageDurationMinutes":45,"averageOverallRpe":7,"averageFatigue":3.5,"trainingFrequencyPerWeek":11.454545454545455,"firstWorkoutAt":"2026-09-25T15:00:00.000Z","lastWorkoutAt":"2026-10-06T15:00:00.000Z"}}. No se modifican contraseñas ni datos de entrenamiento.

Método: login demo por variables de entorno; 3 warm-ups + 15 requests secuenciales por endpoint. Tiempo HTTP completo (incluye autenticación/ownership y parseo JSON). p95 por rango más próximo. No es un umbral de CI ni una garantía universal. Student Home tiene varias consultas: aquí se mide su planificación, no el tiempo total de renderizado de la página.

| Operación | Endpoint | Promedio ms | p95 ms |
|---|---|---:|---:|
| Coach Dashboard | `/dashboard/summary` | 5.15 | 8.64 |
| Student Home (planificación) | `/calendar/me` | 6.38 | 8.97 |
| Calendar (coach) | `/students/:studentId/calendar` | 5.85 | 6.58 |
| History | `/workout-logs?page=1&limit=20` | 4.74 | 5.75 |
| Notifications | `/notifications?page=1` | 2.83 | 3.33 |
| Messages list | `/messages/:peerId?page=1` | 3.86 | 5.22 |

No se aplicaron optimizaciones especulativas ni índices de rendimiento adicionales. La agregación de finalización por sesión evita transferir todo el historial para calcular adherencia.

Repetir: iniciar API local, definir DEMO_PASSWORD (y PERF_API_URL si corresponde), ejecutar `npm run performance:baseline`. Opcionales: PERF_COACH_EMAIL y PERF_STUDENT_EMAIL. El reporte se sobrescribe con cada medición. Nunca imprime tokens, cookies o contraseñas.

La medición registrada se reproduce con `npm run build:backend` y `npm run performance:demo`: crea un esquema local temporal, aplica las migraciones, usa el seed P0 con contraseña aleatoria, mide y elimina exclusivamente ese esquema. No depende de la contraseña demo preexistente.
