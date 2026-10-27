import { Injectable } from '@nestjs/common';
import type { PriceProvider } from './card-provider.interface.js';

/** La ingesta del feed pertenece a TcgcsvService; nunca se consulta por carta. */
@Injectable()
export class TcgcsvPriceProvider implements PriceProvider {
  readonly id = 'tcgcsv';
  readonly defaultSource = 'tcgplayer';
  readonly defaultCurrency = 'USD';
}
