import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

// Campos alineados EXACTAMENTE con el modelo Program ya existente en
// schema.prisma (PROMPT 02): nombre, descripcion, duracion en semanas. No se
// agrega ningun campo que el modelo no tenga (mismo criterio ya aplicado en
// CreateExerciseDto, PROMPT 07).
//
// El coachId NUNCA viaja en este DTO: siempre sale del usuario autenticado
// (JWT), igual que en CreateExerciseDto/CreateStudentDto.
export class CreateProgramDto {
  @ApiProperty({ example: 'Fuerza - Bloque base' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({
    example: 'Programa de 8 semanas orientado a fuerza máxima.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 8, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationWeeks?: number;
}
