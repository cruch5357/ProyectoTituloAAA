import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { WorkoutCompletionStatus } from '@prisma/client';

// Paginación con el mismo criterio ya establecido en el resto del proyecto
// (page/limit con defaults y tope máximo — ver ListWorkoutLogsQueryDto,
// PROMPT 11 / ListExercisesQueryDto, PROMPT 07).
export const DASHBOARD_ACTIVITY_DEFAULT_PAGE = 1;
export const DASHBOARD_ACTIVITY_DEFAULT_LIMIT = 20;
export const DASHBOARD_ACTIVITY_MAX_LIMIT = 100;

// GET /dashboard/recent-activity — actividad reciente de TODOS los alumnos
// del coach autenticado (RF-26, PROMPT 12).
//
// IMPORTANTE (mismo criterio anti-IDOR ya establecido en PROMPT 11 para
// ListWorkoutLogsQueryDto): este DTO NO declara `coachId` ni `studentId`.
// Con whitelist/forbidNonWhitelisted globales (src/main.ts), cualquier
// intento de enviarlos se rechaza con 400 automáticamente — el coachId real
// SIEMPRE sale de CurrentUser() en el controller, nunca de la query.
//
// Deliberadamente NO incluye `programId`/`sessionId` (a diferencia de
// ListWorkoutLogsQueryDto): esta vista mezcla actividad de MÚLTIPLES
// alumnos con programas potencialmente distintos, así que filtrar por un
// solo programa/sesión acá no tiene el mismo sentido que en el historial de
// un único alumno. Un filtro por programa/ejercicio puntual sí tiene
// sentido en la vista POR ALUMNO (ver
// GetStudentDashboardQueryDto, que reutiliza GetWorkoutEvolutionQueryDto).
export class ListRecentActivityQueryDto {
  @ApiPropertyOptional({ default: DASHBOARD_ACTIVITY_DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = DASHBOARD_ACTIVITY_DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: DASHBOARD_ACTIVITY_DEFAULT_LIMIT,
    minimum: 1,
    maximum: DASHBOARD_ACTIVITY_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_ACTIVITY_MAX_LIMIT)
  limit: number = DASHBOARD_ACTIVITY_DEFAULT_LIMIT;

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

  @ApiPropertyOptional({ enum: WorkoutCompletionStatus })
  @IsOptional()
  @IsEnum(WorkoutCompletionStatus)
  completionStatus?: WorkoutCompletionStatus;
}
