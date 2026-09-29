import { IsIn, IsOptional } from 'class-validator';
import {
  PREFERRED_CURRENCIES,
  RATE_TYPES,
  type PreferredCurrency,
  type RateType,
} from '../../currency/currency.constants.js';

/** Query de `GET /cards/:id/prices`. */
export class CardPricesQueryDto {
  /**
   * `ARS` agrega `priceArs` a cada precio usando el rate YA cacheado en
   * Redis. Nunca dispara una llamada a DolarApi: si no hay caché, los precios
   * vienen sin `priceArs` (en `null`) en vez de fallar.
   */
  @IsOptional()
  @IsIn(PREFERRED_CURRENCIES)
  currency?: PreferredCurrency = 'USD';

  @IsOptional()
  @IsIn(RATE_TYPES)
  rateType?: RateType;
}
