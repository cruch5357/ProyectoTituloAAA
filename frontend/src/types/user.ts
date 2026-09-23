// Forma de usuario expuesta por el backend (ver
// backend/src/common/mappers/public-user.mapper.ts). Nunca incluye
// passwordHash ni tokenVersion — el backend ya garantiza eso, el frontend
// simplemente no declara esos campos.
export type UserRole = 'COACH' | 'STUDENT';

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  isActive: boolean;
  coachId: string | null;
  createdAt: string; // ISO 8601 (las fechas viajan como string sobre JSON)
}
