import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProvidersModule } from '../modules/providers/providers.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { JobsController } from './jobs.controller.js';
import { ScanCaptureController } from './scan-capture.controller.js';
import { SyncCardsService } from './sync-cards.service.js';
import { SyncPricesService } from './sync-prices.service.js';
import { SyncSetsService } from './sync-sets.service.js';
import { TCGDEX_SET_MAPPING, TcgdexSetMappingService } from './tcgdex-set-mapping.service.js';

@Module({
  imports: [ConfigModule, ProvidersModule, RedisModule],
  controllers: [JobsController, ScanCaptureController],
  providers: [
    SyncSetsService,
    SyncCardsService,
    SyncPricesService,
    { provide: TCGDEX_SET_MAPPING, useClass: TcgdexSetMappingService },
    TcgdexSetMappingService,
  ],
  exports: [
    SyncSetsService,
    SyncCardsService,
    SyncPricesService,
    TCGDEX_SET_MAPPING,
    TcgdexSetMappingService,
  ],
})
export class JobsModule {}
