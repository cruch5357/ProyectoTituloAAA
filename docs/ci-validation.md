# Reparación de CI — 2026-10-22

Se retomaron los cambios locales pendientes después de `06ae2c8`. Esta reparación cubre los fallos reportados en `CI / e2e` y `CI / browser-e2e`; no amplía el alcance pendiente de P3.

## Causas y correcciones

- `TrainingService.overview` reconstruía el estado de una sesión histórica a partir de las series de la plantilla actual y usaba ese resultado para adherencia. Ahora conserva el estado persistido de los registros finalizados y cuenta cada sesión finalizada una sola vez dentro de su asignación. Un registro abierto posterior no oculta un cierre anterior.
- Adherencia mantiene su contrato existente: sesiones programadas vencidas que fueron **finalizadas**, incluyendo PARTIAL/SKIPPED. Es distinta del cumplimiento total de series. Una ejecución abierta no cuenta, aunque ya tenga todas las series; duración 0 sigue siendo una señal válida de cierre.
- La consulta había excluido los registros sin `programAssignmentId`, impidiendo detectar historia ambigua. Ahora los consulta solo para marcar incertidumbre: nunca los atribuye al ciclo actual ni hace backfill. Si falta evidencia del ciclo, devuelve `adherenceRate: null` e `insufficientReason: legacy-history`.
- El inicio nuevo del alumno no mostraba el componente existente `Adherence`. Se volvió a incorporar en `/home`, reutilizando los datos de training y mostrando también estados de información insuficiente.
- El recorrido de Playwright seguía usando textos, rutas y campos del registro antiguo. Ahora utiliza `/training/sessions/:id`, «Anotar», confirmación de cierre y la reapertura del acordeón al registrar la última serie. Se conservaron las comprobaciones de resultados y las expectativas E2E HTTP originales.

## Archivos

- `backend/src/block-assignments/training.service.ts`
- `backend/src/block-assignments/training-overview.spec.ts` (nuevo, diez casos)
- `frontend/src/api/training.ts`
- `frontend/src/pages/student-training/StudentHomePage.tsx`
- `frontend/src/pages/student-training/StudentHomePage.test.tsx`
- `tests/browser/planning.spec.ts`

## Validación local

- Dirigidas: backend training-overview/training.service/adherence, 25 pruebas aprobadas antes de añadir el caso de duración cero; el caso añadido está incluido en la suite general posterior.
- `npm test`: 62 suites / 529 pruebas backend y 35 suites / 163 pruebas frontend aprobadas.
- `npm run lint`: aprobado.
- `npm run build`: backend, frontend y PWA aprobados.
- `npm run test:e2e --prefix backend -- --runInBand --runTestsByPath test/planning.e2e-spec.ts`: 8/8 aprobados contra PostgreSQL real, incluidos los dos fallos reportados.
- `npm run test:e2e:browser`: 8/8 aprobados con Chromium y API/DB reales, sin skips ni retries. Incluye los tres recorridos que CI no alcanzaba a ejecutar. Duración: 57,4 s.
- `npm run test:e2e --prefix backend -- --runInBand`: 13/13 suites y 82/82 pruebas aprobadas contra PostgreSQL real, sin skips. Duración: 23,149 s.
- `git diff --check`: aprobado.

Para los comandos locales se usaron cachés dentro de `node_modules/.cache` y una salida nueva de Playwright en esa carpeta; no se borraron los resultados de navegador preexistentes. Los códigos HTTP 400/403/404/409 de las pruebas negativas y los avisos de Node/React Router no representan fallos de assertions.

## Base de datos y alcance

Con autorización explícita del usuario se creó **coaching_ci_test** en PostgreSQL local y se aplicaron allí las 12 migraciones existentes mediante `prisma migrate deploy`. Las variables DATABASE_URL y COACHING_E2E_DATABASE_URL apuntaron a esa base únicamente en los procesos de validación. No se editó `.env`.

No hay cambios de esquema, migraciones nuevas, resets ni correcciones SQL de históricos. Las bases existentes del proyecto no se modificaron. Los fixtures E2E limpian sus propios identificadores; la base de pruebas se conserva para validaciones futuras.

No se modificó el workflow para ocultar fallos, omitir tests o aumentar retries. No se hizo commit ni push; el resultado remoto de GitHub se comprobará cuando se suban estos cambios.
