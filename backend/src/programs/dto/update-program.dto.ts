import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

// DTO de edicion (PATCH /programs/:id). Todos los campos opcionales, cada
// uno declarado explicitamente (nunca un `Partial<>` generado ni el body
// crudo) — mismo criterio que UpdateExerciseDto (PROMPT 07). Deliberadamente
// NO declara `isActive`: ese campo se modifica unicamente a traves de
// PATCH /programs/:id/status (ver UpdateProgramStatusDto).
export class UpdateProgramDto {
  @ApiPropertyOptional({ example: 'Fuerza - Bloque base' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({
    example: 'Programa de 8 semanas orientado a fuerza máxima.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 8, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationWeeks?: number;
}
