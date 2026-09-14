# Requisitos del Sistema

> Documento de planificación técnica — PROMPT 00. Define el alcance funcional y no funcional acordado antes de iniciar la implementación. Fuente de verdad para los prompts siguientes.

## 1. Alcance de este documento

Este documento traduce la Propuesta Inicial de Proyecto a requisitos verificables, separando explícitamente lo que forma parte del MVP (18 semanas) de lo que queda como trabajo futuro.

## 2. Actores y roles

| Rol | Descripción | Dispositivo principal |
|---|---|---|
| `COACH` | Gestiona alumnos, ejercicios, programas y analiza resultados | Computador / tablet |
| `STUDENT` (Alumno) | Ejecuta y registra su entrenamiento | Móvil |

Reglas de negocio sobre roles:

- Todo usuario tiene exactamente un rol (`COACH` o `STUDENT`); no existen cuentas híbridas en el MVP.
- Un alumno pertenece a **un único coach** en el MVP (relación 1:N Coach→Alumno). La relación N:N (multi-coach) queda fuera de alcance inicial.
- Los alumnos no se autorregistran: el coach crea la cuenta del alumno o lo invita mediante un enlace/token de activación enviado a su correo. Esto evita cuentas huérfanas y mantiene la integridad de la relación coach-alumno.
- No existe rol `ADMIN` en el MVP; tareas administrativas (soporte, resets) se resuelven manualmente sobre la base de datos durante el proyecto de título.

## 3. Requerimientos funcionales (RF)

Prioridad: **MVP** (obligatorio para el alcance de 18 semanas) o **Futuro** (fuera de alcance inicial).

### 3.1 Autenticación y cuentas
- RF-01 (MVP) — Un coach puede registrarse con correo y contraseña.
- RF-02 (MVP) — Un coach puede iniciar/cerrar sesión de forma segura.
- RF-03 (MVP) — Un coach puede crear/invitar alumnos, quienes activan su cuenta y definen su contraseña.
- RF-04 (MVP) — Un alumno puede iniciar/cerrar sesión de forma segura.
- RF-05 (Futuro) — Recuperación de contraseña por correo (queda documentado como necesario para producción real, pero no es bloqueante para la evaluación del proyecto de título si el tiempo no alcanza).

### 3.2 Gestión de alumnos (Coach)
- RF-06 (MVP) — Listar, ver detalle, editar y desactivar alumnos propios.
- RF-07 (MVP) — Un coach solo puede ver/gestionar alumnos que le pertenecen.

### 3.3 Ejercicios
- RF-08 (MVP) — CRUD de ejercicios propios del coach (nombre, grupo muscular, indicaciones, video/enlace opcional).
- RF-09 (MVP) — El alumno puede ver el detalle de un ejercicio prescrito en su sesión (solo lectura).

### 3.4 Programación (Programa → Bloque → Semana → Sesión → Ejercicio → Serie)
- RF-10 (MVP) — CRUD de programas propios del coach.
- RF-11 (MVP) — CRUD de bloques dentro de un programa.
- RF-12 (MVP) — CRUD de semanas dentro de un bloque.
- RF-13 (MVP) — CRUD de sesiones dentro de una semana.
- RF-14 (MVP) — Prescripción de ejercicios por sesión con series, repeticiones objetivo, RPE/RIR objetivo (opcionales) y descanso.
- RF-15 (MVP) — Asignación de un programa a uno o más alumnos.
- RF-16 (MVP) — Un alumno solo puede ver los programas que le fueron asignados.

### 3.5 Importación desde Excel
- RF-17 (MVP) — El coach puede subir un archivo Excel con una planificación siguiendo una plantilla definida por el sistema.
- RF-18 (MVP) — El sistema valida el archivo y muestra una vista previa con errores detectados por fila antes de confirmar.
- RF-19 (MVP) — El coach puede corregir el archivo y reintentar, o confirmar la importación de las filas válidas.
- RF-20 (MVP) — Los datos importados se almacenan en el modelo relacional normalizado (no como copia del Excel).

