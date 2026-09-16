# Arquitectura del Sistema

> Documento de planificación técnica — PROMPT 00. Fuente de verdad arquitectónica para los prompts siguientes. Ninguna implementación posterior debe contradecir estas decisiones sin documentar y justificar el cambio aquí.

## 1. Principios de diseño

1. **Una sola aplicación, dos experiencias.** No se construyen dos apps separadas: una SPA/PWA responsiva con rutas y componentes adaptados por rol (`COACH` desktop-first, `STUDENT` mobile-first).
2. **El backend es la única fuente de verdad de seguridad.** Ninguna regla de autorización se confía exclusivamente al frontend.
3. **Separación estricta entre prescripción y ejecución.** Lo que el coach planifica y lo que el alumno realmente hizo son conceptos y tablas distintas, nunca fusionadas.
4. **Monolito modular, no microservicios prematuros.** Con un equipo de 3 personas y 18 semanas, un backend monolítico bien modularizado es más simple de operar, testear y desplegar que una arquitectura distribuida. La única pieza que puede vivir separada es el componente de ciencia de datos, y solo si se llega a necesitar.
5. **La ciencia de datos es una extensión, no una dependencia.** El sistema debe funcionar al 100% sin que exista ningún modelo predictivo.
6. **Evitar sobreingeniería.** Cada decisión se evalúa contra el alcance de 18 semanas; funcionalidades "por si acaso" quedan documentadas en Futuro, no implementadas.

## 2. Vista general

```
                    ┌───────────────────────────┐
                    │   CLIENTE (Navegador)     │
                    │   React + TypeScript PWA  │
                    │   Vista Coach / Vista Alumno │
                    └─────────────┬─────────────┘
                                  │ HTTPS / REST (JSON)
                                  ▼
                    ┌───────────────────────────┐
                    │        API BACKEND        │
                    │   Node.js + TypeScript    │
                    │   (NestJS, arquitectura   │
                    │    en capas + guards)     │
                    └─────────────┬─────────────┘
                                  │ SQL (ORM)
                                  ▼
                    ┌───────────────────────────┐
                    │        PostgreSQL         │
                    └─────────────┬─────────────┘
                                  │ acceso de solo lectura
                                  │ (futuro, opcional)
                                  ▼
                    ┌───────────────────────────┐
                    │  Servicio de Ciencia de   │
                    │  Datos (Python) — FUTURO  │
                    │  Desacoplado, opcional    │
                    └───────────────────────────┘
```

El servicio de ciencia de datos se dibuja para dejar constancia de que existe un lugar preparado para él, no porque se construya en esta etapa.

## 3. Frontend

- **Stack:** React + TypeScript, bundler Vite.
- **Organización:** por features (`/features/programs`, `/features/exercises`, `/features/logs`, etc.), no por tipo de archivo, para que cada módulo de negocio sea autocontenible.
- **Estado:** estado de servidor (datos remotos) gestionado con una librería de data-fetching con cache (ej. TanStack Query) para evitar duplicar lógica de sincronización manual; estado de UI local con hooks/context solo donde se necesite.
- **Enrutamiento por rol:** guards de ruta que redirigen según `role` del usuario autenticado; un alumno nunca puede navegar a rutas de coach y viceversa a nivel de UI (esto es una ayuda de UX, **no** un control de seguridad — la autorización real vive en el backend).
- **Responsive:** diseño mobile-first para las vistas de alumno, adaptado con breakpoints para las vistas de coach que requieren tablas/calendarios más densos en desktop.
- **PWA (alcance MVP):** manifest + service worker para instalabilidad y cache de assets estáticos. El offline-first de datos (cola de registros sin conexión) queda documentado como extensión futura.

## 4. Backend

