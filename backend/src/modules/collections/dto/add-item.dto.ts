import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CARD_CONDITIONS, CARD_VARIANTS } from './card-variant.js';
import { trimString } from './create-collection.dto.js';

export class AddItemDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(64)
  cardId: string;

  @IsOptional()
  @IsIn(CARD_VARIANTS)
  variant?: (typeof CARD_VARIANTS)[number] = 'normal';

  @IsOptional()
  @IsIn(CARD_CONDITIONS)
  condition?: (typeof CARD_CONDITIONS)[number] = 'NM';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number = 1;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  notes?: string;
}
