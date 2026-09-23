import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Validación de formato del `:id` de ruta (PROMPT 04, punto 21 — prevención
// de IDOR/BOLA: nunca se usa un id de cliente "tal cual" sin validar su
// forma antes de consultarlo). `prisma/schema.prisma` genera todos los ids
// con `@default(cuid())` (ver comentario en la línea 11 de ese archivo): el
// cuid "clásico" que genera Prisma 5 siempre empieza con 'c' y tiene 25
// caracteres en total, alfanuméricos en minúscula. Un id que no cumple este
// formato se rechaza con 400 antes de tocar la base de datos — nunca se
// interpreta como "no encontrado" (404), porque ese código se reserva para
// cuando el id SÍ tiene forma válida pero el recurso no existe o no
// pertenece al coach autenticado (ver StudentsService).
export class StudentIdParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'id con formato inválido' })
  id: string;
}
