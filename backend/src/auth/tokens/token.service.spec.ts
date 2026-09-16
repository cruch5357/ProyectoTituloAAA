import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { TokenService } from './token.service';

function buildConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    JWT_ACCESS_SECRET: 'test-access-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    INVITATION_EXPIRES_IN_HOURS: 168,
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('TokenService', () => {
  it('firma y verifica un access token válido con los claims mínimos', () => {
    const service = new TokenService(new JwtService(), buildConfig());
    const token = service.signAccessToken({
      id: 'user-1',
      role: Role.COACH,
      tokenVersion: 0,
    });
    const claims = service.verifyAccessToken(token);
    expect(claims.sub).toBe('user-1');
    expect(claims.role).toBe(Role.COACH);
    expect(claims.tokenVersion).toBe(0);
    // Nunca debe incluir password ni ningún dato adicional no declarado.
    expect(Object.keys(claims).sort()).toEqual(
      ['exp', 'iat', 'role', 'sub', 'tokenVersion'].sort(),
    );
  });

  it('rechaza un access token con firma inválida (alterado/tampered)', () => {
    const service = new TokenService(new JwtService(), buildConfig());
    const token = service.signAccessToken({
      id: 'user-1',
      role: Role.COACH,
      tokenVersion: 0,
    });
    const tampered = token.slice(0, -2) + 'xx';
    expect(() => service.verifyAccessToken(tampered)).toThrow();
  });

  it('rechaza un access token expirado', () => {
    const service = new TokenService(
      new JwtService(),
      buildConfig({ JWT_ACCESS_EXPIRES_IN: '1ms' }),
    );
    const token = service.signAccessToken({
      id: 'user-1',
      role: Role.STUDENT,
      tokenVersion: 0,
    });
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(() => service.verifyAccessToken(token)).toThrow();
        resolve();
      }, 20);
    });
  });

  it('rechaza un access token firmado con un secreto distinto', () => {
    const service = new TokenService(new JwtService(), buildConfig());
    const otherService = new TokenService(
      new JwtService(),
      buildConfig({ JWT_ACCESS_SECRET: 'otro-secreto-distinto' }),
    );
    const token = otherService.signAccessToken({
      id: 'user-1',
      role: Role.COACH,
      tokenVersion: 0,
    });
    expect(() => service.verifyAccessToken(token)).toThrow();
  });

  it('genera refresh tokens opacos con hash SHA-256 determinístico', () => {
    const service = new TokenService(new JwtService(), buildConfig());
    const { token, tokenHash } = service.generateRefreshToken();
    expect(token.length).toBeGreaterThan(20);
    expect(tokenHash).toEqual(service.hashOpaqueToken(token));
    // El hash nunca debe ser igual al token en texto plano.
    expect(tokenHash).not.toEqual(token);
  });

  it('genera un refresh token distinto en cada llamada', () => {
    const service = new TokenService(new JwtService(), buildConfig());
    const a = service.generateRefreshToken();
    const b = service.generateRefreshToken();
    expect(a.token).not.toEqual(b.token);
    expect(a.tokenHash).not.toEqual(b.tokenHash);
  });

  it('calcula la expiración del refresh token según JWT_REFRESH_EXPIRES_IN', () => {
    const service = new TokenService(
      new JwtService(),
      buildConfig({ JWT_REFRESH_EXPIRES_IN: '1h' }),
    );
    const expiresAt = service.getRefreshTokenExpiresAt();
    const deltaMs = expiresAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(59 * 60 * 1000);
    expect(deltaMs).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('calcula la expiración de la invitación según INVITATION_EXPIRES_IN_HOURS', () => {
    const service = new TokenService(
      new JwtService(),
      buildConfig({ INVITATION_EXPIRES_IN_HOURS: 24 }),
    );
    const expiresAt = service.getInvitationExpiresAt();
    const deltaMs = expiresAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(deltaMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});
