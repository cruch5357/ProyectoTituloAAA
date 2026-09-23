import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

// Identico en espiritu a UpdateExerciseStatusDto (PROMPT 07): unico campo
// mutable por este endpoint, para no mezclar "archivar" con edicion de
// datos ni permitir mass assignment de ningun otro campo (coachId, id,
// timestamps).
export class UpdateProgramStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}
