import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { toBoolean, trimString } from './create-collection.dto.js';

export class UpdateCollectionDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isDefault?: boolean;
}
