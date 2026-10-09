# P2 — consistencia y consolidación local

Fecha: 2026-10-09. Etapa P2 completa; el producto sigue en desarrollo. Sin commit, push, reset ni restore. Cambios P0/P1 conservados para revisión en GitHub Desktop.

## P1 cerrado

Se inspeccionó el diff interrumpido y se terminó WorkoutLog.programAssignmentId nullable. El backend resuelve el ciclo activo del alumno y valida la Session al iniciar, sin confiar en un ID de asignación enviado por el cliente. Nueva ejecución y snapshot nacen juntos. Adherencia, calendario y listado de sesión distinguen ciclos; reutilizar la plantilla permite entrenar de nuevo sin sumar ejecución previa. Legacy NULL nunca se atribuye automáticamente: conserva historial y puede producir adherencia insuficiente. Reprogramación protege ejecución actual y legacy ambiguo.

## P2 implementado

- Desactivación con incremento tokenVersion y revocación de refresh sessions. Login/actividad del alumno bloqueados; reactivación exige login nuevo.
- Coach conserva consulta histórica existente, incluidos chat/adjuntos, competiciones y métricas de workouts/sets. Bloqueo de asignación/reactivación al inactivo, nuevos mensajes hacia él y notificaciones operacionales. Sin borrado de datos.
- storage:check de solo lectura: huérfanos, referencias faltantes, metadata inválida y entradas inesperadas. No hay cleanup automático. Backup existente sigue incluyendo storage.
- APP_TIMEZONE validada, default America/Santiago, fuente común backend/config/app-timezone.cjs y valor incorporado por Vite. Hoy, calendario, adherencia, Home y días restantes comparten la zona; DATE no se desplaza.
- Formularios informa su futura disponibilidad sin CTA falso. Navegación principal revisada, sin otros dead ends importantes identificados.
- Índices recientes revisados, sin optimización especulativa. JWT_REFRESH_SECRET ya estaba retirado en P0; no se quitaron otras variables sin evidencia. SMTP intacto.
- npm run validate: lint sin auto-fix, tests backend/frontend/scripts y builds. E2E se mantienen separados con PostgreSQL de pruebas.
- Seed local existente con DEMO_SYNC_PASSWORD=1 explícito para cuentas demo, sin reset. Cuatro credenciales coinciden con docs/local-demo.md y autenticaron por HTTP. El seed completó recursos demo ausentes; segunda ejecución confirmó idempotencia por hashes de programas, asignaciones, workouts, snapshots, sets, mensajes y adjuntos. No se hizo backfill de registros existentes.

## Validación final

La batería completa se ejecutó una vez al terminar. El primer lint detectó una importación require no admitida; se cambió a import de namespace y se repitió lint. Los pasos detenidos por ese fallo se ejecutaron después, sin repetir tests completos que ya habían pasado.

| Verificación | Resultado exacto |
|---|---|
| Backend tests | 482/482, 56 suites |
| Frontend tests | 135/135, 30 archivos |
| Backend E2E | 82/82, 13 suites, PostgreSQL habilitado, sin skips |
| Browser E2E Chromium | 4/4, 21,1 s |
| Scripts storage | 3/3 |
| Backend lint:check | OK |
| Frontend lint:check | OK |
| Backend build | OK |
| Frontend build + PWA | OK |
| Prisma generate | OK, cliente 5.22.0 |
| Prisma migrate status | 9 migraciones, esquema actualizado |
| git diff --check | OK tras retirar un espacio final |

Las pruebas cubren separación de ciclos, misma sesión en ciclo nuevo, legacy sin atribuir, snapshot histórico tras editar prescripción, inactivos, histórico autorizado, zona horaria y checker sin borrado. Los cuatro journeys browser siguen siendo los de P1; no se amplió la suite. CI aplica todas las migraciones en los jobs PostgreSQL y ejecuta el checker test en backend. No se disparó GitHub Actions porque no se hizo push.

## Operación y privacidad

storage:check real: 6 referencias DB, 6 archivos físicos; cero huérfanos, faltantes o entradas inválidas. Es una foto del momento; durante mantenimiento conviene detener escrituras de chat. No se eliminaron archivos ni metadata. PostgreSQL/storage/backups permanecen locales y privados; .env, storage y backups están ignorados. No se repitió restore ni SMTP verify.

Migración aditiva 20261009020000_workout_assignment_occurrence aplicada: FK nullable, ON DELETE SET NULL e índice de asignación/sesión. No se reescribieron migraciones previas ni se borraron WorkoutLogs, SetLogs, snapshots o asignaciones.

Rendimiento: baseline P1 conservado. Solo Calendar medido tras la agrupación por ciclo: promedio 8,96 ms, p95 19,67 ms, 3 warm-ups + 15 muestras. Dataset local existente distinto del temporal P1; no es comparación controlada. Detalle: performance-calendar-p2.md.

## Límites y pendientes

Ningún pendiente obligatorio del alcance P2 identificado. Decisiones explícitas: sin cleanup automático; legacy sin atribución inventada; una zona por entorno; storage local; Forms sin implementar; sin cloud, métricas deportivas nuevas, Data Science ni purga de cuentas. Cambiar APP_TIMEZONE requiere reiniciar API/Vite o reconstruir frontend. Los accesos históricos del Coach conservan el alcance existente; no se añadieron endpoints nuevos de exportación/detalle deportivo.

Advertencias no bloqueantes: frontend conserva un bundle mayor de 500 kB; Chromium muestra avisos existentes de React Router/colores de consola. No se actualizaron dependencias mayores. SMTP verify previo valida conexión/autenticación, no entrega en bandeja.

Commit sugerido, no ejecutado: feat(platform): consolidate core platform and coaching workflows.
