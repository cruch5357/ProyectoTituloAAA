import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Identico en espiritu a ProgramIdRouteParamDto de blocks/ (PROMPT 08):
// cada modulo declara su propio DTO de parametro de ruta del padre en vez
// de importar el de otro modulo, siguiendo el mismo criterio de
// independencia entre modulos ya establecido en weeks/sessions/
// session-exercises. Valida el formato de cuid ANTES de tocar la base de
// datos (prevencion de IDOR/BOLA).
export class ProgramIdRouteParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'id con formato inválido' })
  programId: string;
}
