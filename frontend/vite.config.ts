import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// `defineConfig` viene de 'vitest/config' (en vez de 'vite') únicamente para
// obtener el tipado del bloque `test` de abajo — sigue siendo exactamente el
// mismo defineConfig de Vite por debajo (vitest/config lo re-exporta
// extendido), así que `vite`/`vite build` no cambian de comportamiento.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
