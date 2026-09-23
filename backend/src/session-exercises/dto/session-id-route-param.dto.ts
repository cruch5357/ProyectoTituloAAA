import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class SessionIdRouteParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'sessionId con formato inválido' })
  sessionId: string;
}
