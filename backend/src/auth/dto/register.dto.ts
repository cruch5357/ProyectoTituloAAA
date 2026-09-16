import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// Política mínima de contraseña (docs/security.md, punto 6: validación de
// entrada en el backend, independiente de cualquier validación de UI):
// al menos 10 caracteres, con al menos una letra y un número. No es una
// política exhaustiva (no evalúa contraseñas filtradas, etc.) pero cubre el
// caso mínimo razonable para el MVP y evita contraseñas triviales.
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;
export const PASSWORD_PATTERN_MESSAGE =
  'La contraseña debe tener al menos una letra y un número';

// Registro de Coach. Público (docs/requirements.md, docs/api.md): los
// alumnos nunca se autorregistran, solo pueden activarse mediante una
// invitación previa de su coach (ver InviteStudentDto / ActivateDto).
export class RegisterDto {
  @ApiProperty({ example: 'coach@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_PATTERN_MESSAGE })
  password: string;

  @ApiProperty({ example: 'Alan Basso' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;
}
