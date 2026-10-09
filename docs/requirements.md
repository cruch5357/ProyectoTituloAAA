# Requisitos y estado actual

Estado de referencia: 8 de octubre de 2026. IMPLEMENTADO significa que existe el flujo en código; no certifica disponibilidad de un proveedor externo. PARCIAL señala un límite concreto. Los requisitos originales y su redacción completa se conservan en [archivo histórico](history/baseline-2026-10-08/requirements.md).

## Requisitos funcionales históricos

| Requisito | Estado | Alcance actual |
| --- | --- | --- |
| RF-01, RF-02 | IMPLEMENTADO | Registro y sesión Coach |
| RF-03, RF-04 | IMPLEMENTADO | Invitación/activación y sesión Alumno |
| RF-05 | IMPLEMENTADO | Recuperación por email; entrega real sujeta a SMTP |
| RF-06 | PARCIAL | Listado, detalle y estado de alumnos; sin edición general del alumno por Coach |
| RF-07 | IMPLEMENTADO | Ownership del Coach |
| RF-08 | IMPLEMENTADO | Catálogo propio, edición y baja lógica; no borrado físico |
| RF-09 | IMPLEMENTADO | Consulta del ejercicio asignado y video enlazado |
| RF-10 | IMPLEMENTADO | Programas y baja lógica |
| RF-11, RF-12, RF-13 | PARCIAL | Crear, leer y editar bloques/semanas/sesiones; no DELETE ni duplicación |
| RF-14 | IMPLEMENTADO | Sets, rango reps, RPE/RIR, descanso y notas |
| RF-15, RF-16 | IMPLEMENTADO | Asignación individual repetible para varios alumnos y lectura autorizada |
| RF-17, RF-18, RF-19, RF-20 | IMPLEMENTADO | Importación Excel, validación, revisión y confirmación normalizada |
| RF-21, RF-22, RF-23 | IMPLEMENTADO | Calendario/sesión, sets reales y resumen de ejecución |
| RF-24 | IMPLEMENTADO | Corrección en ventana de 24h desde creación del workout |
| RF-25 | IMPLEMENTADO | Historial y evolución descriptiva |
| RF-26 | IMPLEMENTADO | Dashboard, volumen y esfuerzo de ejecución; no porcentaje de adherencia |
| RF-27 | FUTURO | Predicciones/Data Science |
| RF-28 | IMPLEMENTADO | Mensajería privada, contexto de sesión/ejercicio |
| RF-29 | PARCIAL | Adjuntos multimedia e in-app notifications implementados; WebSockets/Web Push futuros |
| RF-30 | IMPLEMENTADO | PWA instalable y vistas responsivas; sin nueva auditoría visual en esta iteración |
| RF-31 | FUTURO | Offline-first con sincronización de datos |

## Funciones adicionales existentes

IMPLEMENTADO: ProgramAssignment.startDate, calendario, competiciones y coachGoal, perfil propio, espacio de seguimiento de atleta, landing pública, notificaciones por polling y eventos, snapshot prescrito por workout, scripts de backup/restore local y CI.

PARCIAL: health informa liveness; no readiness de servicios. La integración de email está implementada, pero la recepción real requiere completar la aceptación manual indicada en email-setup.md.

## Requisitos no funcionales

| ID | Estado / evidencia o límite |
| --- | --- |
| RNF-01 Seguridad | IMPLEMENTADO: backend autoritativo, JWT/CSRF/ownership, validación y tests |
| RNF-02 Responsive | IMPLEMENTADO: vistas adaptadas; esta iteración no repite auditoría visual |
| RNF-03 Rendimiento | PARCIAL: paginación y límites; objetivo <500 ms no certificado con carga |
| RNF-04 Disponibilidad | PARCIAL: backup/restore local; sin SLA/alta disponibilidad |
| RNF-05 Mantenibilidad | IMPLEMENTADO: módulos TS, lint sin escritura, tests, builds y CI |
| RNF-06 Escalabilidad | PARCIAL: modularidad; sin pruebas de escala productiva |
| RNF-07 Compatibilidad | PARCIAL: navegadores modernos; sin certificación exhaustiva de versiones |
| RNF-08 Idioma | IMPLEMENTADO: interfaz/documentación en español |
| RNF-09 Accesibilidad | PARCIAL: controles semánticos y etiquetas; sin auditoría integral |
| RNF-10 Trazabilidad | IMPLEMENTADO: auditoría de acciones críticas |

## Reglas preservadas

Un alumno pertenece a un coach, los roles son únicos y no hay rol ADMIN. Prescripción y ejecución nunca se sobrescriben. Los registros requieren sesión asignada; RPE/RIR son opcionales e independientes. Excel requiere confirmación y todos los recursos privados requieren ownership. Los históricos nuevos usan snapshot; los antiguos declaran fallback actual, sin inventar datos.

FUTURO: Data Science, predicción, billing, WebSockets, Web Push, wearables, Estimated 1RM, Stress Index, multi-coach, cloud storage, despliegue cloud, IA generativa y apps nativas. Ninguno se incorpora en esta iteración.

## P1 — workflows

Coach propietario puede duplicar Program/Week/Session, reprogramar una ocurrencia individual y restablecerla; Alumno recibe notificación interna y consulta fecha efectiva. Cualquier entrenamiento registrado impide reprogramar. La fecha de inicio se protege cuando hay ejecución u overrides.

Adherencia por asignación ACTIVE de programa activo: 100 × sesiones únicas con fecha efectiva <= hoy y entrenamiento finalizado / sesiones únicas con fecha efectiva <= hoy. Finalizado significa durationMinutes !== null. Futuras y sin fecha calculable no entran; registros en curso no suman al numerador. Sin startDate o sin denominador: null (Sin programación suficiente). Hoy usa APP_TIMEZONE desde la configuración central (America/Santiago por defecto). No hay promedio grupal.

P1 incluye cuatro journeys Chromium, readiness PostgreSQL, request ID/log básico, baseline local y SMTP verify sin envío. El proyecto sigue en desarrollo, sin release final ni módulos deportivos nuevos.

## P2 — consistencia y lifecycle

- La adherencia pertenece a ProgramAssignment: nunca utiliza ejecución de otro ciclo ni atribuye automáticamente logs legacy NULL. El historial y los snapshots permanecen visibles; la falta de atribución puede producir adherencia null, no un porcentaje inventado.
- Desactivar un alumno invalida acceso, incrementa tokenVersion y revoca refresh sessions. No puede iniciar sesión, registrar entrenamiento, crear competición, enviar mensajes ni modificar perfil. Reactivar requiere login nuevo.
- El Coach propietario conserva la consulta histórica existente: asignaciones, métricas de workouts/sets, competiciones, mensajes y adjuntos. No se borran datos. No se crean/reactivan asignaciones para inactivos, no se les envían nuevos mensajes ni notificaciones operacionales.
- Formularios declara su futura disponibilidad sin acciones falsas. No se implementan cuestionarios.
- storage:check es lectura exclusivamente; validate reúne lint, pruebas y build sin autoformateo.
