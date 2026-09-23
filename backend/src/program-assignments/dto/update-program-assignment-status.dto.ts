import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ProgramAssignmentStatus } from '@prisma/client';

// A diferencia de UpdateProgramStatusDto/UpdateExerciseStatusDto (booleano
// `isActive`), ProgramAssignment ya modelaba su estado como un enum real
// desde PROMPT 02 (`ProgramAssignmentStatus`: ACTIVE | FINISHED — ver
// prisma/schema.prisma y docs/database.md, seccion 8.1). Este DTO adapta el
// mismo patron de "endpoint de estado angosto" (PROMPT 09, punto 4:
// "Desactivar/finalizar una asignacion... respetando el modelo existente")
// al tipo de dato que el modelo YA tenia, en vez de agregar un booleano
// `isActive` nuevo que duplicaria informacion con `status` — exactamente el
// mismo criterio ya usado para descartar un enum de estado redundante en
// docs/database.md, seccion 9.3.
export class UpdateProgramAssignmentStatusDto {
  @ApiProperty({
    enum: ProgramAssignmentStatus,
    example: ProgramAssignmentStatus.FINISHED,
  })
  @IsEnum(ProgramAssignmentStatus)
  status: ProgramAssignmentStatus;
}
