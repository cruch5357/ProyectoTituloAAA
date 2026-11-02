import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Vite.loadEnv también modifica VITE_USER_NODE_ENV aunque se filtre por prefijo.
// Leer la zona del backend no debe convertir el build web en development.
function readBackendEnv(mode: string, key: string): string | undefined {
  let value: string | undefined;
  for (const name of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    const file = new URL(`../backend/${name}`, import.meta.url);
    if (existsSync(file)) {
      value = parseEnv(readFileSync(file, 'utf8'))[key] ?? value;
    }
  }
  return value;
}

export function readBackendTimezone(mode: string): string | undefined {
  return readBackendEnv(mode, 'APP_TIMEZONE');
}

// Puerto del backend para el proxy de `/api` (por defecto 3000). Permite que
// quien tenga el 3000 ocupado use otro PORT en backend/.env sin tocar Vite.
export function readBackendPort(mode: string): string {
  const port = readBackendEnv(mode, 'PORT');
  return port && /^\d+$/.test(port) ? port : '3000';
}
