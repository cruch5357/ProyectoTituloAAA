// Registro del service worker de la PWA (PROMPT 16 - RF-30).
//
// Este módulo se limita a registrar el service worker que genera
// vite-plugin-pwa (estrategia `generateSW` de Workbox) para que la
// aplicación sea instalable. No implementa offline-first ni cachea
// información de negocio: eso queda fuera del alcance de este prompt
// (ver docs/architecture.md, sección PWA).
//
// `virtual:pwa-register` es un módulo virtual que solo existe cuando el
// plugin PWA está activo (build/preview). En `vite dev` esta función no se
// invoca (ver `main.tsx`), por lo que el import dinámico nunca se resuelve
// en ese modo.
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch((error: unknown) => {
      // El registro del service worker nunca debe romper la aplicación
      // (por ejemplo, si el navegador no lo soporta completamente).
      console.error('No se pudo registrar el service worker de la PWA.', error);
    });
}
