import { Global, Module } from '@nestjs/common';
import {
  CARD_DATA_PROVIDER,
  CARD_IDENTIFICATION_PROVIDER,
  PRICE_PROVIDER,
} from './card-provider.interface.js';
import { OcrLocalProvider } from './ocr-local.provider.js';
import { PokemonTcgIoProvider } from './pokemon-tcg-io.provider.js';
import { TcgdexProvider } from './tcgdex.provider.js';

@Module({
  providers: [
    { provide: CARD_DATA_PROVIDER, useClass: PokemonTcgIoProvider },
    { provide: CARD_IDENTIFICATION_PROVIDER, useClass: OcrLocalProvider },
    { provide: PRICE_PROVIDER, useClass: TcgdexProvider },
  ],
  exports: [CARD_DATA_PROVIDER, CARD_IDENTIFICATION_PROVIDER, PRICE_PROVIDER],
})
@Global()
export class ProvidersModule {}
