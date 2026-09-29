import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CARD_CONDITIONS, CARD_VARIANTS } from './card-variant.js';
import { toBoolean, trimString } from './create-collection.dto.js';

export class UpdateItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isForTrade?: boolean;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsIn(CARD_VARIANTS)
  variant?: (typeof CARD_VARIANTS)[number];

  @IsOptional()
  @IsIn(CARD_CONDITIONS)
  condition?: (typeof CARD_CONDITIONS)[number];
}
