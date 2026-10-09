# Arquitectura actual

La aplicación es un monorepo con dos proyectos npm independientes. React 19 + Vite 8 consume la API NestJS 10 bajo `/api/v1`; Prisma 5 conecta con PostgreSQL. Node 24.21.0 es la versión fijada y verificada localmente. No hay microservicios, cloud storage ni despliegue automático.

## Componentes

- Frontend: React Router para navegación y control visual por rol, TanStack Query para datos remotos, TypeScript y vistas Coach/Student. La autorización efectiva siempre está en el backend.
- Backend modular: auth/users, students, exercises, programs/blocks/weeks/sessions/session-exercises, assignments, student-training, workout-logs/set-logs, dashboard, imports, coaching/calendar, competitions, messages, notifications, mail, storage y audit.
- PostgreSQL: identidad, prescripción normalizada, ejecución independiente, comunicación y auditoría. Los IDs son cuid; los nombres físicos usan snake_case. Los índices y restricciones SQL también forman parte de las migraciones.
- Archivos: `MessagesService` depende de `StorageService`; `MessagesModule` inyecta `LocalStorageService`. `CHAT_STORAGE_DIR` configura el directorio privado (por defecto `backend/storage/chat` al iniciar desde backend). Cambiar proveedor en el futuro no requiere acoplar MessagesService a APIs de almacenamiento.
- Email: Nodemailer con STARTTLS; invitaciones y recuperación usan tokens opacos con hash en BD. Los tests sustituyen MailService; no envían correo real.

## Prescripción y ejecución

`Program → Block → Week → Session → SessionExercise` representa lo planificado. `ProgramAssignment` conecta programa/alumno y fecha de inicio. `WorkoutLog → SetLog` guarda lo ejecutado. Al iniciar un workout, una transacción RepeatableRead crea también `WorkoutPrescription` con columnas de snapshot para todos sus ejercicios, incluidos los que aún no tienen series. No se vuelve a capturar al consultar o finalizar.

El mapper de workout/set centraliza la respuesta histórica y el fallback legacy. Dashboard y estadísticas comparten cálculos de ejecución en `common/training/workout-metrics.ts`; no calculan una adherencia deportiva nueva. Los nombres de sesión/programa siguen siendo metadata vigente; el snapshot protege la prescripción de ejercicios y sus nombres.

## PWA y comunicación

Workbox precachea el shell estático del build. No hay runtime cache de API, tokens o datos personales. El service worker no se registra en `vite dev`; se verifica instalación con build/preview. No hay sincronización offline de ejecuciones.

Chat y notificaciones usan HTTP/polling, sin WebSockets ni Web Push. Los adjuntos se descargan autenticados desde backend; no existe carpeta pública de multimedia.

## Operación local

Los scripts raíz orquestan instalación reproducible, lint sin escritura, tests y builds. GitHub Actions valida backend, frontend y E2E con PostgreSQL aislado. Backup/restore cubre schema public y el directorio multimedia configurado, con la aplicación detenida. `/health` es un liveness básico: no comprueba PostgreSQL, SMTP o disco.

[Demo](local-demo.md), [backup](backup-local.md), [datos](database.md) y [seguridad](security.md) contienen los contratos operativos. Las decisiones y requisitos anteriores se conservan en [archivo histórico](history/README.md).

## P2 — privacidad, ciclo y configuración

WorkoutLog identifica su ProgramAssignment al iniciar y conserva por separado el snapshot de prescripción. Los registros previos con vínculo NULL no se infieren. Las métricas específicas del ciclo excluyen registros ajenos; el historial general se conserva.

Desactivar alumno revoca refresh sessions e invalida JWT por tokenVersion; reactivarlo no revive sesiones anteriores. El Coach propietario conserva los accesos históricos existentes, incluido chat/adjuntos. Se impide nueva actividad del alumno, envío de mensajes al inactivo, asignación/reactivación de programas y notificaciones operacionales. No existe borrado automático de cuenta ni purga.

Actualmente la plataforma opera con una única zona horaria configurada para el entorno. APP_TIMEZONE se valida con Intl, por defecto America/Santiago. La fuente compartida es backend/config/app-timezone.cjs: backend consulta esa configuración y Vite incorpora solamente APP_TIMEZONE del entorno/backend .env al iniciar o compilar. Cambiarla exige reiniciar API y Vite o reconstruir frontend. Las fechas DATE siguen siendo fechas de calendario, sin conversión de zona.

Los datos de entrenamiento permanecen en PostgreSQL local; los adjuntos, en storage local privado. RBAC y ownership protegen la API. Los backups locales incluyen información privada, deben custodiarse y no se versionan; .env, backend/storage y backups están ignorados por Git. Un CHAT_STORAGE_DIR externo también debe protegerse fuera del repositorio.

storage:check informa archivos huérfanos, referencias sin archivo y entradas inesperadas sin borrar ni seguir directorios/enlaces internos. El backup existente incluye el storage configurado; no se repitió restore.

## Limitaciones conocidas

Logs legacy sin ciclo inequívoco; prescripción legacy sin snapshot; una zona horaria por entorno; almacenamiento y presentación locales; Formularios aún no implementado; sin despliegue cloud ni borrado integral de cuentas. Son límites explícitos de esta etapa. /health/live comprueba proceso y /health/ready consulta PostgreSQL; no certifican SMTP/disco.
