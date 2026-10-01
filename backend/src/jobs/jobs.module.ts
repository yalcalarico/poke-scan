import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProvidersModule } from '../modules/providers/providers.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsRecoveryService } from './jobs-recovery.service.js';
import { CardPricesRetentionService } from './card-prices-retention.service.js';
import { CatalogSyncService } from './catalog-sync.service.js';
import { PriceBackfillService } from './price-backfill.service.js';
import { ScheduledJobsService } from './scheduled-jobs.service.js';
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
    // SyncSetsService va porque SyncCardsService lo inyecta: el sync de cartas
    // espeja los sets primero.
    SyncSetsService,
    SyncCardsService,
    SyncStateService,
    SyncPricesService,
    ProviderRateGate,
    PriceQueueService,
    // La retención corre a mano (dry run por default) y una vez por mes por el
    // cron. La misma política, las dos entradas.
    CardPricesRetentionService,
    // La orquestación del sync, compartida por el endpoint de admin y el cron:
    // el lock se pide en un solo lugar.
    CatalogSyncService,
    PriceBackfillService,
    ScheduledJobsService,
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
    CatalogSyncService,
    PriceBackfillService,
    CardPricesRetentionService,
    TCGDEX_SET_MAPPING,
    TcgdexSetMappingService,
  ],
})
export class JobsModule {}
