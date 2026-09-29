import { IsIn, IsOptional } from 'class-validator';
import {
  PREFERRED_CURRENCIES,
  RATE_TYPES,
  type PreferredCurrency,
  type RateType,
} from '../currency.constants.js';

export class UpdatePreferenceDto {
  @IsIn(PREFERRED_CURRENCIES)
  preferredCurrency!: PreferredCurrency;

  @IsOptional()
  @IsIn(RATE_TYPES)
  preferredRateType?: RateType;
}
