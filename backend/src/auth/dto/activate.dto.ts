import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_PATTERN_MESSAGE,
} from './register.dto';

export class ActivateDto {
  @ApiProperty({
    description:
      'Token de invitación recibido fuera de banda (por ahora, entregado por el coach; ver AuthService.inviteStudent)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token: string;

  @ApiProperty({ example: 'Alumno Ejemplo' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_PATTERN_MESSAGE })
  password: string;
}
