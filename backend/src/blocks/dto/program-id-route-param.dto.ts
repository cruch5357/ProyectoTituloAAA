import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Valida el `:programId` de rutas anidadas (`GET/POST /programs/:programId/
// blocks`) contra el formato de cuid ANTES de tocar la base de datos —
// mismo criterio de prevención de IDOR/BOLA que ProgramIdParamDto.
export class ProgramIdRouteParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'programId con formato inválido' })
  programId: string;
}
