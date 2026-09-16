import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { ROLES_METADATA_KEY } from '../auth.constants';

// Guard de rol (docs/security.md; docs/api.md sección 3: "guard de rol").
// Debe aplicarse siempre DESPUÉS de JwtAuthGuard (necesita `request.user`
// ya poblado). Un endpoint sin @Roles(...) no restringe por rol (solo exige
// autenticación, si además tiene JwtAuthGuard).
//
// Importante (recordado explícitamente en PROMPT 03): ocultar una opción en
// el frontend según el rol NO es un control de seguridad. La única barrera
// autoritativa es este guard, evaluado en el servidor.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role as Role)) {
      throw new ForbiddenException('No tiene permisos para esta operación');
    }

    return true;
  }
}
