import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

// El id del coach que invita NUNCA viaja en este DTO: siempre se toma del
// usuario autenticado (JWT), nunca del cuerpo de la request (docs/security.md,
// punto 3; requisito explícito de PROMPT 03).
export class InviteStudentDto {
  @ApiProperty({ example: 'alumno@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;
}
