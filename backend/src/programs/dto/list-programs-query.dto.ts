import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Paginacion identica en criterio a ListExercisesQueryDto (PROMPT 07).
export const PROGRAMS_DEFAULT_PAGE = 1;
export const PROGRAMS_DEFAULT_LIMIT = 20;
export const PROGRAMS_MAX_LIMIT = 100;

// IMPORTANTE (mismo criterio que ListExercisesQueryDto, PROMPT 07): este DTO
// NO declara `coachId`. Con `whitelist`/`forbidNonWhitelisted` globales, un
// `?coachId=...` enviado por el cliente se rechaza con 400 automaticamente.
//
// No se declara ningun filtro por `isActive`: el listado devuelve siempre
// todos los programas propios (activos e inactivos), igual que
// GET /exercises no excluye ejercicios inactivos.
export class ListProgramsQueryDto {
  @ApiPropertyOptional({ default: PROGRAMS_DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = PROGRAMS_DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: PROGRAMS_DEFAULT_LIMIT,
    minimum: 1,
    maximum: PROGRAMS_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PROGRAMS_MAX_LIMIT)
  limit: number = PROGRAMS_DEFAULT_LIMIT;

  @ApiPropertyOptional({ description: 'Búsqueda simple por nombre' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
