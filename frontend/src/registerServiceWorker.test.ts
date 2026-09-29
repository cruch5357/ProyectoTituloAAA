import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PROMPT 16 — PWA instalable (RF-30).
//
// `virtual:pwa-register` es un módulo virtual que solo existe cuando el
// plugin vite-plugin-pwa está activo dentro de un build/preview real de
// Vite. Vitest no lo resuelve por su cuenta, así que se mockea acá para
// poder probar `registerServiceWorker()` de forma aislada, sin depender de
// un build de producción.
const registerSWMock = vi.fn();

vi.mock('virtual:pwa-register', () => ({
  registerSW: registerSWMock,
}));

describe('registerServiceWorker', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(
    window.navigator,
    'serviceWorker',
  );

  beforeEach(() => {
    vi.resetModules();
    registerSWMock.mockReset();
  });

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(window.navigator, 'serviceWorker', originalServiceWorker);
    } else {
      // @ts-expect-error -- jsdom no define `serviceWorker` de forma nativa.
      delete window.navigator.serviceWorker;
    }
  });

  it('no intenta registrar el service worker si el navegador no lo soporta', async () => {
    // @ts-expect-error -- simula un navegador sin soporte de Service Worker.
    delete window.navigator.serviceWorker;

    const { registerServiceWorker } = await import('./registerServiceWorker');
    registerServiceWorker();

    // Al no existir `navigator.serviceWorker`, ni siquiera se debe intentar
    // el import dinámico de `virtual:pwa-register`.
    await Promise.resolve();
    expect(registerSWMock).not.toHaveBeenCalled();
  });

  it('registra el service worker cuando el navegador lo soporta', async () => {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: {},
      configurable: true,
    });

    const { registerServiceWorker } = await import('./registerServiceWorker');
    registerServiceWorker();

    // El registro ocurre dentro de un `.then()` del import dinámico, así
    // que hay que esperar un tick antes de verificar la llamada.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(registerSWMock).toHaveBeenCalledWith({ immediate: true });
  });

  it('no lanza una excepción si el registro del service worker falla', async () => {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: {},
      configurable: true,
    });
    registerSWMock.mockImplementation(() => {
      throw new Error('registro fallido');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { registerServiceWorker } = await import('./registerServiceWorker');
    expect(() => registerServiceWorker()).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
