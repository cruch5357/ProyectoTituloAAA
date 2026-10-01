import { PickType } from '@nestjs/swagger';
import { RegisterDto } from './register.dto';

export class ForgotPasswordDto extends PickType(RegisterDto, [
  'email',
] as const) {}
