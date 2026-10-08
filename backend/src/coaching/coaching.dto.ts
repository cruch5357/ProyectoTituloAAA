import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CompetitionStatus } from '@prisma/client';

export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}
export class DateDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate: string;
}
export class CalendarQueryDto {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
}
export class CompetitionDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) eventDate: string;
  @IsString() @MinLength(1) @MaxLength(100) category: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(2000) goal?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsEnum(CompetitionStatus)
  status?: CompetitionStatus;
}
export class UpdateCompetitionDto extends PartialType(CompetitionDto, {
  skipNullProperties: false,
}) {}
export class CoachGoalDto {
  @IsString() @MaxLength(2000) coachGoal: string;
}
export class ProfileDto {
  @IsOptional() @IsString() @MaxLength(100) displayName?: string;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) sport?: string;
  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
}
export class MessageDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MaxLength(4000)
  body?: string;
}
