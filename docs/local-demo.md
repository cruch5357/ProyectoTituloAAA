# Demo local reproducible

## Requisitos

Node 24.21.0 (`.nvmrc`), npm 11 y PostgreSQL local (verificado con 18). No se requiere Docker. Herramientas `psql`, `pg_dump` y `pg_restore` de PostgreSQL en PATH; para backup/restore también puede definirse PG_BIN. Puertos: 5432 PostgreSQL, 3000 API, 5173 web. En Windows se puede usar `npm.cmd` si la política de PowerShell bloquea npm.ps1.

## Preparación

```powershell
git clone <URL-del-repositorio> ProyectoTituloAAA
cd ProyectoTituloAAA
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
npm run install:all
```

Iniciar el servicio PostgreSQL con las herramientas del sistema. Una instalación nueva necesita rol y base. Ejemplo **solo demo local**, ejecutado como administrador de PostgreSQL (las contraseñas son ficticias):

```sql
CREATE ROLE aaa_demo LOGIN PASSWORD 'DemoLocalDatabase2026';
CREATE DATABASE proyecto_titulo_aaa OWNER aaa_demo;
```

Puede ejecutarse con `psql -U postgres` e ingresar ambas instrucciones. No recrear ni resetear una base ya existente.

Configurar backend/.env:

```dotenv
DATABASE_URL=postgresql://aaa_demo:DemoLocalDatabase2026@localhost:5432/proyecto_titulo_aaa?schema=public
NODE_ENV=development
PORT=3000
ALLOWED_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
CHAT_STORAGE_DIR=storage/chat
```

Generar un JWT_ACCESS_SECRET propio del entorno con `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` y guardarlo en .env. No subirlo a Git. Mantener las vigencias, límites y demás variables del ejemplo. Frontend usa `VITE_API_URL=http://localhost:3000/api/v1`.

La validación exige SMTP configurado fuera de tests. Para una demo **sin envío de correo**, usar SMTP_HOST=localhost, SMTP_PORT=587, SMTP_SECURE=false, SMTP_USER=demo, SMTP_PASSWORD=demo, EMAIL_FROM=demo@example.com y EMAIL_FROM_NAME=Demo local. No invocar invitaciones/reset durante esa modalidad: el relay no existe y el envío no funcionará. El login de cuentas sembradas y el resto de la demo no requieren SMTP. Para demostrar email real, seguir [email-setup.md](email-setup.md) con credenciales propias; nunca usar NODE_ENV=test como configuración de la presentación.

## Migraciones y seed opcional

```powershell
npm run prisma:migrate:deploy --prefix backend
npm run prisma:generate --prefix backend
npm run prisma:migrate:status --prefix backend
$env:DEMO_SEED_CONFIRM = '1'
$env:DEMO_PASSWORD = 'DemoLocal2026!'
# Solo para sincronizar también las contraseñas de las cuentas demo existentes:
$env:DEMO_SYNC_PASSWORD = '1'
npm run demo:seed
Remove-Item Env:DEMO_SYNC_PASSWORD
Remove-Item Env:DEMO_PASSWORD
Remove-Item Env:DEMO_SEED_CONFIRM
```

La contraseña anterior es **SOLO DEMO**. Puede elegirse otra (10+ caracteres, letras y números). En bash: `DEMO_SEED_CONFIRM=1 DEMO_PASSWORD='DemoLocal2026!' npm run demo:seed`.

Se reutiliza `backend/prisma/seed.ts`: opt-in, transaccional, idempotente y bloqueado en producción. DEMO_STUDENT_COUNT admite 1, 2 o 3 (3 por defecto). Crea Coach, alumnos, perfiles, 3 ejercicios, 2 bloques, 8 semanas, 24 sesiones, asignaciones con startDate, 6 entrenamientos por alumno con sets, competiciones, mensajes y notificaciones. Los workouts nuevos incluyen snapshots. No genera adjuntos multimedia: pueden subirse desde el chat.

