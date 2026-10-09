// Connection/authentication only. Never calls sendMail or prints transport errors.
const path = require('node:path');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env'), quiet: true });
async function main() {
  const env = process.env;
  if (env.CI || env.NODE_ENV === 'test') {
    console.log('SKIP: SMTP real deshabilitado en tests/CI.');
    return;
  }
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || ['demo', 'change-me'].includes(env.SMTP_PASSWORD) || ['localhost', '127.0.0.1'].includes(env.SMTP_HOST)) {
    console.log('SKIP: Verificación SMTP real pendiente por falta de credenciales locales.');
    return;
  }
  const transport = require('../backend/node_modules/nodemailer').createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: false, requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, logger: false, debug: false,
  });
  try {
    await transport.verify();
    console.log('SMTP verify OK: conexión/autenticación válidas. No se enviaron emails.');
  } catch {
    console.error('SMTP verify falló: comprueba red, configuración y credenciales. No se enviaron emails.');
    process.exitCode = 1;
  } finally { transport.close(); }
}
main();
