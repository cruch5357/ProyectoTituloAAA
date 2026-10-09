# P1 — cierre de implementación

Fecha: 2026-10-09. Cambios locales para revisión; sin commit ni push. Se preservaron cambios P0.

Implementado: duplicación profunda transaccional Program/Week/Session con ownership y auditoría; reprogramación por asignación/sesión; fecha efectiva común; adherencia; Health live/ready; request ID/logging; cuatro journeys Chromium y CI; baseline local y SMTP verify sin enviar correos.

## Cierre del corte

Quedó pendiente distinguir ciclos de ejecución. Se terminó WorkoutLog.programAssignmentId nullable, validado/resuelto en backend al iniciar. Migración 20261009020000_workout_assignment_occurrence aplicada: nueve migraciones totales. Sin backfill, reset ni cambios a snapshots existentes. Misma Session ejecutable en un ciclo nuevo; calendario, listado de sesión y adherencia no reutilizan registros de ciclos anteriores. Los registros NULL permanecen en el historial y nunca se atribuyen por inferencia. Adherencia ambigua se presenta como información insuficiente.

Antes de comenzar P2 pasaron 91 tests dirigidos backend (7 suites), 13 E2E (planning y coaching-flow), 12 frontend (Home/Session/History) y los cuatro journeys Chromium. La batería inicial P1 anterior al último ajuste había pasado 476 backend, 133 frontend, 80 E2E y 4 browser. Esos números son evidencia histórica, no el total final P2; consultar p2-validation.md para los resultados vigentes.

## Adherencia

100 × sesiones únicas vencidas con ejecución finalizada inequívoca del ciclo / sesiones únicas vencidas. Fecha efectiva <= hoy, durationMinutes !== null, dos decimales. Sin startDate/denominador: null. Legacy ambiguo no se usa como finalización; insuficiencia se indica explícitamente. P2 centraliza hoy con APP_TIMEZONE. Reprogramación bloquea ejecución actual o legacy ambiguo; ejecución inequívoca de un ciclo anterior no bloquea el nuevo.

## Evidencia y límites

Baseline P1: 3 warm-ups y 15 muestras por cada uno de seis endpoints; promedios 2,83–6,38 ms y p95 3,33–8,97 ms, documentado en performance-baseline.md. SMTP verify real pasó sin envío. No se repitió en P2. Capturas P1 revisadas a 1440×900 y 390×844. Chat browser era opcional y no se añadió; conserva pruebas HTTP. CI configurada, sin ejecución remota porque no se hizo push.

P2 resuelve la discrepancia de credenciales demo mediante sincronización opt-in del seed local. La atribución de registros legacy sigue siendo una limitación explícita, no se inventan relaciones. P1 cerrado.
