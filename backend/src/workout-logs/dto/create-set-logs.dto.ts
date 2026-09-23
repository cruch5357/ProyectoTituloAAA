import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// Rangos según las mismas CHECK constraints ya existentes en la base de
// datos para `set_logs` (docs/database.md sección 8.1/8.2 y
// prisma/migrations/20260916150000_.../migration.sql):
// - setNumber: > 0
// - actualReps: >= 0
// - actualLoad: >= 0
// - actualRpe: 0-10
// - actualRir: >= 0
// Ninguno de estos campos es nuevo: son EXACTAMENTE los ya definidos en
// `SetLog` (prisma/schema.prisma, PROMPT 02).
export class CreateSetLogItemDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'sessionExerciseId con formato inválido',
  })
  sessionExerciseId: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  setNumber: number;

  @ApiPropertyOptional({ example: 10, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualReps?: number;

  @ApiPropertyOptional({ example: 60, minimum: 0 })
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

  @ApiPropertyOptional({ example: 'Buena técnica en la última repetición.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comments?: string;
}

// Se acepta un arreglo (mínimo 1, máximo 50) en vez de una única serie por
// llamada, a diferencia de AssignProgramDto (PROMPT 09): acá SÍ hay un caso
// de uso real y frecuente de escritura múltiple relacionada (registrar de
// una vez todas las series ya ejecutadas de un ejercicio), que es
// precisamente el escenario que amerita `Prisma.$transaction` según el
// propio enunciado de PROMPT 10 ("usa transacciones cuando una operación
// requiera múltiples escrituras relacionadas") — ver
// WorkoutLogsService.addSetLogs().
export class CreateSetLogsDto {
  @ApiProperty({ type: [CreateSetLogItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateSetLogItemDto)
  setLogs: CreateSetLogItemDto[];
}
