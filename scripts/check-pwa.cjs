// Requiere `npm run pwa:mobile` y los navegadores de Playwright instalados.
const { chromium, webkit } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { X509Certificate, createHash } = require('node:crypto');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const base = process.env.PWA_BASE_URL ?? 'https://localhost:4173';
const certificate = new X509Certificate(fs.readFileSync(resolve(root, '.certs/local.pem')));
const spki = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');

(async () => {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    // Solo este proceso de pruebas confía en el certificado local.
    const browser = await engine.launch(name === 'chromium' ? { args: [`--ignore-certificate-errors-spki-list=${spki}`] } : {});
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/login`);
      await page.getByRole('heading', { name: 'Iniciar sesión', exact: true }).waitFor();
      const firstPaint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 30000 });
      assert.equal(await page.evaluate(() => isSecureContext), true);
      const manifest = await (await context.request.get(`${base}/manifest.webmanifest`)).json();
      assert.equal(manifest.start_url, '/');
      assert.equal(manifest.display, 'standalone');
      // Un arranque posterior se sirve desde el shell, incluso sin red.
      await context.setOffline(true);
      await page.goto(`${base}/login`);
      await page.getByRole('heading', { name: 'Iniciar sesión', exact: true }).waitFor();
      const privateCacheEntries = await page.evaluate(async () => {
        const requests = (await Promise.all((await caches.keys()).map(async (key) => (await caches.open(key)).keys()))).flat();
        return requests.filter((request) => new URL(request.url).pathname.startsWith('/api/')).length;
      });
      assert.equal(privateCacheEntries, 0);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ engine: name, firstContentfulPaintMs: firstPaint, serviceWorker: true, offlineShell: true, privateCacheEntries }));
      await context.close();

      // Un bundle que no llega no deja una pantalla vacía.
      const failed = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
      const failurePage = await failed.newPage();
      await failurePage.route('**/assets/*.js', (route) => route.abort());
      await failurePage.goto(base);
      await failurePage.getByRole('heading', { name: 'Entrenamiento', exact: true }).waitFor();
      await failurePage.getByRole('button', { name: 'Volver a intentar' }).waitFor({ timeout: 15000 });
      console.log(`${name}: recuperación visible cuando falla el bundle`);
      await failed.close();
    } finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
