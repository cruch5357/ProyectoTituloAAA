import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

// `number` es el número visible para el usuario (ej. "Semana 3"), distinto
// de `order` (posición de presentación) — mismo criterio ya documentado en
// el comentario del modelo Week (schema.prisma, PROMPT 02). `order` es
// opcional: igual que en CreateBlockDto, si se omite se asigna al final.
export class CreateWeekDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  number: number;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}
