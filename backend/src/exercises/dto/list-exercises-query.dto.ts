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

// Paginacion identica en criterio a ListStudentsQueryDto (PROMPT 04): un
// coach puede acumular muchos ejercicios en su catalogo, asi que se pagina
// desde el inicio en vez de devolver todo de una vez.
export const EXERCISES_DEFAULT_PAGE = 1;
export const EXERCISES_DEFAULT_LIMIT = 20;
export const EXERCISES_MAX_LIMIT = 100;

// IMPORTANTE (mismo criterio que ListStudentsQueryDto, PROMPT 04, punto 5):
// este DTO NO declara `coachId`. Con `whitelist`/`forbidNonWhitelisted`
// globales (src/main.ts), un `?coachId=...` enviado por el cliente se
// rechaza con 400 automaticamente. El unico coachId real usado para filtrar
// siempre viene de CurrentUser().
//
// No se declara ningun filtro por `isActive`: el listado devuelve siempre
// todos los ejercicios propios (activos e inactivos), igual que
// GET /students no excluye alumnos inactivos — el frontend distingue el
// estado con una insignia (ver ExerciseStatusBadge) y permite reactivar.
export class ListExercisesQueryDto {
  @ApiPropertyOptional({ default: EXERCISES_DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = EXERCISES_DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: EXERCISES_DEFAULT_LIMIT,
    minimum: 1,
    maximum: EXERCISES_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(EXERCISES_MAX_LIMIT)
  limit: number = EXERCISES_DEFAULT_LIMIT;

  // Busqueda simple por nombre o grupo muscular (igual de simple que la
  // busqueda de alumnos por nombre/email: un unico termino, sin operadores).
  @ApiPropertyOptional({
    description: 'Búsqueda simple por nombre o grupo muscular',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
