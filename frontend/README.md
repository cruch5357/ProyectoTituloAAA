# Frontend

PWA React 19 + TypeScript + Vite 8. Configurar `.env.local` desde `.env.example` y seguir [demo local](../docs/local-demo.md).

Desde la raíz: `npm run dev:frontend`. Desde frontend: `npm run dev`, `npm run lint:check`, `npm test`, `npm run build`, `npm run preview`.

El service worker solo se registra en build/preview; no cachea respuestas API ni permite ejecución offline. La autorización efectiva pertenece al backend. Ver [arquitectura](../docs/architecture.md) y [testing](../docs/testing.md).
