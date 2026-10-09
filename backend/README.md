# Backend

API NestJS 10 + Prisma/PostgreSQL. Configurar `.env` desde `.env.example` y seguir [demo local](../docs/local-demo.md).

Desde la raíz: `npm run dev:backend`. Desde backend: `npm run start:dev`, `npm run lint:check`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand`, `npm run build`.

[API](../docs/api.md), [base de datos](../docs/database.md), [testing](../docs/testing.md). Las pruebas HTTP con BD requieren un destino exclusivo y COACHING_E2E_DATABASE_URL. No usar migrate reset sobre datos existentes.
