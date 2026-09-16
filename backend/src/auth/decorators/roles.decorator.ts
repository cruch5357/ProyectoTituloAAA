import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ROLES_METADATA_KEY } from '../auth.constants';

// Decorador de autorización por rol (docs/security.md, autorización basada
// en roles). Se usa siempre junto a JwtAuthGuard + RolesGuard, en ese orden:
// `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.COACH)`.
// Recibe siempre el enum `Role` generado por Prisma, nunca un string suelto.
export const Roles = (...roles: Role[]) =>
  SetMetadata(ROLES_METADATA_KEY, roles);
