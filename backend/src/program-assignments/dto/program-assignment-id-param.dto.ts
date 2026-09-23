import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Identico en espiritu a ProgramIdParamDto/BlockIdParamDto (PROMPT 08):
// valida el formato de cuid del :id de la propia asignacion ANTES de tocar
// la base de datos.
export class ProgramAssignmentIdParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'id con formato inválido' })
  id: string;
}
