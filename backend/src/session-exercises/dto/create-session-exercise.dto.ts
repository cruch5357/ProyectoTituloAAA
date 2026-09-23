import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

// Relaciona un ejercicio YA EXISTENTE del catálogo (PROMPT 07,
// `backend/src/exercises/`) con una sesión — nunca copia datos del
// ejercicio, solo referencia su id (`Session -> SessionExercise ->
// Exercise`, tal como exige PROMPT 08). Los campos de prescripción son
// EXACTAMENTE los que ya existían en el modelo `SessionExercise`
// (schema.prisma, PROMPT 02): no se inventa ningún campo nuevo (ej. "carga"/
// peso NO existe acá — eso es `SetLog.actualLoad`, del lado de EJECUCIÓN,
// fuera de alcance de este prompt).
//
// Rangos validados según las CHECK constraints ya existentes en la base de
// datos (docs/database.md, "Integridad y constraints"):
// - targetRpe: 0-10
// - targetRir: >= 0
// - targetSets: > 0
// - targetRepsMin: >= 0
// - targetRepsMax >= targetRepsMin (validación cruzada, ver
//   SessionExercisesService — no expresable con un único decorador de
//   class-validator sobre un campo aislado).
// - restSeconds: >= 0
export class CreateSessionExerciseDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'exerciseId con formato inválido' })
  exerciseId: string;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
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
