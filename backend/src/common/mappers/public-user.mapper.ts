import { User } from '@prisma/client';

// Forma pública de un usuario, expuesta en respuestas HTTP. Nunca incluye
// passwordHash, tokenVersion ni ningún otro dato interno (docs/security.md,
// puntos 1 y 17; requisito explícito de PROMPT 03 en login/register/me).
export interface PublicUser {
  id: string;
  email: string;
  role: User['role'];
  name: string;
  isActive: boolean;
  coachId: string | null;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    isActive: user.isActive,
    coachId: user.coachId,
    createdAt: user.createdAt,
  };
}
