import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Identico en espiritu a StudentIdParamDto (PROMPT 04, prevencion de
// IDOR/BOLA): valida el formato de cuid ANTES de tocar la base de datos. Un
// id con formato invalido responde 400, nunca se interpreta como "no
// encontrado" (404 se reserva para cuando el id tiene forma valida pero el
// ejercicio no existe o pertenece a otro coach — ver ExercisesService).
export class ExerciseIdParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'id con formato inválido' })
  id: string;
}
