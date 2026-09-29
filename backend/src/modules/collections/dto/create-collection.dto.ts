import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const toBoolean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toLowerCase() === 'true' : value;

export class CreateCollectionDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isDefault?: boolean = false;
}
