import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

// GET /workout-logs/evolution — evolución básica descriptiva (RF-25,
// PROMPT 11). Mismo criterio anti-IDOR que ListWorkoutLogsQueryDto: sin
// `studentId`/`userId`, el alumno autenticado siempre sale de
// CurrentUser().
//
// `exerciseId` es OPCIONAL: sin él, la respuesta trae solo el resumen
// agregado (WorkoutSummaryMetrics); con él, agrega además la serie de
// evolución de carga/repeticiones de ESE ejercicio del catálogo a través
// del tiempo (ver WorkoutLogsService.getEvolution()).
export class GetWorkoutEvolutionQueryDto {
  @ApiPropertyOptional({
    description: 'Fecha desde (ISO 8601), inclusive',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Fecha hasta (ISO 8601), inclusive',
    example: '2026-03-31',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, { message: 'programId con formato inválido' })
  programId?: string;

  @ApiPropertyOptional({
    description:
      'Id del ejercicio del catálogo para el que se pide la evolución de carga/repeticiones',
    example: 'ckv6q8x9z0000qzrmn831p6k',
  })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, { message: 'exerciseId con formato inválido' })
  exerciseId?: string;
}