- **Stack:** Node.js + TypeScript sobre **NestJS**. Se eligió NestJS (en vez de Express plano) porque ofrece estructura modular, inyección de dependencias, decoradores para *guards* de rol/recurso y validación declarativa (DTOs), lo cual reduce el riesgo de errores de autorización manuales en un proyecto con fuerte foco en seguridad. *(Decisión confirmada en PROMPT 01 al inicializar el backend; ver `## 10. Registro de decisiones` al final de este documento.)*
- **Arquitectura en capas:** Controller (HTTP) → Service (reglas de negocio) → Repository/ORM (persistencia). Los controllers no acceden directamente a la base de datos.
- **ORM:** Prisma, por su soporte de migraciones versionadas, tipado end-to-end con TypeScript y buena documentación del esquema como fuente de verdad (`schema.prisma`).
- **Validación de entrada:** DTOs con `class-validator`/`class-transformer`; toda entrada de usuario se valida y sanea en el backend independientemente de la validación en el frontend.
- **Guards de autorización:** un guard de rol (`CoachGuard`/`StudentGuard`) y un guard de propiedad de recurso (verifica que el alumno/programa/sesión solicitado pertenece al usuario autenticado) — ver detalle en `security.md`.

## 5. Comunicación frontend-backend

- REST sobre HTTPS, payloads JSON, versionado bajo `/api/v1`.
- Autenticación mediante JWT (access + refresh token) — detalle en `security.md` y `api.md`.
- Contrato documentado con OpenAPI/Swagger generado desde el propio backend, para mantenerlo sincronizado con el código real.

## 6. Estructura de repositorio y monorepo vs. polirepo

**Decisión: monorepo.**

Ventajas para este proyecto: un solo repositorio ya existente (`ProyectoTituloAAA`), equipo pequeño (3 personas) que necesita coordinar cambios de frontend/backend/documentación en conjunto, posibilidad de compartir tipos TypeScript entre frontend y backend (ej. tipos de DTOs), y un único pipeline de CI más simple de mantener durante 18 semanas.

Desventajas consideradas: un monorepo puede acoplar despliegues (se mitiga desplegando frontend y backend como artefactos independientes aunque vivan en el mismo repo) y puede crecer en tamaño (irrelevante a esta escala).

Un polirepo (repos separados por frontend/backend/data-science) se descartó por añadir sobrecarga de coordinación (PRs cruzados, versiones de tipos compartidos) sin un beneficio real para un equipo de 3 personas en 18 semanas.

Estructura propuesta:

```
ProyectoTituloAAA/
├── frontend/            # React + TypeScript (PWA)
├── backend/             # Node.js + TypeScript (NestJS + Prisma)
├── data-science/        # Placeholder — sin código hasta que exista variable a predecir y datos suficientes
├── docs/                # Documentación técnica (este conjunto de documentos)
├── tests/               # Pruebas E2E cross-cutting (Playwright) que ejercitan frontend+backend juntos
├── .github/workflows/   # CI (lint, build, test)
└── Fase 1/              # Evidencias académicas existentes (no se modifica)
```

`frontend/` y `backend/` mantienen sus propios `package.json`, tests unitarios y configuración de lint; `tests/` cubre únicamente flujos end-to-end que requieren ambos servicios corriendo.

## 7. Modelo de datos

Ver `database.md` para el detalle de entidades, relaciones y la separación entre prescripción y ejecución.

## 8. Ciencia de datos como servicio desacoplado (futuro)

Si en una etapa posterior existen datos suficientes y una variable de predicción justificada, se documenta aquí la arquitectura prevista para no bloquear esa opción:

- Servicio independiente en Python (ej. FastAPI) que **no** forma parte del proceso de arranque de la aplicación principal.
- Acceso a datos mediante un rol de base de datos de **solo lectura** y mínimo privilegio (ver `security.md`), evitando construir un pipeline de mensajería/ETL completo que sería sobreingeniería para el alcance de este proyecto.
- El resultado del modelo (si existe) se expone como un endpoint propio que el backend principal puede consumir opcionalmente para mostrarlo en el dashboard del coach; si el servicio no está disponible, el dashboard funciona igual sin esa sección.
- No se define aún qué se predice ni cómo: eso depende de los datos reales que la plataforma genere durante el desarrollo (ver `roadmap.md`, etapa de ciencia de datos).