Cuentas: `coach.demo@example.com`, `alumno.demo@example.com`, `alumno2.demo@example.com`, `alumno3.demo@example.com`. Con la secuencia anterior, todas usan `DemoLocal2026!` (solo desarrollo/presentación local). Verificadas en P2. Sin DEMO_SYNC_PASSWORD=1 se conservan hashes existentes y solo se repara el placeholder del seed original; DEMO_PASSWORD se aplica a cuentas nuevas. La sincronización explícita cambia únicamente contraseñas de las cuentas demo seleccionadas por DEMO_STUDENT_COUNT y revoca sus sesiones anteriores. Rechaza roles/relaciones incompatibles y destinos PostgreSQL no locales; no resetea programas, fechas, ejecución ni snapshots. No existe contraseña fallback en autenticación normal.

## Iniciar y presentar

Terminal 1: `npm run dev:backend`. Terminal 2: `npm run dev:frontend`. Abrir <http://localhost:5173>; el health está en <http://localhost:3000/api/v1/health> y Swagger en `/api/v1/docs`.

Para la PWA instalable, detener Vite dev y ejecutar:

```powershell
npm run build:frontend
npm run preview --prefix frontend -- --host localhost --port 5173
```

Abrir localhost:5173 e instalar desde el navegador compatible. Usar el mismo origen configurado evita problemas CORS/cookies. `vite dev` no registra el service worker. La PWA guarda el shell, no permite registrar entrenamientos sin API.

Recorrido sugerido: Coach → alumnos/Dashboard → programa/asignación → calendario/competición → Alumno → iniciar sesión/registrar sets/finalizar → historial prescrito vs real → mensajes/archivo privado → campana. Sin rediseño ni funcionalidades adicionales.

## Datos locales

PostgreSQL conserva datos estructurados; `backend/storage/chat` conserva multimedia privada. CHAT_STORAGE_DIR admite ruta absoluta o relativa al directorio backend; usar siempre los comandos de inicio documentados para conservar esa referencia. Si se configura fuera del repositorio, sigue siendo responsabilidad del equipo proteger ese directorio. No colocarlo en frontend/public.

Antes de mover la demo: detener backend y usar [backup local](backup-local.md). Un backup no incluye .env ni secretos; el equipo configura esos valores de manera independiente en cada máquina.

## Secuencia P1

1. Coach abre un programa: Duplicar programa. Abrir copia permite revisar prescripción sin copiar alumnos o historial.
2. En Planificación: Duplicar semana; Ver sesiones → Duplicar sesión. La copia conserva el mismo día y se puede editar después. Estas acciones cambian la plantilla compartida; para experimentar, usar la copia del programa.
3. Coach abre Alumno → Calendario → Reprogramar una sesión sin registros; elige fecha y motivo opcional. Puede Restablecer programación en el mismo diálogo.
4. Alumno inicia sesión: Home muestra la fecha nueva y Calendario marca Reprogramada. La notificación es interna, sin email.
5. Para completar la demo de adherencia, programar para hoy; Alumno inicia, registra una serie y finaliza con duración. Home y Resumen del Workspace muestran el porcentaje actualizado.
6. Intentar reprogramar esa sesión muestra el bloqueo por entrenamiento registrado.

Health técnico: /api/v1/health/live y /api/v1/health/ready. X-Request-Id permite correlacionar respuestas y logs. SMTP se comprueba con npm run email:verify: no envía correos ni imprime credenciales; en CI/tests se omite.

## Operación P2

APP_TIMEZONE=America/Santiago en backend/.env (default). Una zona por entorno: reiniciar API/Vite o reconstruir frontend tras cambiarla. Frontend y backend deben usar la misma configuración.

npm run storage:check compara referencias DB con storage: no borra nada. Exit 0 si está consistente; 1 si encuentra diferencias o no puede comprobar. Detener escrituras de chat durante una revisión de mantenimiento para evitar diferencias transitorias. No existe cleanup automático; revisar manualmente los hallazgos tras hacer backup. El reporte puede contener claves privadas y no debe publicarse.

npm run validate ejecuta lint sin --fix, tests de backend/frontend/scripts y builds. E2E HTTP y browser se ejecutan aparte con su PostgreSQL de pruebas; ver testing.md. No modifica fuentes, aunque los builds producen artefactos ignorados.
