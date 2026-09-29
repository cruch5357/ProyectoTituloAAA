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

## 3. Integración continua

Pipeline de CI (GitHub Actions) que en cada pull request ejecuta: lint, build y pruebas unitarias/integración de frontend y backend. Las pruebas E2E se ejecutan en la rama principal o antes de cada entrega relevante, ya que son más lentas de correr en cada commit.

## 4. Criterio de "hecho"

Una funcionalidad se considera terminada cuando: pasa lint y build sin errores, cuenta con pruebas unitarias de su lógica de negocio crítica, y —si expone un endpoint— cuenta con al menos un caso de prueba de integración feliz y uno de autorización fallida. No se persigue 100% de cobertura; se prioriza cobertura razonable sobre la lógica de negocio y de seguridad (propuesto como referencia: ≥70% en módulos de servicios/guards).

## 5. Registro y seguimiento de errores

Los defectos encontrados durante QA se registran como issues en el repositorio de GitHub, con severidad, pasos de reproducción y estado, permitiendo trazabilidad hasta el cierre del proyecto.
