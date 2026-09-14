# Tests end-to-end (cross-cutting)

Esta carpeta está preparada para las pruebas E2E que ejercitan frontend y
backend en conjunto (ver `docs/testing.md`), por ejemplo con Playwright:
login, creación de un programa, registro de una sesión, importación de
Excel.

**Estado actual (PROMPT 01):** carpeta preparada, sin herramienta instalada
todavía. Se incorpora Playwright (u otra herramienta equivalente) cuando
exista al menos un flujo de negocio completo que probar de extremo a
extremo (a partir de la etapa de autenticación, según `docs/roadmap.md`).

Las pruebas unitarias y de integración de cada aplicación viven junto a su
código: `frontend/src/**` y `backend/src/**` / `backend/test/**`.
