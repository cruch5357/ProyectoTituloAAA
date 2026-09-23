import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

// DTO de edicion (PATCH /exercises/:id). Todos los campos son opcionales
// (edicion parcial), pero se declaran explicitamente uno por uno — nunca se
// usa un `Partial<CreateExerciseDto>` generado automaticamente ni se
// reenvia el body crudo — mismo criterio de DTOs angostos y explicitos que
// UpdateStudentStatusDto (PROMPT 04, prevencion de mass assignment).
// Deliberadamente NO declara `isActive`: ese campo se modifica unicamente a
// traves de PATCH /exercises/:id/status (ver UpdateExerciseStatusDto), para
// no mezclar edicion de datos con cambio de estado en el mismo endpoint.
export class UpdateExerciseDto {
  @ApiPropertyOptional({ example: 'Sentadilla trasera' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: 'Piernas' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  muscleGroup?: string;

  @ApiPropertyOptional({
    example: 'Barra sobre trapecio, pies al ancho de hombros.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @ApiPropertyOptional({ example: 'https://ejemplo.com/video-sentadilla' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  videoUrl?: string;
}
