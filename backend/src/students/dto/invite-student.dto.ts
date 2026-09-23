import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

// Reubicado desde `src/auth/dto/invite-student.dto.ts` en PROMPT 04: la
// invitación de alumnos pasa a vivir junto con el resto de la gestión de
// alumnos (ver StudentsController/StudentsService y la nota de reorganización
// en docs/api.md, sección "Estado de implementación (PROMPT 04)").
//
// El id del coach que invita NUNCA viaja en este DTO: siempre se toma del
// usuario autenticado (JWT), nunca del cuerpo de la request (docs/security.md,
// punto 3; requisito explícito de PROMPT 03, vigente sin cambios en PROMPT 04).
export class InviteStudentDto {
  @ApiProperty({ example: 'alumno@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;
}
