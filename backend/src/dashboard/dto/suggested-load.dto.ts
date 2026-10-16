import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class SuggestedLoadRouteParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'studentId con formato inválido' })
  studentId: string;

  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'exerciseId con formato inválido' })
  exerciseId: string;
}

export class SuggestedLoadQueryDto {
  @ApiPropertyOptional({
    description:
      'Repeticiones para las que se sugiere la carga (por defecto, las de la última serie registrada)',
    minimum: 1,
    maximum: 15,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(15)
  targetReps?: number;
}
