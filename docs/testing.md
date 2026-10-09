# Testing y CI

## Herramientas y alcance

Backend: Jest/ts-jest, tests unitarios de servicios/controllers/guards/DTOs y Supertest E2E. Frontend: Vitest, Testing Library y jsdom. Hay un fixture WebM sintético para multimedia. No existe una suite Playwright incorporada y no se agrega en esta iteración.

Durante implementación ejecutar solo tests del módulo afectado, por ejemplo:

```sh
npm test --prefix backend -- --runInBand workout-logs set-logs
npm test --prefix frontend -- WorkoutLogPage
```

La prueba HTTP de `backend/test/coaching-flow.e2e-spec.ts` crea ejercicio y prescripción A, inicia el workout, registra sets, finaliza, modifica la prescripción a B y comprueba que el detalle histórico conserva A. También renombra el ejercicio y comprueba el nombre original, verifica fallback legacy y mantiene el flujo de ownership, multimedia, notificaciones y sesiones. Los tests de servicio cubren una captura vacía y rechazo de ejercicios añadidos posteriormente.

## PostgreSQL real

La suite coaching-flow es opt-in: definir `COACHING_E2E_DATABASE_URL` apuntando a una base exclusiva de pruebas. Configurar DATABASE_URL al mismo destino al migrar y ejecutar:

```powershell
$env:DATABASE_URL = 'postgresql://test:test-only@localhost:5432/coaching_test?schema=public'
$env:COACHING_E2E_DATABASE_URL = $env:DATABASE_URL
$env:NODE_ENV = 'test'
$env:CHAT_STORAGE_DIR = 'storage/test-chat'
npm run prisma:migrate:deploy --prefix backend
npm run prisma:generate --prefix backend
npm run test:e2e --prefix backend -- --runInBand
```

Crear previamente rol/base. La suite no hace reset: usa cuentas únicas y limpieza limitada a datos propios. Sin COACHING_E2E_DATABASE_URL esa suite se omite; un resultado con skips no equivale a validar PostgreSQL real. Los tests sustituyen MailService y NODE_ENV=test bloquea SMTP. No utilizar credenciales reales de correo en CI.

## Batería final

Una sola vez al terminar los cambios, con el entorno de pruebas anterior:

```sh
npm run test:all
npm run lint
npm run build
npm run prisma:generate --prefix backend
npm run prisma:migrate:status --prefix backend
```

`test:all` ejecuta backend, frontend y E2E; `lint` ejecuta lint:check de ambos sin --fix; `build` compila ambos. Si falla un comando, corregir y repetir únicamente ese comando y sus dependencias afectadas. No lanzar toda la batería otra vez. Detener servidores que bloqueen el motor Prisma en Windows antes de generate.

## GitHub Actions

`.github/workflows/ci.yml` se ejecuta en pull_request y push a main. Cuatro jobs: backend (npm ci, Prisma generate, lint:check, tests, build), frontend (npm ci, lint:check, tests, build) e2e (PostgreSQL 18 service, npm ci, generate, migrate deploy, E2E) y browser-e2e (Chromium, cuatro journeys con PostgreSQL y todas las migraciones). Usa Node de .nvmrc, npm cache y cancelación de ejecuciones antiguas de la misma referencia. Solo valores ficticios y permisos contents:read; no deploy, registry ni browser smoke completo.

La validación local del YAML comprueba parseo, rutas y scripts con las dependencias disponibles, sin instalar tooling pesado. No sustituye una ejecución alojada de GitHub Actions.

Los resultados exactos de esta iteración están en [validación de fundación](foundation-validation.md). La evidencia previa se conserva en [histórico](history/README.md).

## P1 — pruebas dirigidas y navegador

Backend: duplicate-prescription.spec.ts, schedule.service.spec.ts, adherence.spec.ts, health.controller.spec.ts, request-logging.middleware.spec.ts. Integración real: test/planning.e2e-spec.ts (8 casos, incluidos reasignación/ciclo y lifecycle), opt-in con COACHING_E2E_DATABASE_URL igual al PostgreSQL de prueba. No hay reset: solo se limpian IDs creados por los tests.

Browser: npm ci en raíz (además de npm run install:all), npx playwright install chromium, migraciones aplicadas, luego npm run test:e2e:browser. DATABASE_URL puede venir de backend/.env; nunca apuntar a producción. Playwright levanta API en 3101 (NODE_ENV=test, SMTP bloqueado) y Vite en 5175. Chromium desktop 1440×900, un worker, cuatro journeys: login por rol, duplicación, reprogramación y registro/finalización con adherencia. No depende de cuentas personales. Puerto ocupado falla explícitamente; no reutiliza otro servidor.

P1_SCREENSHOTS=1 captura las nuevas funciones también a 390×844 en test-results/. CI tiene job browser-e2e separado con PostgreSQL, instalación de Chromium solo allí y sin SMTP real. Los traces de fallos solo contienen cuentas sintéticas del fixture. Chat de navegador se omitió por ser opcional; se mantiene cobertura HTTP existente.

Rendimiento: npm run build:backend y npm run performance:demo reproducen el seed P0 en un esquema temporal local, lo miden y eliminan solo ese esquema. No modifica datos de desarrollo. Alternativa con cuentas demo existentes: definir DEMO_PASSWORD y ejecutar npm run performance:baseline. Resultado en docs/performance-baseline.md; no es una condición rígida de CI.

## P2

Comando ordinario: npm run validate (lint:check de ambos, tests backend/frontend, test:scripts y builds). No escribe fuentes ni requiere auto-fix. La batería final añade E2E HTTP, los cuatro journeys Chromium, Prisma generate y migrate status; no repetir la batería durante el desarrollo.

Pruebas críticas: planning.e2e-spec cubre dos ciclos de la misma Session, legacy NULL sin atribuir, inicio ligado al ciclo y lifecycle de alumno inactivo con histórico del Coach y revocación de sesiones. coaching-flow.e2e-spec mantiene snapshot A después de modificar prescripción a B. calendar-date y env.validation cubren configuración de zona, límite de día y valores inválidos. calendarDate frontend comprueba fechas y timestamps. scripts/storage-check.test.cjs verifica faltantes/huérfanos, metadata insegura y conservación de archivos. Ese test también se ejecuta en el job backend de CI.

Resultados de esta etapa: p2-validation.md. El baseline P1 se conserva; solo Calendar requiere una medición acotada tras cambiar la agrupación por ciclo.
