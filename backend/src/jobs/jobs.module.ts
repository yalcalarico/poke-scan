import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProvidersModule } from '../modules/providers/providers.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsRecoveryService } from './jobs-recovery.service.js';
import { PriceQueueWorker } from './price-queue.worker.js';
import { PriceQueueService } from './price-queue.service.js';
import { ProviderRateGate } from './provider-rate.gate.js';
import { ScanCaptureController } from './scan-capture.controller.js';
import { SyncCardsService } from './sync-cards.service.js';
import { SyncPricesService } from './sync-prices.service.js';
import { SyncSetsService } from './sync-sets.service.js';
import { SyncStateService } from './sync-state.service.js';
import { TCGDEX_SET_MAPPING, TcgdexSetMappingService } from './tcgdex-set-mapping.service.js';

/**
 * ## Por qué el grafo de jobs es acíclico
 *
 * `SyncPricesService` encola (→ `PriceQueueService`), `PriceQueueWorker` drena la
 * cola y le pide el trabajo a `SyncPricesService`. Si el worker viviera dentro
 * del servicio de precios, los dos se necesitarían mutuamente. Separlos es lo
 * que permite que las llamadas al proveedor salgan por un único reloj
 * compartido (`ProviderRateGate`) sin que ningún servicio dependa de sí mismo.
 */
@Module({
  imports: [ConfigModule, ProvidersModule, RedisModule],
  controllers: [JobsController, ScanCaptureController],
  providers: [
    SyncSetsService,
    SyncCardsService,
    SyncStateService,
    SyncPricesService,
    ProviderRateGate,
    PriceQueueService,
    // Recovery primero: reconcilia los jobs del proceso anterior antes de que
    // el worker empiece a tomar trabajo nuevo.
    JobsRecoveryService,
    // El worker no se exporta: corre solo, desde `onModuleInit`.
    PriceQueueWorker,
    { provide: TCGDEX_SET_MAPPING, useClass: TcgdexSetMappingService },
    TcgdexSetMappingService,
  ],
  exports: [
    SyncSetsService,
    SyncCardsService,
    SyncStateService,
    SyncPricesService,
    PriceQueueService,
    TCGDEX_SET_MAPPING,
    TcgdexSetMappingService,
  ],
})
export class JobsModule {}
