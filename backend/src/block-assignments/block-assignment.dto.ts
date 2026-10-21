import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AssignBlockDto {
  @IsString() @Matches(/^c[a-z0-9]{24}$/) blockId: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate: string;
  @IsOptional() @IsBoolean() replaceActive?: boolean;
  // Explicit offsets relative to start date; e.g. [1,3,5] for three days.
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  dayOffsets: number[];
}
export class PerformedSetDto {
  @IsString() sessionExerciseId: string;
  @IsInt() @Min(1) setNumber: number;
  @IsIn(['RECORDED', 'SKIPPED']) status: 'RECORDED' | 'SKIPPED';
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999.99)
  weight?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(10000) reps?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(10) rpe?:
    number | null;
}
export class SaveTrainingDto {
  @IsOptional() @IsString() assignmentId?: string;
  @IsInt() @Min(0) revision: number;
  @IsBoolean() finish: boolean;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformedSetDto)
  sets: PerformedSetDto[];
  @IsOptional() @IsInt() @Min(0) @Max(1440) durationMinutes?: number;
}
