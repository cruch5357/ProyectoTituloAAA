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
  // Legacy, optional suggested positions. They never restrict weekly execution.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  dayOffsets?: number[];
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
}

export class StartTrainingDto {
  @IsOptional() @IsString() assignmentId?: string;
}

export class SaveTrainingWeekPlanDto {
  @IsString() assignmentId: string;
  @IsInt() @Min(0) weekIndex: number;
  @IsInt() @Min(0) revision: number;
  @IsArray()
  @ArrayMaxSize(7)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  trainingDates: string[];
}

export class RequestWorkoutCorrectionDto {
  @IsString() assignmentId: string;
  @IsString() sessionExerciseId: string;
  @IsInt() @Min(1) setNumber: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999.99)
  weight?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(10000) reps?: number | null;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(10)
  rpe?: number | null;
  @IsOptional() @IsString() reason?: string;
}

export class DecideWorkoutCorrectionDto {
  @IsIn(['APPROVE', 'REJECT']) decision: 'APPROVE' | 'REJECT';
}
