import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

// Campos alineados con el modelo Block (schema.prisma, PROMPT 02): nombre y
// orden dentro del programa. `order` es opcional: si se omite, el servicio
// lo asigna automaticamente al final (docs/database.md: `@@unique([programId,
// order])`); si se envía, el servicio inserta en esa posición y corre el
// resto (ver BlocksService.create — operación atómica con
// `Prisma.$transaction`).
export class CreateBlockDto {
  @ApiProperty({ example: 'Bloque 1 - Acumulación' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}
