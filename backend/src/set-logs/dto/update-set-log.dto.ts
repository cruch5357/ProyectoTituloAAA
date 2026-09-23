import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// PATCH /set-logs/:id — edición de una serie ya registrada, dentro de la
// ventana de 24h de RF-24 (ver common/training/edit-window.ts). No permite
// cambiar `sessionExerciseId`/`setNumber` (identidad de la serie): solo los
// valores realmente ejecutados, con los mismos rangos que
// CreateSetLogItemDto.
export class UpdateSetLogDto {
  @ApiPropertyOptional({ example: 10, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualReps?: number;

  @ApiPropertyOptional({ example: 62.5, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualLoad?: number;

  @ApiPropertyOptional({ example: 8, minimum: 0, maximum: 10 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(10)
  actualRpe?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualRir?: number;

  @ApiPropertyOptional({ example: 'Corrección: fueron 10 reps, no 8.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comments?: string;
}