### 3.6 Registro de entrenamiento (Alumno)
- RF-21 (MVP) — El alumno visualiza la sesión del día/semana asignada.
- RF-22 (MVP) — El alumno registra, por serie: repeticiones reales, carga, RPE y/o RIR.
- RF-23 (MVP) — El alumno registra a nivel de sesión: cumplimiento, RPE general, percepción de esfuerzo/fatiga y comentarios.
- RF-24 (MVP) — El alumno puede editar un registro dentro de una ventana de tiempo limitada (propuesto: 24 horas desde su creación; pendiente de validación con el equipo).
- RF-25 (MVP) — El alumno puede consultar su historial de sesiones y evolución básica (cargas, cumplimiento).

### 3.7 Dashboard y métricas (Coach)
- RF-26 (MVP) — El coach visualiza métricas agregadas por alumno: cumplimiento, evolución de cargas, volumen, RPE promedio.
- RF-27 (Futuro/opcional-final) — Resultado de la predicción del componente de ciencia de datos, si está disponible antes del cierre del proyecto.

### 3.8 Comunicación
- RF-28 (MVP) — Mensajería básica coach-alumno (texto), opcionalmente asociada a una sesión o ejercicio.
- RF-29 (Futuro) — Comunicación en tiempo real (WebSockets), notificaciones push, adjuntos multimedia.

### 3.9 PWA
- RF-30 (MVP) — La aplicación es instalable (manifest + service worker) y responsiva en todos los flujos.
- RF-31 (Futuro) — Soporte offline-first con sincronización diferida de registros.

## 4. Requerimientos no funcionales (RNF)

- RNF-01 — **Seguridad**: toda regla de autorización se valida en el backend; el frontend nunca es la única barrera (ver `security.md`).
- RNF-02 — **Responsive**: la interfaz debe funcionar correctamente desde 360px (móvil) hasta resoluciones de escritorio.
- RNF-03 — **Rendimiento**: tiempos de respuesta de API objetivo < 500ms en operaciones CRUD estándar bajo carga de desarrollo/demo (no se exige carga productiva real).
- RNF-04 — **Disponibilidad**: no se exige alta disponibilidad (SLA) durante el proyecto de título; sí se documenta la estrategia de backups.
- RNF-05 — **Mantenibilidad**: arquitectura modular, código tipado (TypeScript en frontend y backend), lint y formateo automatizados.
- RNF-06 — **Escalabilidad**: el diseño no debe bloquear el crecimiento futuro (más alumnos, más coaches, servicio de datos), pero tampoco debe sobre-diseñarse para una escala que el proyecto no necesita.
- RNF-07 — **Compatibilidad**: navegadores modernos (Chrome, Edge, Safari, Firefox actualizados); no se soporta Internet Explorer.
- RNF-08 — **Idioma**: interfaz y documentación en español; no se requiere internacionalización.
- RNF-09 — **Accesibilidad básica**: contraste adecuado, etiquetas de formulario, navegación por teclado en flujos críticos.
- RNF-10 — **Trazabilidad**: acciones críticas quedan auditadas (ver `security.md`).

## 5. Reglas de negocio clave

1. Un alumno pertenece a un único coach (MVP).
2. La prescripción del coach y el registro real del alumno **nunca** se almacenan en la misma tabla ni se sobrescriben entre sí (ver `database.md`).
3. Solo el coach puede crear/editar/eliminar ejercicios, programas, bloques, semanas y sesiones.
4. Un alumno solo puede leer/escribir sus propios registros de entrenamiento.
5. Un coach solo puede leer/escribir recursos de alumnos que le pertenecen.
6. RPE y RIR son campos opcionales e independientes entre sí; un programa puede usar uno, otro, ambos o ninguno.
7. Toda importación de Excel requiere una vista previa y confirmación explícita antes de persistir datos.
8. Un registro de entrenamiento no puede existir sin una sesión prescrita asociada (no se permite registro "libre" en el MVP).

## 6. Explícitamente fuera del alcance del MVP

- Ciencia de datos/predicción como dependencia obligatoria del sistema (queda como capacidad opcional de última prioridad).
- Notificaciones push avanzadas.
- Pagos, suscripciones o planes comerciales.
- Comunicación en tiempo real (WebSockets) y adjuntos multimedia en mensajería.
- Multi-coach por alumno y gestión de centros deportivos/organizaciones.
- Integración con wearables o servicios de salud externos.
- Aplicaciones móviles nativas independientes.
- IA generativa como asistente.
- Recuperación de contraseña por correo (deseable, no bloqueante).
- Soporte offline-first de datos (solo se exige instalabilidad PWA básica).
