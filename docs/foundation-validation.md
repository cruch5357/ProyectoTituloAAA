# Validación de fundación técnica

Fecha local: 8 de octubre de 2026 (America/Santiago). Node 24.21.0, npm 11.19.0, Prisma Client 5.22.0 y PostgreSQL 18. Sin commit, push, reset ni restauración de la base de desarrollo.

## Batería final única

| Comprobación | Resultado exacto |
| --- | --- |
| Backend: npm test -- --runInBand | 50 suites, 444 tests aprobados |
| Frontend: npm test | 28 archivos, 128 tests aprobados |
| E2E: npm run test:e2e -- --runInBand | 12 suites, 74 tests aprobados; sin suites omitidas; PostgreSQL real temporal |
| Backend lint:check | Exit 0, sin --fix |
| Frontend lint:check | Exit 0, sin escritura |
| Backend build | Exit 0, Nest build |
| Frontend build | Exit 0, TypeScript/Vite; PWA generateSW y 15 entradas de precache |
| Prisma generate | Exit 0, cliente 5.22.0 generado |
| Prisma migrate status | Exit 0, 7 migraciones; Database schema is up to date |

La batería completa se ejecutó una sola vez después de la implementación. Antes se ejecutaron pruebas dirigidas; se corrigieron fixtures tipados y la expectativa visual de series × reps antes de la batería final. No se abrió navegador ni se repitió una auditoría visual.

## Integridad histórica y migración

La prueba HTTP real crea Exercise y SessionExercise A (3×5, RPE 8), inicia WorkoutLog, registra 100 kg, finaliza, cambia a B (4×4, RPE 9) y consulta historia: se mantiene A. Luego renombra Exercise y el nombre histórico sigue intacto. Comprueba también legacy sin snapshot usando la prescripción vigente. Un test de servicio rechaza ejercicios añadidos a una captura inicialmente vacía. Frontend prueba selector histórico y aviso legacy.

Migración aditiva `20261009000000_workout_prescription_snapshot` aplicada primero sobre una base temporal nueva y después sobre desarrollo, con backup previo. Conteos de desarrollo antes/después idénticos: 4 usuarios, 6 workouts y 54 sets. No hubo backfill de snapshots. Los datos de presentación existentes siguen siendo legacy por diseño.

## Backup y seed

Seed demo ejecutado dos veces en una base temporal: 4 usuarios (1 Coach, 3 Alumnos), 18 workouts, 54 snapshots y 162 sets, sin duplicación. Backup creado con pg_dump custom y archivo sintético; restore ejecutado exclusivamente en otra base temporal vacía. Conteos y contenido de multimedia idénticos tras restaurar.

Backups locales conservados e ignorados por Git:

- `backups/2026-10-09T01-11-08-394Z`: prueba con seed y multimedia sintética.
- `backups/2026-10-09T01-20-39-778Z`: respaldo de desarrollo anterior a la migración.

Los nombres usan UTC; corresponden al 8 de octubre en Santiago. Comprobados además sintaxis de scripts, rechazo de restore sin --confirm y error claro de pg_dump ausente sin filtrar password. Las dos bases temporales y los archivos sueltos de verificación se retiraron al finalizar; los backups se conservan para revisión.

## CI y limpieza

YAML parseado con js-yaml disponible localmente; comprobados triggers, tres jobs, directorios, scripts y coherencia package.json/lockfiles. La ejecución alojada de GitHub Actions queda para el próximo push/PR; no es necesaria para esta validación local.

Eliminados `.part2-edit.cjs`, `.part2-home.cjs`, `.part2-metrics.cjs`, `.part2-tests.cjs`, `.part2-video.cjs`, tras buscar referencias y revisar su función desechable. Eliminados logs anteriores `.part2-*.log`/`.evolution-*.log` y logs temporales de esta validación. Conservados migraciones, fixtures WebM, documentos académicos, multimedia de presentación y respaldo local. Documentación anterior conservada explícitamente bajo docs/history/.

## Límites y próximos pasos

No se enviaron correos reales ni se revalidó Brevo; su aceptación manual sigue documentada. Health sigue siendo liveness. El snapshot protege la prescripción y el nombre de ejercicios; nombres de sesión/programa y metadata auxiliar del catálogo siguen siendo actuales. No hay cloud, Data Science, nuevas métricas deportivas ni rediseño de UI. Las propuestas de duplicación, reprogramación y adherencia quedan en roadmap para definición posterior.
