import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function buildContext(user?: { role: Role }): ExecutionContext {
  const request: any = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('permite el acceso si el endpoint no declara @Roles(...)', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(buildContext({ role: Role.STUDENT }))).toBe(true);
  });

  it('rechaza a un STUDENT en un endpoint restringido a COACH', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.COACH]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() =>
      guard.canActivate(buildContext({ role: Role.STUDENT })),
    ).toThrow(ForbiddenException);
  });

  it('rechaza a un COACH en un endpoint restringido a STUDENT', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.STUDENT]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(buildContext({ role: Role.COACH }))).toThrow(
      ForbiddenException,
    );
  });

  it('permite el acceso cuando el rol del usuario está en la lista requerida', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.COACH]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(buildContext({ role: Role.COACH }))).toBe(true);
  });

  it('rechaza si no hay usuario autenticado en la request', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.COACH]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