## 9. Riesgos técnicos y decisiones pendientes

Ver la sección de cierre en la respuesta de este PROMPT 00 y `roadmap.md` para el detalle completo de decisiones pendientes y riesgos identificados.

## 10. Registro de decisiones

| Fecha/Etapa | Decisión | Estado |
|---|---|---|
| PROMPT 00 | Monorepo (frontend/backend/docs/tests/data-science) | Confirmado |
| PROMPT 00 | Separación estricta prescripción vs. registro real | Confirmado |
| PROMPT 01 | Backend con NestJS (sobre Express plano) | Confirmado al inicializar el scaffold del backend |
| PROMPT 01 | ORM Prisma para PostgreSQL | Confirmado al inicializar el scaffold del backend |
| PROMPT 01 | Frontend con Vite + React + TypeScript | Confirmado al inicializar el scaffold del frontend |
| Pendiente | Plantilla exacta de columnas del Excel de importación | Abierto — se define junto con el prompt de importación |
| Pendiente | Ventana de edición de un registro ya enviado (propuesto 24h) | Abierto — se valida con el equipo |
| Pendiente | Variable a predecir por ciencia de datos | Abierto por diseño — depende de datos reales suficientes |
| Pendiente | Infraestructura de hosting para demo/producción final | Abierto |
| PROMPT 02 | Modelo de datos definitivo implementado (14 entidades) en `backend/prisma/schema.prisma` | Confirmado |
| PROMPT 02 | IDs como `String @default(cuid())` en vez de enteros autoincrementales (defensa en profundidad contra IDs adivinables) | Confirmado |
| PROMPT 02 | `User.tokenVersion` como mecanismo de invalidación de refresh tokens (sin tabla `RefreshToken` separada) | Confirmado, se conecta en PROMPT 03 |
| PROMPT 02 | Migración inicial de Prisma escrita a mano y verificada contra PostgreSQL real vía `pglite` (WASM), por bloqueo de red a `binaries.prisma.sh` en el entorno de preparación | Confirmado — pendiente de re-verificación del equipo con `prisma generate`/`migrate deploy` en un entorno con internet normal |
| PROMPT 03 | Autenticación: access token JWT (header `Authorization`) + refresh token **opaco** (no JWT) en cookie httpOnly, con hash SHA-256 en tabla `refresh_sessions` | Confirmado — reemplaza para el refresh token el mecanismo de `tokenVersion` planteado en PROMPT 00/02 (ver `docs/security.md`/`docs/database.md`, secciones de PROMPT 03) |
| PROMPT 03 | Hashing de contraseñas con Argon2id (`argon2`), no bcrypt | Confirmado |
| PROMPT 03 | Guard de autenticación implementado a mano con `@nestjs/jwt` (sin Passport/`passport-jwt`) | Confirmado — menos dependencias, control total sobre el formato de error, suficientemente idiomático en NestJS |
| PROMPT 03 | CSRF de doble envío de cookie aplicado a `/auth/refresh` **y** `/auth/logout` (no solo refresh como decía el punto 9 original) | Confirmado |
| PROMPT 03 | Autorización por propiedad de recurso: abstracción (`assertOwnsResource`) preparada y probada, sin endpoints de negocio a los que aplicarla todavía | Confirmado — se conecta a partir de PROMPT 04 |
| PROMPT 03 | `prisma@8` (rc) evaluado como alternativa al bloqueo de `binaries.prisma.sh` | Descartado — la CLI de v8 reestructura todo en torno a "Prisma Platform" y ya no tiene un comando `generate` clásico; se mantiene `prisma@^5.20.0` |
