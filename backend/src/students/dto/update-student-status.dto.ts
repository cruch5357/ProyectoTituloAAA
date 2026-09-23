import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

// DTO deliberadamente angosto (PROMPT 04, puntos 7, 8 y 21 — prevención de
// mass assignment): el ÚNICO campo que este endpoint puede modificar es
// `isActive`. Nunca se acepta `role`, `coachId`, `passwordHash` ni `email`
// acá, ni siquiera si el cliente los envía — la configuración global de
// ValidationPipe (`whitelist`/`forbidNonWhitelisted`, ver src/main.ts) ya
// los rechaza con 400 por no estar declarados en este DTO, y
// StudentsService.updateStatus() además construye su propio objeto `data`
// explícito para Prisma (nunca reenvía el DTO completo ni el body crudo).
export class UpdateStudentStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
