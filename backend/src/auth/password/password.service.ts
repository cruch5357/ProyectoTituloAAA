import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

// Hashing de contraseñas (docs/security.md, punto 13).
//
// Decisión de implementación: Argon2id en vez de bcrypt. Justificación:
// Argon2id es la opción explícitamente preferida por docs/security.md
// ("bcrypt (costo >= 12) o argon2id"), es resistente tanto a ataques por
// GPU/ASIC (a diferencia de bcrypt) como a ataques de canal lateral (a
// diferencia de Argon2i puro), y la librería `argon2` (bindings nativos)
// funciona en este sandbox sin depender de binarios descargados en tiempo
// de instalación bloqueados por red (se verificó explícitamente: ver
// informe de PROMPT 03). Se usan los parámetros por defecto del paquete
// (`argon2id`, m=65536 KiB, t=3, p=4), que ya cumplen las recomendaciones
// actuales de OWASP para uso interactivo.
//
// Funciones separadas (hashPassword/verifyPassword) según lo pedido en
// PROMPT 03, para que ningún llamador necesite conocer el algoritmo
// concreto ni sus parámetros.
@Injectable()
export class PasswordService {
  async hashPassword(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, { type: argon2.argon2id });
  }

  async verifyPassword(
    passwordHash: string,
    plainPassword: string,
  ): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, plainPassword);
    } catch {
      // Un hash corrupto o con formato inesperado nunca debe lanzar hacia
      // arriba ni filtrar detalle: se trata como contraseña inválida.
      return false;
    }
  }
}
