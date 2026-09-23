import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Edición parcial (PATCH /session-exercises/:id). Permite además cambiar
// `exerciseId` (ej. el coach decide reemplazar el ejercicio de ese lugar en
// la sesión, manteniendo el mismo `order` y la misma prescripción) —
// SessionExercisesService revalida que el nuevo ejercicio también pertenezca
// al coach autenticado, igual que en la creación.
export class UpdateSessionExerciseDto {
  @ApiPropertyOptional({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, { message: 'exerciseId con formato inválido' })
  exerciseId?: string;

  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @ApiPropertyOptional({ example: 4, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetSets?: number;

  @ApiPropertyOptional({ example: 8, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetRepsMin?: number;

  @ApiPropertyOptional({ example: 12, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetRepsMax?: number;

  @ApiPropertyOptional({ example: 8, minimum: 0, maximum: 10 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(10)
  targetRpe?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetRir?: number;

  @ApiPropertyOptional({ example: 90, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  restSeconds?: number;

  @ApiPropertyOptional({ example: 'Tempo controlado en la fase excéntrica.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
