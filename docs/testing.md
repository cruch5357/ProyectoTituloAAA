## Pruebas de correo y recuperación

Tests unitarios nuevos en mail/mail.service.spec.ts, auth/password-reset.spec.ts y config/env.validation.spec.ts; ampliación de students/auth tests. Prueban destinatario/asunto/enlaces, STARTTLS, hashes, mensajes genéricos, errores SMTP, contraseña real Argon2id, rechazo de contraseña antigua, login con nueva contraseña, revocación, concurrencia y reuso. HTTP: test/password-reset.e2e-spec.ts verifica DTOs, envelope y rate limiting sin DB. Frontend: AccountRecoveryPages.test.tsx y LoginPage.test.tsx verifican recuperación, activación, navegación, URL limpia, confirmación y errores. Nunca se envían emails reales desde tests: MailService/transporter se mockean; el transporte real rechaza NODE_ENV=test.

Ejecutar npm run test --prefix backend -- --runInBand; npm run test:e2e --prefix backend -- --runInBand; npm run test --prefix frontend. Ver resultados y checklist manual en [email-setup.md](email-setup.md).

# Estrategia de Testing y QA

> Documento de planificación técnica — PROMPT 00. Define el enfoque de pruebas que se integrará durante todo el desarrollo, no solo al final. Angel (QA) es responsable de liderar esta estrategia junto con el equipo de desarrollo.

## 1. Principio general

El testing se integra desde la primera funcionalidad implementada (autenticación) y continúa en paralelo durante cada etapa del roadmap, no se concentra únicamente en la fase 19. Cada nueva funcionalidad de negocio debe incluir al menos pruebas unitarias de su lógica de servicio y, cuando corresponda, pruebas de integración de su endpoint.

## 2. Niveles de prueba

### Unit testing
- **Backend:** pruebas de los *services* (reglas de negocio) y *guards* (autorización) de forma aislada, con la base de datos simulada/mockeada.
- **Frontend:** pruebas de componentes y hooks críticos (formularios de registro de entrenamiento, validaciones de la vista previa de Excel).

### Integration testing
- Pruebas de los endpoints de la API contra una base de datos de pruebas real (contenedor PostgreSQL dedicado a testing), verificando el flujo completo controller→service→base de datos.

### API testing
- Colección de pruebas automatizadas (ej. con `supertest` o una colección Postman/Thunder Client versionada) que cubre los contratos definidos en `api.md`, incluyendo casos de error esperados (401/403/404/422).

### End-to-end (E2E)
- Flujos críticos completos simulando un navegador real (ej. Playwright): login de coach, creación de un programa completo, asignación a un alumno, login de alumno, registro de una sesión, importación de un Excel válido e inválido.

### Black-box testing
- Ejecutado por el integrante de QA desde la perspectiva de usuario final, sin apoyarse en el conocimiento de la implementación interna, siguiendo casos de uso documentados en `requirements.md`.

### Validación de formularios
- Cubierta tanto por pruebas unitarias de frontend como por casos E2E (campos obligatorios, rangos de RPE/RIR, tamaños de archivo).

### Pruebas responsive
- Verificación automatizada de layout en distintos viewports (Playwright con distintos tamaños de pantalla) más revisión manual en al menos un dispositivo móvil real antes de cada entrega relevante.

### Pruebas de seguridad
- Casos automatizados de autorización cruzada: alumno intentando acceder/modificar datos de otro alumno; coach intentando acceder a alumnos/programas ajenos; acceso sin token o con token expirado/inválido.

### Pruebas de importación de Excel
- Casos: archivo válido completo, archivo con filas mixtas válidas/inválidas, archivo vacío, archivo que excede el tamaño máximo, archivo con extensión falsificada, archivo `.xlsm` (rechazado), archivo con datos fuera de rango (RPE/RIR/series/repeticiones inválidas).
- Implementado en PROMPT 13 (primera mitad de RF-17/18/19: archivo -> validación -> vista previa, sin confirmación todavía): `backend/src/common/imports/excel-file-validation.spec.ts`, `backend/src/common/imports/excel-row-validation.spec.ts` y `backend/src/imports/excel-imports.service.spec.ts` cubren todos los casos listados arriba, generando archivos `.xlsx` reales en memoria con `exceljs` (no mocks del parser) para las pruebas de extremo a extremo del archivo. La autorización cruzada de un batch (coach viendo el de otro) se prueba junto con el resto de la matriz de la sección "Pruebas de seguridad". Pendiente para PROMPT 14: pruebas de confirmación/rechazo del batch y de la persistencia normalizada resultante.

### Pruebas de permisos
- Matriz rol × endpoint que verifica, para cada endpoint definido en `api.md`, qué combinaciones de rol y propiedad de recurso deben permitirse o rechazarse.

