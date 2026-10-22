# P3 — validación por cortes verticales

Fecha: 2026-10-21 (America/Santiago).

**Entrega parcial: corte 1, ejecución compacta y registro seguro. P3 NO está completo.**
No se iniciaron migraciones ni contratos a medio conectar para los siguientes cortes.
No se ejecutó commit ni push, ni operaciones de modificación de base de datos.

## Auditoría del código actual

Se inspeccionaron schema Prisma y migraciones de snapshots/asignaciones, DTOs y controller de training, TrainingService/training-state, endpoints históricos de WorkoutLog, mappers, biblioteca de bloques/ExerciseEditor, ejecución del Alumno, consulta Coach, Calendar/Planning, servicios de dashboard/métricas, Message/Notifications y pruebas existentes.

Hallazgos relevantes para continuar:

- La ejecución activa utiliza TrainingSessionPage y PATCH /training/sessions/:id, no el formulario histórico de WorkoutLogPage.
- TrainingService ya verifica pertenencia, ciclo activo y revision dentro de una transacción con bloqueo por alumno; validatePerformed rechaza series extra, ajenas y repetidas.
- La biblioteca dispone de ProgrammedSet; las asignaciones nuevas tienen una copia propia de Program/Block y frozenExercise. No equivale a que todos los datos del Workout se lean desde WorkoutPrescription.
- WorkoutPrescription congela parámetros agregados, pero no la prescripción individual completa de ProgrammedSet. TrainingService aún construye las series desde SessionExercise. Es necesario resolver esta diferencia antes de incorporar la política de orden y métricas históricas nuevas.
- durationMinutes sigue siendo la señal de cierre, tanto en ejecución estructurada como en consultas y métricas. No se puede ocultar el input sin cambiar esos consumidores.
- RPE sigue admitiendo números fuera del conjunto P3 en múltiples DTOs e importación. El siguiente corte debe revisar todas esas entradas juntas.
- El flujo estructurado no utiliza la notificación WORKOUT_COMPLETED del servicio histórico. NotificationsService dispone de upsert por dedupeKey; Message representa mensajes humanos. La alerta P3 requerirá conectar el flujo estructurado y la conversación.
- Calendar usa TrainingService, pero coloca tarjetas dentro de cada fecha y reduce columnas a 4/2 en responsive; todavía no es la grilla mensual P3.
- El dashboard general filtra por alumno/programa/bloque; su filtrado no incorpora todavía la garantía P3 del ciclo actual en todas las métricas.

## HECHO / IMPLEMENTADO

- Un ejercicio expandido como máximo; un formulario de serie expandido como máximo. Se pueden contraer todos.
- Primer ejercicio con serie pendiente abierto; la primera serie nueva está vacía y pendiente. Al recuperar se abre la primera pendiente, conservando los valores disponibles.
- Cabeceras compactas con número, nombre, X/Y y estado; resumen de valores en series registradas.
- Botones reales, aria-expanded/aria-controls, contenido contraído inert/aria-hidden, foco visible, transición de 160 ms y prefers-reduced-motion.
- Eliminado el desplegable Indicaciones. Se muestran notas reales, multilínea, sin texto genérico. Cuando existe captura, la nota viene de WorkoutPrescription incluso si es null.
- Anotar completa exclusivamente valores null, conserva ceros y valores manuales, y guarda por el endpoint existente. Tras éxito abre la siguiente pendiente; si el usuario cambió de acordeón mientras esperaba, no se le fuerza a volver.
- Escribir un campo no cambia PENDING a RECORDED. Navegar, omitir y dejar pendiente conservan los campos ingresados.
- Borrador síncrono en sessionStorage, separado por usuario/asignación/sesión. Recargar la misma pestaña recupera datos pendientes sin crear SetLogs vacíos. El servidor sigue siendo fuente de identidad, prescripción y permisos.
- Una respuesta exitosa conserva borradores de otras series pendientes/omitidas; el borrador se elimina cuando ya coincide con los datos persistidos.
- Error de red conserva valores. Bloqueo síncrono contra doble envío y revision del servidor intacta. Una revisión local obsoleta se muestra para consultar/copiar antes de descartarla explícitamente; no sobrescribe al servidor.
- El guardado de SetLog utiliza upsert por la clave única existente. Ya no elimina/recrea todas las series en cada guardado: conserva id y createdAt de las series que siguen registradas. Solo se eliminan aquellas que se dejan pendientes/omitidas explícitamente, conforme al contrato previo de reemplazo de progreso.
- Vista readOnly permanece sin acciones de escritura.

## FRONTEND / archivos principales

- frontend/src/pages/student-training/TrainingSessionPage.tsx
- frontend/src/pages/student-training/execution-draft.ts (nuevo)
- frontend/src/pages/student-training/training.css
- frontend/src/pages/student-training/TrainingSessionPage.test.tsx
- tests/browser/block-assignment.spec.ts (adaptación del flujo a Anotar y acordeones)
- playwright.ui.config.ts y tests/browser-ui/training-execution.spec.ts (prueba de interfaz aislada, API simulada, sin DB)

