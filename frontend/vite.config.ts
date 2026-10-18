import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { readBackendTimezone } from './backendTimezone.ts'
import type { Plugin, Connect } from 'vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// `defineConfig` viene de 'vitest/config' (en vez de 'vite') únicamente para
// obtener el tipado del bloque `test` de abajo — sigue siendo exactamente el
// mismo defineConfig de Vite por debajo (vitest/config lo re-exporta
// extendido), así que `vite`/`vite build` no cambian de comportamiento.
// https://vite.dev/config/
const { getAppTimezone } = createRequire(import.meta.url)('../backend/config/app-timezone.cjs')
// Solo los servidores locales de Vite exponen el certificado PUBLICO.
// Las claves privadas permanecen fuera de public/ y nunca entran al build.
const localCertificate = (): Plugin => {
  const download: Connect.NextHandleFunction = (request, response, next) => {
    const certificate = new URL('../.certs/local-ca.cer', import.meta.url);
    if (request.url !== '/local-ca.cer' || request.method !== 'GET' || !existsSync(certificate)) return next();
    response.setHeader('Content-Type', 'application/x-x509-ca-cert');
    response.setHeader('Content-Disposition', 'attachment; filename="entrenamiento-local.cer"');
    response.setHeader('Cache-Control', 'no-store');
    response.end(readFileSync(certificate));
  };
  return {
    name: 'local-certificate-download',
    configureServer: (server) => { server.middlewares.use(download); },
    configurePreviewServer: (server) => { server.middlewares.use(download); },
  };
};
export default defineConfig(({ mode }) => ({
  server: {
    host: '0.0.0.0', port: 5173, strictPort: true,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.certs/**'] },
    https: process.env.LOCAL_HTTPS === '1' ? {
      key: readFileSync(new URL('../.certs/local-key.pem', import.meta.url)),
      cert: readFileSync(new URL('../.certs/local.pem', import.meta.url)),
    } : undefined,
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true } },
  },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
  define: { __APP_TIMEZONE__: JSON.stringify(getAppTimezone(process.env.APP_TIMEZONE ?? readBackendTimezone(mode))) },
  plugins: [
    react(),
    localCertificate(),
    // PROMPT 16: PWA instalable (RF-30). Estrategia conservadora:
    // - generateSW (Workbox) solo precachea el shell/estáticos del build
    //   (ver `globPatterns`), NO configuramos `runtimeCaching`, por lo que
    //   NINGUNA respuesta de la API (/api/**) es cacheada por el service
    //   worker. Los tokens, datos de alumnos, WorkoutLog/SetLog, etc. nunca
    //   pasan por Workbox.
    // - `navigateFallbackDenylist` refuerza que las rutas /api/** nunca
    //   reciban el fallback de navegación SPA (index.html).
    // - `devOptions.enabled: false` (default): el service worker NO se
    //   registra en `vite dev`, solo en build/preview.
    // - `injectRegister: false`: el registro se hace a mano en
    //   `src/main.tsx` usando `virtual:pwa-register`, para poder controlar
    //   exactamente cuándo se registra (solo en producción).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      devOptions: {
        enabled: false,
      },
      includeAssets: ['favicon.svg'],
      manifest: {
        id: '/',
        name: 'Plataforma de Entrenamiento',
        short_name: 'Entrenamiento',
        description:
          'Plataforma de gestión y seguimiento de entrenamiento personalizado para coaches y alumnos.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1f2937',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Solo se precachean los artefactos estáticos generados por el
        // build (JS/CSS/HTML/íconos). Nunca se agregan `runtimeCaching`
        // entries para /api/**, así que Workbox no intercepta ni
        // almacena respuestas de la API.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,woff,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))

