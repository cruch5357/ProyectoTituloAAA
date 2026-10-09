# ProyectoTituloAAA

Plataforma PWA de gestión y seguimiento del entrenamiento, desarrollada por Alan Basso, Alonso Cruz y Angel Rubio. El Coach planifica y acompaña; el Alumno consulta su calendario, ejecuta sesiones y registra resultados. La presentación se realiza localmente y el producto continúa en desarrollo.

## Qué funciona

- Autenticación, invitación de alumnos y recuperación por email; JWT de acceso, refresh opaco y roles COACH/STUDENT.
- Catálogo de ejercicios y planificación `Program → Block → Week → Session → SessionExercise`, con importación Excel validada y confirmación.
- `ProgramAssignment` con fecha de inicio, calendario, competiciones y objetivos separados de Coach y Alumno.
- Ejecución `WorkoutLog → SetLog`, historial, evolución descriptiva y Dashboard del Coach. La prescripción se congela al iniciar el entrenamiento; los registros anteriores indican fallback a la prescripción actual.
- Perfiles, mensajes privados con imágenes/videos y notificaciones internas mediante polling.
- PWA instalable, temas claro/oscuro y vistas adaptadas a móvil y escritorio. No sincroniza registros offline.

## Arquitectura

| Capa | Stack actual |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, React Router, TanStack Query, Workbox |
| API | NestJS 10, TypeScript, validación DTO, OpenAPI |
| Datos | PostgreSQL, Prisma 5, migraciones versionadas |
| Archivos | LocalStorageService privado detrás de StorageService |
| Email | Nodemailer, SMTP STARTTLS; configuración Brevo existente |

`backend/` y `frontend/` son proyectos npm independientes con lockfiles propios. La raíz contiene comandos de orquestación. `docs/` describe el estado actual; `docs/history/` conserva material anterior. `data-science/` es una reserva futura y `Fase 1/` conserva material académico.

## Inicio local

Requisitos: Node **24.21.0** (ver `.nvmrc`), npm 11 y PostgreSQL local (validado con 18). Puertos habituales: PostgreSQL 5432, API 3000 y frontend 5173.

1. Copiar `backend/.env.example` a `backend/.env` y `frontend/.env.example` a `frontend/.env.local`.
2. Configurar PostgreSQL y las variables según [demo local](docs/local-demo.md).
3. Ejecutar `npm run install:all`.
4. Ejecutar `npm run prisma:migrate:deploy --prefix backend` y `npm run prisma:generate --prefix backend`.
5. Opcional: configurar `DEMO_SEED_CONFIRM` y `DEMO_PASSWORD`, y ejecutar `npm run demo:seed`.
6. En dos terminales: `npm run dev:backend` y `npm run dev:frontend`.

Abrir <http://localhost:5173>. API: <http://localhost:3000/api/v1>; Swagger en `/api/v1/docs` fuera de producción. Para instalar la PWA se usa build/preview según la guía local.

## Verificación y respaldo

```sh
npm run lint
npm test
npm run test:all
npm run build
npm run backup:local
npm run restore:local -- backups/<fecha> --confirm
```

`test:all` incluye E2E; la suite con PostgreSQL real requiere `COACHING_E2E_DATABASE_URL` apuntando a una base exclusiva de pruebas ya migrada. No ejecutar `npm test` y `test:all` consecutivamente sin necesidad. [Testing](docs/testing.md) explica la batería completa y [backup local](docs/backup-local.md) explica cómo detener escrituras y restaurar de forma segura.

## Documentación

[Arquitectura](docs/architecture.md) · [Datos](docs/database.md) · [API](docs/api.md) · [Seguridad](docs/security.md) · [Requisitos](docs/requirements.md) · [Roadmap](docs/roadmap.md) · [Email](docs/email-setup.md).

Data Science, predicciones, cloud storage, despliegue cloud, billing, WebSockets, Web Push, wearables, Estimated 1RM, Stress Index y multi-coach permanecen fuera de esta iteración.
