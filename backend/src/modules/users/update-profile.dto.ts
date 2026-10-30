import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
export class UpdateProfileDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
}
