import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Idéntico en espíritu a `ExerciseIdParamDto`/`StudentIdParamDto`
// (prevención de IDOR/BOLA, PROMPT 04/07): valida el formato de cuid ANTES
// de tocar la base de datos. Un id con formato inválido responde 400, nunca
// se interpreta como "no encontrado" (404 se reserva para cuando el id
// tiene forma válida pero el batch no existe o pertenece a otro coach — ver
// ExcelImportsService.ensureOwnedBatch()).
export class ImportBatchIdParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'id con formato inválido' })
  id: string;
}