### Pruebas de rendimiento
- No es un foco central del MVP dado el volumen de datos esperado durante el proyecto de título, pero se documenta como verificación puntual sobre los endpoints de dashboard/métricas una vez exista un volumen representativo de datos de prueba (ej. tiempos de respuesta bajo un dataset sintético de varios cientos de registros).

### Pruebas de PWA (instalabilidad) — PROMPT 16
- **Cómo instalar la PWA:** hacer `npm run build && npm run preview` en `frontend/` (la instalación **solo** funciona sobre un build de producción/preview, nunca sobre `npm run dev`), abrir la URL que imprime `vite preview` en Chrome/Edge y usar el ícono "Instalar aplicación" de la barra de direcciones (o el menú del navegador → "Instalar Plataforma de Entrenamiento…").
- **Qué funciona sin conexión:** únicamente el *shell* estático de la aplicación (HTML/CSS/JS/íconos ya visitados) puede volver a cargar sin red, gracias al precache de Workbox. **Ningún dato de negocio funciona offline**: login, dashboards, programas, `WorkoutLog`/`SetLog`, importación de Excel y cualquier otra pantalla que dependa de `/api/**` no cargan datos sin conexión (el service worker nunca cachea esas respuestas a propósito — ver `docs/api.md` sección 17). Esto es intencional en PROMPT 16 y queda documentado como extensión futura en RF-31 (`docs/requirements.md`).
- **Automatizadas:** `frontend/src/registerServiceWorker.test.ts` (vitest) cubre `registerServiceWorker()`: no intenta registrar nada si `navigator.serviceWorker` no existe, llama a `registerSW({ immediate: true })` de `virtual:pwa-register` cuando sí existe, y no lanza excepción si el registro falla. El resto de la instalabilidad (manifest detectado, service worker realmente registrado por el navegador, ícono de instalación disponible) no es practicable de automatizar sin un entorno E2E con navegador real (Playwright, no instalado todavía en este proyecto — ver sección 2, "End-to-end"), así que se verifica con la checklist manual de abajo.
- **Checklist de verificación manual (contra un build real, nunca contra `vite dev`):**
  1. `npm run build` en `frontend/` y confirmar que se generan `dist/manifest.webmanifest`, `dist/sw.js` y `dist/workbox-*.js`.
  2. `npm run preview` (sirve `dist/` en `http://localhost:4173` por defecto) y abrir la app en Chrome/Edge.
  3. DevTools → pestaña **Application** → **Manifest**: confirmar que detecta `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color` y los 3 íconos sin errores.
  4. DevTools → **Application** → **Service Workers**: confirmar que `sw.js` está registrado y en estado "activated and is running".
  5. Barra de direcciones: debe aparecer el ícono de "Instalar aplicación"; instalar y verificar que abre en una ventana `standalone` (sin barra de URL del navegador).
  6. Con la app instalada, navegar directamente (refrescar o pegar la URL) a varias rutas anidadas de ambos roles (ej. `/students/:id`, `/student/programs/:id`, `/workout-logs/:id`) y confirmar que cargan correctamente (React Router + `navigateFallback: 'index.html'` de Workbox).
  7. DevTools → **Network**: hacer login y navegar por pantallas que consultan la API; confirmar que las peticiones a `/api/**` muestran `(memory cache)`/`disk cache` de **Chrome**, nunca `(ServiceWorker)`, como origen — es decir, el service worker no las está sirviendo/cacheando.
  8. DevTools → **Application** → **Cache Storage**: confirmar que el cache de Workbox (`workbox-precache-...`) solo contiene assets estáticos del build (JS/CSS/HTML/íconos/manifest), nunca URLs de `/api/**`.
- **Limitación conocida del entorno de desarrollo remoto (no del código de la aplicación):** en la sesión donde se implementó PROMPT 16, `vitest run` no pudo ejecutarse en la terminal remota utilizada (falla con `[vitest-pool-runner]: Timeout waiting for worker to respond` incluso para un test trivial sin relación con PWA, y persiste tras remover por completo el plugin PWA de `vite.config.ts`), por lo que la suite de vitest no se corrió de punta a punta en esa sesión. `tsc -b`, `oxlint`, `vite build` y `vite preview` sí se verificaron con éxito ahí. Se recomienda correr `npm run test` desde una terminal local normal (no a través del puente remoto) para confirmar el resultado completo de la suite, incluyendo los tests nuevos de PWA.
- **Actualización PROMPT 17:** en la sesión de PROMPT 17 se logró evitar el timeout anterior forzando `--pool=forks --no-file-parallelism`, pero la ejecución falla igualmente con `TypeError: now is not a function` dentro de `react-dom` al montar cualquier componente (se confirmó corriendo también un test ya existente y sin modificar, `ProgramFormDialog.test.tsx`, que falla exactamente igual), por lo que sigue siendo una limitación del entorno remoto (Node 22.23.2 + jsdom en ese contenedor), no algo introducido por los cambios de este prompt. `tsc -b`, `oxlint` y `vite build` sí se verificaron con éxito. Se mantiene la recomendación de correr `npm run test` en una terminal local normal.

