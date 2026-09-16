import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { CSRF_COOKIE, CSRF_HEADER } from '../auth.constants';

function buildContext(cookies: any, headers: any): ExecutionContext {
  const request: any = { cookies, headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('rechaza si falta la cookie CSRF', () => {
    const ctx = buildContext({}, { [CSRF_HEADER]: 'valor' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rechaza si falta el header CSRF', () => {
    const ctx = buildContext({ [CSRF_COOKIE]: 'valor' }, {});
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rechaza si la cookie y el header no coinciden', () => {
    const ctx = buildContext(
      { [CSRF_COOKIE]: 'valor-a' },
      { [CSRF_HEADER]: 'valor-b' },
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('permite el acceso si la cookie y el header coinciden exactamente', () => {
    const ctx = buildContext(
      { [CSRF_COOKIE]: 'mismo-valor' },
      { [CSRF_HEADER]: 'mismo-valor' },
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
