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

// Paginación simple (PROMPT 04, punto 10): `page`/`limit` con valores por
// defecto razonables y un tope máximo de `limit` para evitar listados sin
// límite (nunca se decidió omitir paginación: un coach real puede tener
// muchos alumnos, y devolver todos de una vez no escala ni es necesario
// para la UI de "Mis alumnos").
export const STUDENTS_DEFAULT_PAGE = 1;
export const STUDENTS_DEFAULT_LIMIT = 20;
export const STUDENTS_MAX_LIMIT = 100;

// IMPORTANTE (PROMPT 04, punto 5): este DTO NO declara ningún campo
// `coachId`. Con la configuración global de ValidationPipe
// (`whitelist: true, forbidNonWhitelisted: true`, ver src/main.ts), un
// query param `?coachId=...` enviado por el cliente es rechazado con 400
// automáticamente antes de llegar al controller/servicio — no hace falta
// (ni se debe) leerlo ni ignorarlo manualmente en ningún lado. El único
// coachId real usado para filtrar viene siempre de `CurrentUser()`.
export class ListStudentsQueryDto {
  @ApiPropertyOptional({ default: STUDENTS_DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = STUDENTS_DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: STUDENTS_DEFAULT_LIMIT,
    minimum: 1,
    maximum: STUDENTS_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STUDENTS_MAX_LIMIT)
  limit: number = STUDENTS_DEFAULT_LIMIT;

  // Búsqueda simple por nombre o email (PROMPT 04, punto 11): un único
  // término de texto, sin filtros combinados ni operadores. Prioriza
  // claridad/seguridad/mantenibilidad por sobre una búsqueda avanzada que
  // esta etapa del proyecto no necesita.
  @ApiPropertyOptional({ description: 'Búsqueda simple por nombre o email' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
