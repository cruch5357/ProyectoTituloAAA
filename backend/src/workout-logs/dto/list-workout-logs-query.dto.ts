import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { WorkoutCompletionStatus } from '@prisma/client';

// Paginación con el mismo criterio ya establecido (page/limit con defaults y
// tope máximo — ver ListExercisesQueryDto, PROMPT 07).
export const WORKOUT_LOGS_DEFAULT_PAGE = 1;
export const WORKOUT_LOGS_DEFAULT_LIMIT = 20;
export const WORKOUT_LOGS_MAX_LIMIT = 100;

// GET /workout-logs — historial del Alumno autenticado (RF-25, PROMPT 11).
//
// IMPORTANTE (requisito explícito de PROMPT 11, sección "AUTORIZACIÓN"):
// este DTO NO declara `studentId` ni `userId`. Con
// whitelist/forbidNonWhitelisted globales (src/main.ts), cualquier intento
// de enviarlos se rechaza con 400 automáticamente — el studentId real
// SIEMPRE sale de CurrentUser() en el controller, nunca de la query.
//
// Los demás filtros (dateFrom/dateTo/completionStatus/programId/sessionId)
// son seguros por construcción: WorkoutLogsService.listHistory() siempre
// combina estos filtros con `studentId` en el `where` de Prisma, así que
// pedir un `programId`/`sessionId` ajeno simplemente no coincide con
// ninguna fila propia y devuelve una lista vacía — nunca datos de otro
// alumno (ver docs/api.md, "Estado de implementación (PROMPT 11)").
export class ListWorkoutLogsQueryDto {
  @ApiPropertyOptional({ default: WORKOUT_LOGS_DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = WORKOUT_LOGS_DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: WORKOUT_LOGS_DEFAULT_LIMIT,
    minimum: 1,
    maximum: WORKOUT_LOGS_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WORKOUT_LOGS_MAX_LIMIT)
  limit: number = WORKOUT_LOGS_DEFAULT_LIMIT;

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

  @ApiPropertyOptional({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, { message: 'programId con formato inválido' })
  programId?: string;

  @ApiPropertyOptional({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, { message: 'sessionId con formato inválido' })
  sessionId?: string;
}
