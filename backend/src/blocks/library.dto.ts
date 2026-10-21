import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LibraryNameDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;
}
export class CreateLibraryBlockDto extends LibraryNameDto {
  @IsInt() @Min(1) weekCount: number;
  @IsOptional() @IsString() folderId?: string | null;
}
export class CatalogItemDto extends LibraryNameDto {
  @IsString() @MinLength(1) @MaxLength(60) category: string;
}
export class ModifierDto extends CatalogItemDto {
  @IsString() @MinLength(1) id: string;
}
export class ProgrammedSetDto {
  @IsString() @MinLength(1) id: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999.99)
  weight: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(10000) reps: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(10) rpe:
    number | null;
  @IsIn(['low', 'medium', 'high']) priority: 'low' | 'medium' | 'high';
}
export class LibraryExerciseDto {
  @IsString() @MinLength(1) id: string;
  @IsString() @MinLength(1) exerciseId: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierDto)
  modifiers: ModifierDto[];
  @IsString() @MaxLength(2000) notes: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgrammedSetDto)
  sets: ProgrammedSetDto[];
}
export class LibraryDayDto extends LibraryNameDto {
  @IsString() @MinLength(1) id: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LibraryExerciseDto)
  exercises: LibraryExerciseDto[];
}
export class LibraryWeekDto {
  @IsString() @MinLength(1) id: string;
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => LibraryDayDto)
  days: LibraryDayDto[];
}
export class SaveLibraryBlockDto extends LibraryNameDto {
  @IsInt() @Min(0) revision: number;
  @IsOptional() @IsString() folderId?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LibraryWeekDto)
  weeks: LibraryWeekDto[];
}
