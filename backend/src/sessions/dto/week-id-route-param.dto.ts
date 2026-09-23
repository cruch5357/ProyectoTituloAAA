import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class WeekIdRouteParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'weekId con formato inválido' })
  weekId: string;
}
