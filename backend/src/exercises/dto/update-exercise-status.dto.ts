import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

// Identico en espiritu a UpdateStudentStatusDto (PROMPT 04): unico campo
// mutable por este endpoint, para no mezclar "desactivar" con edicion de
// datos ni permitir mass assignment de ningun otro campo (coachId, id,
// timestamps).
export class UpdateExerciseStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}
