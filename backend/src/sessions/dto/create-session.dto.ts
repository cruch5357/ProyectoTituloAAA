import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

// `dayOfWeek` es opcional (Session.dayOfWeek es nullable en el schema): se
// valida 1-7 cuando se envía (1 = lunes … 7 = domingo, convención documentada
// acá porque el schema no la fija explícitamente). `order` opcional: mismo
// criterio de "insertar y correr" que Block/Week (ver SessionsService.create).
export class CreateSessionDto {
  @ApiProperty({ example: 'Sesión A - Tren superior' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}