## BACKEND / archivos principales

- backend/src/block-assignments/training.service.ts: notas del snapshot y upsert de series.
- backend/src/block-assignments/training.service.spec.ts (nuevo): persistencia por identidad, revisión obsoleta, pertenencia, límite de series, no crear vacío, notas congeladas.
- No hay endpoints ni DTOs nuevos; se reutiliza el contrato completo existente.

## CAMBIOS DE BASE DE DATOS

Ninguno. Sin migraciones añadidas ni aplicadas. No se usó db push, migrate reset, SQL correctivo ni backfill.

## VALIDADO

- Pruebas dirigidas frontend: 10/10 pasan.
- Pruebas dirigidas backend: 16/16 pasan (training.service y training-state).
- npm run lint: pasa después de corregir formato del nuevo spec.
- npm run build: backend y frontend/PWA pasan.
- npm test: backend 61 suites / 519 tests pasan. La primera ejecución frontend quedó en 159/160 por una espera de carga de ProgramBoard. Reejecución `npm test --prefix frontend -- --maxWorkers=1` con TEMP/TMP locales: 35 suites / 160 tests pasan. Una repetición sin TEMP/TMP local falló antes de ejecutar tests por archivos temporales ENOENT; no se cambiaron tests ajenos para ocultarlo.
- Primer intento de Jest: EPERM en caché temporal del sandbox. Reejecutado con caché en backend/node_modules/.cache/jest-p3; para la suite general TEMP/TMP se fijaron a node_modules/.cache/p3-temp durante ese comando.
- `npx playwright test --config playwright.ui.config.ts`: 2/2 pasan en Chromium, 390 px y 1440 px, con API simulada. Se verificaron teclado, un solo acordeón abierto, valores manuales, guardado, recarga y ausencia de desborde horizontal. Las capturas `test-results/p3-execution-390.png` y `test-results/p3-execution-1440.png` fueron inspeccionadas visualmente. La prueba detectó y permitió corregir visibilidad heredada de paneles de series dentro de ejercicios contraídos y el exceso de padding heredado.
- Playwright: primer intento encontró EPERM al limpiar test-results existente. La configuración usa ahora un directorio de salida único en node_modules/.cache. El inicio del servidor dentro del sandbox no progresó y fue interrumpido; la prueba pasó al ejecutarse fuera del sandbox. No usa el config E2E con PostgreSQL.
- git diff --check: pasa (avisos de normalización LF/CRLF, sin errores).
- No se ejecutaron suites E2E con PostgreSQL. No se improvisó COACHING_E2E_DATABASE_URL ni se modificaron datos reales.

## COMPATIBILIDAD / limitaciones reales

- No se cambian datos históricos, asociaciones de ciclo ni timestamps existentes; conservar createdAt no lo convierte en un tiempo fiable de inicio de serie.
- Logs sin snapshot conservan la compatibilidad anterior. La mejora de notas no constituye una solución completa del snapshot individual de series.
- sessionStorage sobrevive a recargas en la misma pestaña; no sincroniza borradores entre dispositivos y puede perderse al cerrar la pestaña. El registro confirmado sí queda en servidor. Si el almacenamiento falla, se muestra un aviso visible.
- La API todavía permite las correcciones de sesiones finalizadas mientras el ciclo esté activo, conforme al comportamiento anterior. No se introdujo aquí una nueva política de cierre.
- La omisión de sesión completa conserva la confirmación explícita existente; no se añadió todavía justificación.

## PENDIENTE — no implementado en esta entrega

1. Corte 2: selector RPE cerrado con @ en todas las entradas aplicables, validación backend/importaciones; inicio/final de Workout, actividad/registro por serie, duración calculada en servidor, eliminación coherente de la entrada manual y tiempos históricos nullable.
2. Corte 3: allowFlexibleOrder en planificación y snapshots, segmentos bloqueados, orden efectivo separado, controles accesibles y enforcement en backend.
3. Corte 4: justificación persistida, cálculo de cierre contra prescripción congelada completa, alerta operacional deduplicada y tarjeta contextual en conversación; mantener notificación normal donde corresponda.
4. Corte 5: calendario mensual lunes-domingo, distintivos compactos, detalle seleccionado, scroll superior si hace falta, pruebas de estados/reprogramaciones/ciclo.
5. Corte 6: métricas descriptivas de sesiones/series, duración, RPE, volumen, evolución y alertas con scoping por programAssignmentId y fuentes históricas correctas.
6. Ampliación del histórico Coach para todos esos datos, pruebas obligatorias correspondientes y flujo integrado P3 completo contra un entorno E2E correctamente configurado.

No se afirma que la definición de terminado de P3 esté satisfecha. El corte entregado es funcional sobre el contrato actual; los cortes restantes requieren trabajo adicional de modelo, backend, frontend y validación.
