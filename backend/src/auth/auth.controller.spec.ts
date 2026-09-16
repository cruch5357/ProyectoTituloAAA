import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

function buildResMock() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as any;
}

describe('AuthController - cookies de sesión', () => {
  let authService: jest.Mocked<AuthService>;
  let config: ConfigService;
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;
    config = { get: jest.fn().mockReturnValue('development') } as any;
    controller = new AuthController(authService, config);
  });

  it('login setea la cookie de refresh como httpOnly + SameSite=Strict, y nunca expone el refresh token en el JSON', async () => {
    const publicUser = {
      id: 'u1',
      email: 'a@a.com',
      role: 'COACH',
      name: 'A',
      isActive: true,
      coachId: null,
      createdAt: new Date(),
    };
    authService.login.mockResolvedValue({
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      refreshExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      user: publicUser as any,
    });

    const req: any = { ip: '127.0.0.1', headers: {} };
    const res = buildResMock();

    const body = await controller.login(
      { email: 'a@a.com', password: 'x' } as any,
      req,
      res,
    );

    expect(JSON.stringify(body)).not.toContain('refresh-token-value');

    const refreshCookieCall = res.cookie.mock.calls.find(
      (c: any[]) => c[0] === 'refresh_token',
    );
    expect(refreshCookieCall).toBeDefined();
    expect(refreshCookieCall[1]).toBe('refresh-token-value');
    expect(refreshCookieCall[2]).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
    });

    const csrfCookieCall = res.cookie.mock.calls.find(
      (c: any[]) => c[0] === 'csrf_token',
    );
    expect(csrfCookieCall).toBeDefined();
    expect(csrfCookieCall[2]).toMatchObject({
      httpOnly: false,
      sameSite: 'strict',
    });
  });

  it('en producción (NODE_ENV=production) la cookie de refresh es Secure', async () => {
    (config.get as jest.Mock).mockReturnValue('production');
    authService.login.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      refreshExpiresAt: new Date(Date.now() + 1000),
      user: {} as any,
    });

    const req: any = { ip: '127.0.0.1', headers: {} };
    const res = buildResMock();
    await controller.login(
      { email: 'a@a.com', password: 'x' } as any,
      req,
      res,
    );

    const refreshCookieCall = res.cookie.mock.calls.find(
      (c: any[]) => c[0] === 'refresh_token',
    );
    expect(refreshCookieCall[2]).toMatchObject({ secure: true });
  });

  it('logout limpia ambas cookies de sesión', async () => {
    authService.logout.mockResolvedValue(undefined);
    const req: any = { cookies: { refresh_token: 'r' } };
    const res = buildResMock();

    await controller.logout(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.any(Object),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'csrf_token',
      expect.any(Object),
    );
  });
});
