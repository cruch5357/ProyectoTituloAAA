import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { CSRF_COOKIE, CSRF_HEADER } from '../auth.constants';

// Mitigación CSRF por doble envío de token (docs/security.md, punto 9).
//
// Se aplica únicamente a los endpoints que dependen de una cookie para
// autenticar la acción: `/auth/refresh` (lee el refresh token de la cookie
// httpOnly) y, por la misma razón, `/auth/logout` (también actúa sobre esa
// cookie). El resto de la API usa el access token en el header
// `Authorization`, que no es susceptible a CSRF clásico porque un sitio de
// terceros no puede leer ni adjuntar ese header por sí solo.
//
// SameSite=Strict en la cookie de refresh ya mitiga la mayoría de los
// escenarios de CSRF (docs/security.md); este guard es una capa adicional
// de defensa en profundidad, deliberadamente NO removida solo porque
// SameSite=Strict esté presente (instrucción explícita de PROMPT 03), para
// cubrir escenarios donde SameSite pudiera no aplicarse (navegadores muy
// antiguos, configuraciones no estándar, subdominios, etc.).
//
// Mecanismo: al hacer login/refresh exitoso, el backend también setea una
// cookie NO httpOnly (`csrf_token`) con un valor aleatorio independiente
// del refresh token. El frontend debe leer esa cookie con JavaScript y
// repetir su valor en el header `X-CSRF-Token`. Un sitio de terceros puede
// hacer que el navegador envíe la cookie automáticamente, pero no puede
// leer su valor (política de mismo origen) para replicarlo en el header.
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const cookieValue = request.cookies?.[CSRF_COOKIE];
    const headerValue = request.headers[CSRF_HEADER];

    if (
      typeof cookieValue !== 'string' ||
      typeof headerValue !== 'string' ||
      cookieValue.length === 0 ||
      !this.safeEqual(cookieValue, headerValue)
    ) {
      throw new ForbiddenException('Validación CSRF fallida');
    }

    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
