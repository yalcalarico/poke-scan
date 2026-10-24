import { Injectable } from '@nestjs/common';
import type { PriceProvider, RemoteCardPrice, RemotePriceSet, RemotePriceSetDetail } from './card-provider.interface.js';

/** La ingesta del feed pertenece a TcgcsvService; nunca se consulta por carta. */
@Injectable()
export class TcgcsvPriceProvider implements PriceProvider {
  readonly id = 'tcgcsv';
  readonly defaultSource = 'tcgplayer';
  readonly defaultCurrency = 'USD';

  listSets(): Promise<RemotePriceSet[]> {
    return Promise.reject(new Error('TCGCSV descubre sets mediante su cola de ingesta.'));
  }

  getSetDetail(): Promise<RemotePriceSetDetail | null> {
    return Promise.reject(new Error('TCGCSV asocia los sets durante la ingesta del feed.'));
  }

  getCardPrices(): Promise<RemoteCardPrice[]> {
    return Promise.reject(new Error('TCGCSV actualiza precios por archivo mediante su cola durable.'));
  }
}
