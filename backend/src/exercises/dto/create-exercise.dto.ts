import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

// Campos alineados EXACTAMENTE con el modelo Exercise ya existente en
// schema.prisma (PROMPT 02) y con RF-08 (docs/requirements.md): nombre,
// grupo muscular, indicaciones, video/enlace opcional. No se agrega ningun
// campo que el modelo no tenga (PROMPT 07, "no inventes campos
// innecesarios") — "categoria"/"equipamiento" que menciona el enunciado del
// prompt como ejemplos no existen en el modelo actual y por lo tanto no se
// agregan aqui.
//
// El coachId NUNCA viaja en este DTO: siempre sale del usuario autenticado
// (JWT), igual que en CreateStudentDto/InviteStudentDto (PROMPT 03/04).
export class CreateExerciseDto {
  @ApiProperty({ example: 'Sentadilla trasera' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'Piernas' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  muscleGroup?: string;

  @ApiPropertyOptional({
    example: 'Barra sobre trapecio, pies al ancho de hombros.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @ApiPropertyOptional({ example: 'https://ejemplo.com/video-sentadilla' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  videoUrl?: string;
}