## 3. Integración continua

Pipeline de CI (GitHub Actions) que en cada pull request ejecuta: lint, build y pruebas unitarias/integración de frontend y backend. Las pruebas E2E se ejecutan en la rama principal o antes de cada entrega relevante, ya que son más lentas de correr en cada commit.

## 4. Criterio de "hecho"

Una funcionalidad se considera terminada cuando: pasa lint y build sin errores, cuenta con pruebas unitarias de su lógica de negocio crítica, y —si expone un endpoint— cuenta con al menos un caso de prueba de integración feliz y uno de autorización fallida. No se persigue 100% de cobertura; se prioriza cobertura razonable sobre la lógica de negocio y de seguridad (propuesto como referencia: ≥70% en módulos de servicios/guards).

## 5. Registro y seguimiento de errores

Los defectos encontrados durante QA se registran como issues en el repositorio de GitHub, con severidad, pasos de reproducción y estado, permitiendo trazabilidad hasta el cierre del proyecto.

## Verificación de cierre coaching

- Backend: `npm test -- --runInBand`; E2E: `npm run test:e2e -- --runInBand`.
- El flujo real `test/coaching-flow.e2e-spec.ts` requiere `COACHING_E2E_DATABASE_URL` apuntando a PostgreSQL local migrado. Sin esa variable se omite sólo esa suite. Crea cuentas únicas, sustituye envío de correo y elimina únicamente sus registros/archivos. Prueba fechas, ownership, notificaciones, video real, refresh/CSRF y logout de ambos roles.
- Frontend: `npm test`, `npm run lint`, `npm run build`.
- Backend: `npm run lint`, `npm run build`, `npx prisma generate`, `npx prisma migrate status`. En Windows conviene detener el servidor durante generate/build para liberar archivos. Para otra base vacía o desactualizada: `npx prisma migrate deploy`; nunca reset.
- El fixture WebM de test es una animación sintética generada localmente, sin datos personales.

### Demo opcional

Desde backend, sólo en entorno local: definir `DEMO_SEED_CONFIRM=1` y `DEMO_PASSWORD` (10+ caracteres, letras y números), luego ejecutar explícitamente `npm run seed:demo`. No se ejecuta al iniciar la aplicación. Se rechaza NODE_ENV=production y las cuentas existentes con roles/relaciones incompatibles; los cambios son transaccionales y los IDs demo deterministas. No reemplaza contraseñas existentes salvo el placeholder inválido del seed antiguo.

Cuentas: coach.demo@example.com y entre uno y tres alumnos (alumno.demo@example.com, alumno2.demo@example.com y alumno3.demo@example.com). `DEMO_STUDENT_COUNT=1` crea sólo el primer alumno; por defecto son tres. Incluye dos bloques, ocho semanas, 24 sesiones con días definidos, tres ejercicios, asignaciones fechadas, seis entrenamientos registrados por alumno, competiciones, mensajes y notificaciones. La contraseña la aporta quien ejecuta; no hay credenciales reales incorporadas.

### Resultado del cierre — 8 de octubre de 2026

- Backend: 443 tests en 50 suites; frontend: 126 tests en 28 suites; E2E HTTP: 74 tests en 12 suites, incluida la suite contra PostgreSQL real. Todos pasan.
- Lint y build de ambos proyectos correctos. Prisma generate correcto; seis migraciones aplicadas y base actualizada, sin reset.
- Smoke visual en navegador: diez páginas críticas, tres tamaños (390×844, 768×1024 y 1440×900), Light y Dark; 60 combinaciones revisadas sin overflow de página ni controles inaccesibles.
- Login, recarga, renovación y logout comprobados para ambos roles; refresh HttpOnly y protección CSRF conservados. Chat de texto, imagen y video probado en ambos sentidos, incluida reproducción, acceso protegido, ownership y notificaciones.
- Calendario probado con sesiones, competición, coincidencia de ambas y asignación sin startDate. Home, Dashboard, perfil, notificaciones y landing integrados y revisados.
- Por solicitud explícita del usuario se ejecutó el seed con un Coach y un Alumno. Se añadieron por la API cuatro attachments sintéticos (imagen y video en ambos sentidos). La demo conserva seis mensajes, cuatro attachments, tres competiciones y 54 sets registrados. Se repitió el seed y los conteos permanecieron idénticos.
- Las cuentas temporales de QA fueron eliminadas; se conservan las dos cuentas de presentación. Los accesos generados se guardan únicamente en storage local ignorado por Git, sin incorporarlos al repositorio.
