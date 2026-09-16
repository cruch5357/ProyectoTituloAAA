import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../guards/jwt-auth.guard';

// ---------------------------------------------------------------------------
// Autorización sobre recursos/objetos — PREPARADA, NO IMPLEMENTADA SOBRE
// RECURSOS CONCRETOS TODAVÍA (docs/security.md, puntos 3, 4 y 5).
//
// PROMPT 03 solo agrega autenticación + rol. Ningún endpoint de negocio
// (alumnos, ejercicios, programas, sesiones, registros de entrenamiento)
// existe todavía, así que no hay ningún recurso real sobre el cual aplicar
// esta capa hoy. Este archivo deja preparada la abstracción que los
// prompts futuros (04+) deben usar en la capa de SERVICIO (nunca solo en
// el guard, y nunca confiando en el frontend) para no reinventar el
// patrón en cada módulo nuevo.
//
// Principio (idéntico para todos los recursos futuros): el id del usuario
// autenticado sale siempre de `request.user` (poblado por JwtAuthGuard a
// partir del JWT ya verificado), nunca de un parámetro de ruta, query o
// body. El recurso solicitado se carga primero, y luego se compara su
// `coachId`/`studentId` contra `user.id` (o, si el que consulta es el
// coach del alumno dueño del recurso, contra `user.id === recurso.coachId`).
//
// Casos de prueba obligatorios documentados en PROMPT 03 (a implementar
// junto con cada recurso real en prompts futuros):
//   - Alumno A no puede leer ni escribir WorkoutLog de Alumno B, aunque
//     conozca su id (docs/security.md, punto 4).
//   - Coach A no puede leer ni escribir Program/Exercise de Coach B, aunque
//     conozca su id (docs/security.md, punto 5).
//
// Ejemplo de uso previsto en un servicio futuro (ilustrativo, no real):
//
//   const program = await this.prisma.program.findUnique({ where: { id } });
//   if (!program) throw new NotFoundException();
//   assertOwnsResource(currentUser, { coachId: program.coachId });
//   // recién acá se procede con la operación sobre `program`.
//
// Se usa NotFoundException (no ForbiddenException) cuando informar que el
// recurso EXISTE ya es una fuga de información (docs/api.md, sección 5) —
// esa decisión la toma cada servicio de negocio, no esta función genérica.
// ---------------------------------------------------------------------------

/** Forma mínima común a cualquier recurso "propiedad de" un coach. */
export interface CoachOwnedResource {
  coachId: string;
}

/** Forma mínima común a cualquier recurso "propiedad de" un alumno. */
export interface StudentOwnedResource {
  studentId: string;
}

/**
 * Lanza ForbiddenException si el usuario autenticado no es dueño del
 * recurso según su rol. Un COACH debe ser dueño vía `coachId`; un STUDENT
 * debe ser dueño vía `studentId`. No decide si corresponde 403 o 404 ante
 * el cliente (eso depende del contexto de cada endpoint); el llamador
 * decide si conviene envolver esto o preferir un 404 explícito.
 */
export function assertOwnsResource(
  user: AuthenticatedUser,
  resource: Partial<CoachOwnedResource & StudentOwnedResource>,
): void {
  if (user.role === Role.COACH) {
    if (resource.coachId !== undefined && resource.coachId === user.id) {
      return;
    }
    throw new ForbiddenException('No tiene permisos para esta operación');
  }

  if (user.role === Role.STUDENT) {
    if (resource.studentId !== undefined && resource.studentId === user.id) {
      return;
    }
    throw new ForbiddenException('No tiene permisos para esta operación');
  }

  throw new ForbiddenException('No tiene permisos para esta operación');
}
