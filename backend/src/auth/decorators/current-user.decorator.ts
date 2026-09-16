import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../guards/jwt-auth.guard';

// Extrae el usuario autenticado adjuntado por JwtAuthGuard. Nunca debe
// usarse en un endpoint que no tenga JwtAuthGuard aplicado (en ese caso
// `request.user` sería undefined).
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as AuthenticatedUser;
  },
);
