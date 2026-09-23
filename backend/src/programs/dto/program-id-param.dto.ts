import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Identico en espiritu a ExerciseIdParamDto (PROMPT 07, prevencion de
// IDOR/BOLA): valida el formato de cuid ANTES de tocar la base de datos.
export class ProgramIdParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'id con formato inválido' })
  id: string;
}
