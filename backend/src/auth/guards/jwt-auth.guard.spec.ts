import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from '../tokens/token.service';
import { PrismaService } from '../../prisma/prisma.service';

function buildContext(headers: Record<string, string> = {}): ExecutionContext {
  const request: any = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let tokenService: jest.Mocked<TokenService>;
  let prisma: { user: { findUnique: jest.Mock } };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    tokenService = {
      verifyAccessToken: jest.fn(),
    } as unknown as jest.Mocked<TokenService>;
    prisma = { user: { findUnique: jest.fn() } };
    guard = new JwtAuthGuard(tokenService, prisma as unknown as PrismaService);
  });

  it('rechaza cuando no hay header Authorization', async () => {
    const ctx = buildContext({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un header que no es Bearer', async () => {
    const ctx = buildContext({ authorization: 'Basic abc123' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un token inválido o alterado (firma no verifica)', async () => {
    tokenService.verifyAccessToken.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const ctx = buildContext({ authorization: 'Bearer token-alterado' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un token expirado', async () => {
    tokenService.verifyAccessToken.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const ctx = buildContext({ authorization: 'Bearer token-expirado' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza cuando el usuario del token ya no existe', async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      role: Role.COACH,
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue(null);
    const ctx = buildContext({ authorization: 'Bearer token-valido' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza cuando el usuario está inactivo', async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      role: Role.COACH,
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@a.com',
      role: Role.COACH,
      name: 'A',
      coachId: null,
      isActive: false,
    });
    const ctx = buildContext({ authorization: 'Bearer token-valido' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('acepta un token válido de un usuario activo y adjunta request.user (nunca con passwordHash)', async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      role: Role.COACH,
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@a.com',
      role: Role.COACH,
      name: 'A',
      coachId: null,
      isActive: true,
      passwordHash: 'no-deberia-llegar-a-request-user',
    });

    const request: any = { headers: { authorization: 'Bearer token-valido' } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const allowed = await guard.canActivate(ctx);

    expect(allowed).toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      email: 'a@a.com',
      role: Role.COACH,
      name: 'A',
      coachId: null,
    });
    expect(request.user).not.toHaveProperty('passwordHash');
  });
});
