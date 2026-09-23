import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkoutCompletionStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// PATCH /workout-logs/:id/finish — la ÚNICA forma de fijar
// `completionStatus` (RF-23: "el alumno registra a nivel de sesión:
// cumplimiento, RPE general, percepción de esfuerzo/fatiga y comentarios",
// las cuatro cosas juntas, en una sola acción). `durationMinutes` es
// obligatorio acá específicamente (aunque en el modelo la columna es
// nullable): es la señal que usa WorkoutLogsService para saber que el
// entrenamiento ya fue cerrado al menos una vez (ver el comentario de clase
// en workout-logs.service.ts sobre por qué no se agregó ningún campo de
// estado nuevo). Puede volver a llamarse dentro de la ventana de 24 horas de
// RF-24 para corregir el resumen ya enviado.
export class FinishWorkoutLogDto {
  @ApiProperty({
    enum: WorkoutCompletionStatus,
    example: WorkoutCompletionStatus.COMPLETED,
  })
  @IsEnum(WorkoutCompletionStatus)
  completionStatus: WorkoutCompletionStatus;

  @ApiProperty({ example: 45, minimum: 0 })
  @IsInt()
  @Min(0)
  durationMinutes: number;

  @ApiPropertyOptional({ example: 7, minimum: 0, maximum: 10 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(10)
  overallRpe?: number;

  @ApiPropertyOptional({ example: 6, minimum: 0, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  fatigue?: number;

  @ApiPropertyOptional({
    example: 'Buena sesión, un poco cansado al final.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}
