# Roadmap y Alcance (MVP vs. Futuro)

> Documento de planificación técnica — PROMPT 00. Adapta la secuencia de 24 etapas propuesta a un cronograma de 18 semanas, con un ajuste justificado respecto al orden original.

## 1. Ajuste respecto a la secuencia original

La secuencia original ubica "Testing completo" en la etapa 19 (casi al final) y "Auditoría de seguridad" en la etapa 20. Se ajusta esto por una razón técnica explícita: el proyecto tiene una fuerte orientación a QA declarada desde la propuesta inicial (sección 11), y dejar todo el testing para el final es un riesgo real de proyecto (defectos de autorización o de integridad de datos descubiertos demasiado tarde para corregir). Por lo tanto:

- El testing (unitario, integración, permisos) se integra **desde la semana 3** en adelante, junto con cada funcionalidad nueva, tal como define `testing.md`.
- La etapa 19 se redefine como **"Testing de regresión completo y hardening final"**, no como el único momento en que se prueba el sistema.
- De forma similar, el análisis exploratorio de ciencia de datos puede comenzar antes de la etapa 24 usando datos sintéticos/semilla, para no depender de que el sistema ya tenga meses de uso real antes de que el data scientist del equipo pueda avanzar.

El resto de la secuencia (1 a 18, 20 a 23) se mantiene en el orden propuesto porque refleja una dependencia técnica real (no se puede programar autenticación antes de tener base de datos, no se puede hacer dashboard antes de tener registros, etc.).

## 2. MVP vs. Futuro (resumen)

**Dentro del MVP (18 semanas):** autenticación segura, roles coach/alumno, gestión de alumnos, ejercicios, programas/bloques/semanas/sesiones, registro de entrenamiento con separación prescripción/registro, importación de Excel con validación y vista previa, dashboard básico de métricas, historial del alumno, mensajería básica, PWA instalable y responsiva, testing integrado, auditoría de seguridad y documentación.

**Fuera del MVP (futuro):** ciencia de datos/predicción como dependencia obligatoria (se intenta como extensión de última prioridad si el tiempo alcanza), notificaciones push avanzadas, pagos/suscripciones, comunicación en tiempo real (WebSockets) y adjuntos multimedia, multi-coach por alumno, gestión de centros deportivos, integración con wearables, aplicaciones nativas independientes, IA generativa, soporte offline-first de datos.

## 3. Cronograma aproximado (18 semanas)

| Semana | Etapa | Contenido principal |
|---|---|---|
| 1 | 1 | Análisis, arquitectura y planificación técnica (este conjunto de documentos) |
| 2 | 2 | Inicialización del repositorio (monorepo), entornos, CI básico, scaffolding de frontend y backend |
| 3 | 3, 5 | PostgreSQL + Prisma/migraciones; autenticación segura (registro coach, invitación de alumno, login, JWT) |
| 4 | 6, 7 | Autorización por rol y por recurso; gestión de alumnos |
| 5–6 | 8, 9 | Ejercicios; Programas/Bloques/Semanas/Sesiones (CRUD de prescripción) |
| 7–8 | 10–12 | Registro de entrenamiento del alumno; validación end-to-end de la separación prescripción/registro |
| 9 | 13 | Dashboard del coach (métricas básicas) e historial del alumno |
| 10–11 | 14 (adelantada) | Importación de Excel (validación, vista previa, confirmación) |
| 12 | 15, 16 | Comunicación básica coach-alumno |
| 13 | 17 | PWA (manifest, service worker, instalabilidad) y pulido responsive final |
| 14 | 24 (adelantada, parcial) | Ciencia de datos: definición de la variable a predecir y análisis exploratorio con los datos ya generados por el sistema (o datos semilla si aún son insuficientes) |
| 15 | 24 (continuación) | Implementación de la predicción sencilla y su integración opcional en el dashboard |
| 16 | 19, 20 | Testing de regresión completo y auditoría de seguridad |
| 17 | 21, 22 | Optimización y preparación para producción/demo (hardening, backups, revisión de dependencias) |
| 18 | 23 | Documentación final, buffer de correcciones y entrega |

Nota: el trabajo de QA (`testing.md`) y las tareas de ciencia de datos que no dependen de la app terminada (definición de posibles variables, preparación de datasets sintéticos, exploración de librerías) corren en **paralelo** desde etapas tempranas, no como bloques aislados al final.

## 4. Riesgos técnicos y decisiones pendientes

Ver la sección de cierre de la respuesta de este PROMPT 00, que resume decisiones pendientes de confirmación por el equipo y los riesgos identificados para las siguientes 17 semanas.
