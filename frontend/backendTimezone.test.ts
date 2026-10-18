// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBackendTimezone } from './backendTimezone';
import { existsSync, readFileSync } from 'node:fs';

vi.mock('node:fs', () => ({ existsSync: vi.fn(), readFileSync: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe('configuración compartida de zona horaria', () => {
  it('lee la zona sin importar el modo de ejecución del backend a Vite', () => {
    const previous = process.env.VITE_USER_NODE_ENV;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('NODE_ENV=development\nAPP_TIMEZONE=America/Santiago\n');
    expect(readBackendTimezone('production')).toBe('America/Santiago');
    expect(process.env.VITE_USER_NODE_ENV).toBe(previous);
  });
  it('admite proyectos sin archivo local de entorno', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(readBackendTimezone('production')).toBeUndefined();
  });
});
