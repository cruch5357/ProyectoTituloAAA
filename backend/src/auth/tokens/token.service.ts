import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';
import { User } from '@prisma/client';
import {
  JWT_CLAIM_ROLE,
  JWT_CLAIM_SUBJECT,
  JWT_CLAIM_TOKEN_VERSION,
} from '../auth.constants';

export interface AccessTokenClaims {
  [JWT_CLAIM_SUBJECT]: string;
  [JWT_CLAIM_ROLE]: string;
  [JWT_CLAIM_TOKEN_VERSION]: number;
  iat?: number;
  exp?: number;
}

// Servicio de tokens de autenticación (docs/security.md, puntos 1 y 12).
//
// Decisiones de implementación:
// - El ACCESS TOKEN es un JWT firmado (HS256 vía @nestjs/jwt), de vida
//   corta, verificado solo por firma/expiración (sin consulta a la base de
//   datos en cada request: es precisamente lo que lo hace "stateless" y
//   barato de validar). Claims mínimos: sub (id de usuario), role,
//   tokenVersion y expiración — nunca password ni datos innecesarios.
// - El REFRESH TOKEN NO es un JWT: es un valor aleatorio opaco de alta
//   entropía (32 bytes / 256 bits). Solo se almacena su hash SHA-256 en
//   `RefreshSession.tokenHash` (nunca el valor en texto plano), igual que
//   los tokens de invitación. Se eligió un token opaco en vez de un JWT de
//   refresh porque su validez real siempre depende de una fila en la base
//   de datos (para poder revocar/rotar/detectar reuso, ver AuthService):
//   un JWT de refresh agregaría una segunda fuente de verdad (firma +
//   expiración propia) sin aportar nada, ya que de todos modos hay que
//   golpear la base de datos para rotar/revocar. Un token opaco de alta
//   entropía es indistinguible en la práctica de un JWT en cuanto a
//   seguridad, y es más simple.
// - SHA-256 (no Argon2id) para hashear refresh tokens y tokens de
//   invitación: a diferencia de una contraseña elegida por una persona,
//   estos valores ya tienen 256 bits de entropía aleatoria genuina, por lo
//   que no son vulnerables a ataques de diccionario/fuerza bruta offline
//   razonables; un hash rápido es preferible aquí (no hay razón para pagar
//   el costo computacional de Argon2id en cada validación de refresh).
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccessToken(user: Pick<User, 'id' | 'role' | 'tokenVersion'>): string {
    const claims: Omit<AccessTokenClaims, 'iat' | 'exp'> = {
      [JWT_CLAIM_SUBJECT]: user.id,
      [JWT_CLAIM_ROLE]: user.role,
      [JWT_CLAIM_TOKEN_VERSION]: user.tokenVersion,
    };
    return this.jwtService.sign(claims, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      // `expiresIn` en @nestjs/jwt tipa como `number | StringValue` (un tipo
      // literal de plantilla de la librería `ms`), más estricto que el
      // `string` genérico que devuelve ConfigService para una variable de
      // entorno. El valor es válido en tiempo de ejecución (ej. "15m"); el
      // cast es solo para conciliar el tipo, no cambia el comportamiento.
      expiresIn: this.configService.get<string>(
        'JWT_ACCESS_EXPIRES_IN',
      ) as unknown as number,
    });
  }

  /**
   * Verifica firma y expiración del access token. Lanza si es inválido,
   * expirado o fue alterado (firma no coincide) — nunca confía en el
   * contenido del token sin verificar (docs/security.md, guard de auth).
   */
  verifyAccessToken(token: string): AccessTokenClaims {
    return this.jwtService.verify<AccessTokenClaims>(token, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  /** Genera un refresh token opaco (valor real, se entrega una única vez). */
  generateRefreshToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashOpaqueToken(token) };
  }

  /** Genera un token de invitación de alumno opaco (valor real, una vez). */
  generateInvitationToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashOpaqueToken(token) };
  }

  /** Hash determinístico (SHA-256) usado para buscar/comparar tokens opacos. */
  hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  getRefreshTokenExpiresAt(): Date {
    return new Date(
      Date.now() +
        this.parseDurationMs(
          this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
        ),
    );
  }

  getInvitationExpiresAt(): Date {
    const hours =
      this.configService.get<number>('INVITATION_EXPIRES_IN_HOURS') ?? 168;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  /**
   * Parser mínimo de duraciones tipo "15m"/"7d"/"3600s" para no agregar una
   * dependencia extra solo para esto (ya usamos el mismo formato de string
   * para @nestjs/jwt, que internamente sí trae su propio parser vía `ms`).
   */
  private parseDurationMs(duration: string): number {
    const match = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(duration.trim());
    if (!match) {
      throw new Error(`Duración de token inválida: "${duration}"`);
    }
    const value = Number(match[1]);
    const unit = (match[2] ?? 'ms').toLowerCase();
    const factors: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * factors[unit];
  }
}
