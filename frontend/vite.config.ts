import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// `defineConfig` viene de 'vitest/config' (en vez de 'vite') únicamente para
// obtener el tipado del bloque `test` de abajo — sigue siendo exactamente el
// mismo defineConfig de Vite por debajo (vitest/config lo re-exporta
// extendido), así que `vite`/`vite build` no cambian de comportamiento.
// https://vite.dev/config/
const { getAppTimezone } = createRequire(import.meta.url)('../backend/config/app-timezone.cjs')
export default defineConfig(({ mode }) => ({
  define: { __APP_TIMEZONE__: JSON.stringify(getAppTimezone(process.env.APP_TIMEZONE ?? loadEnv(mode, fileURLToPath(new URL('../backend', import.meta.url)), 'APP_TIMEZONE').APP_TIMEZONE)) },
  plugins: [
    react(),
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
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
