import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Vite.loadEnv también modifica VITE_USER_NODE_ENV aunque se filtre por prefijo.
// Leer la zona del backend no debe convertir el build web en development.
export function readBackendTimezone(mode: string): string | undefined {
  let timezone: string | undefined;
  for (const name of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    const file = new URL(`../backend/${name}`, import.meta.url);
    if (existsSync(file)) {
      timezone = parseEnv(readFileSync(file, 'utf8')).APP_TIMEZONE ?? timezone;
    }
  }
  return timezone;
}
