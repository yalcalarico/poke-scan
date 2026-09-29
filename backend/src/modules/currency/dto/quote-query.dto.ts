import { IsIn, IsOptional } from 'class-validator';
import { DEFAULT_RATE_TYPE, RATE_TYPES, type RateType } from '../currency.constants.js';

export class QuoteQueryDto {
  @IsOptional()
  @IsIn(RATE_TYPES)
  type?: RateType = DEFAULT_RATE_TYPE;
}
