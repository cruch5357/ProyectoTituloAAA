import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../tokens/token.service';

// Usuario autenticado adjuntado a `req.user`. Nunca incluye passwordHash.
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  name: string;
  coachId: string | null;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

// Guard de autenticación (docs/security.md, autorización basada en roles;
// requisito explícito de PROMPT 03).
//
// Responsabilidades exactas:
// 1. Extraer el Bearer token del header Authorization.
// 2. Verificar firma y expiración (nunca confiar en el payload sin
//    verificar la firma con el secreto del servidor).
// 3. Cargar el usuario real desde la base de datos usando el `sub` del
//    token YA VERIFICADO (nunca un id provisto por el cliente en query,
//    body o cualquier otro lugar) y confirmar que sigue existiendo y activo.
//    Esto acepta el costo de una consulta por request a cambio de poder
//    revocar acceso a un usuario desactivado de inmediato, sin esperar a
//    que expire su access token (hasta 15 minutos); se documenta como una
//    decisión de diseño deliberada, no un descuido.
// 4. Adjuntar el usuario autenticado a `request.user` para que el resto del
//    pipeline (RolesGuard, controllers, futura autorización por recurso)
//    lo use como única fuente de identidad.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('No autenticado');
    }

    let claims;
    try {
      claims = this.tokenService.verifyAccessToken(token);
    } catch {
      // Firma inválida, token alterado o expirado: mismo mensaje genérico
      // en todos los casos (docs/security.md, punto 16).
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('No autenticado');
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      coachId: user.coachId,
    };

    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return null;
    }
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
  }
}
