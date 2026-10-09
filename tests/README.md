# Pruebas entre componentes

Los E2E HTTP existentes viven en `backend/test/` (Supertest); coaching-flow prueba PostgreSQL real, ownership, sesiones, multimedia e integridad histórica. Las pruebas de interfaz viven en `frontend/src/` (Vitest/Testing Library).

Esta carpeta no contiene una suite de navegador; Playwright continúa como evaluación futura. Consultar [testing y CI](../docs/testing.md) para comandos y aislamiento de datos.
