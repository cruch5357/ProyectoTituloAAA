import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerServiceWorker } from './registerServiceWorker';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// El service worker (PWA, PROMPT 16 / RF-30) solo se registra en
// producción (build/preview). En `vite dev` no existe el módulo virtual
// que genera vite-plugin-pwa, así que registrarlo ahí no tendría efecto
// y además complicaría el ciclo de desarrollo habitual (HMR, etc.).
if (import.meta.env.PROD) {
  registerServiceWorker();
}
