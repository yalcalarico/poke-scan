import { Module } from '@nestjs/common';
import { ComparisonController } from './comparison.controller.js';
import { CardComparisonService } from './card-comparison.service.js';
import { CollectionComparisonService } from './collection-comparison.service.js';
import { TcgcsvClient } from './tcgcsv/tcgcsv.client.js';
import { TcgcsvService } from './tcgcsv/tcgcsv.service.js';
import { ConfigModule } from '@nestjs/config';
import { ProvidersModule } from '../modules/providers/providers.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsRecoveryService } from './jobs-recovery.service.js';
import { CardPricesRetentionService } from './card-prices-retention.service.js';
import { CatalogSyncService } from './catalog-sync.service.js';
import { ScheduledJobsService } from './scheduled-jobs.service.js';
import { SyncCardsService } from './sync-cards.service.js';
import { SyncPricesService } from './sync-prices.service.js';
import { SyncSetsService } from './sync-sets.service.js';
import { SyncStateService } from './sync-state.service.js';
import { PriceSyncRegistryService } from './price-sync-registry.service.js';

@Module({
  imports: [ConfigModule, ProvidersModule, RedisModule],
  controllers: [JobsController, ComparisonController],
  providers: [
    CardComparisonService, CollectionComparisonService, TcgcsvClient, TcgcsvService,
    // SyncSetsService va porque SyncCardsService lo inyecta: el sync de cartas
    // espeja los sets primero.
    SyncSetsService,
    SyncCardsService,
    SyncStateService,
    SyncPricesService,
    PriceSyncRegistryService,
    // La retención corre a mano (dry run por default) y una vez por mes por el
    // cron. La misma política, las dos entradas.
    CardPricesRetentionService,
    // La orquestación del sync, compartida por el endpoint de admin y el cron:
    // el lock se pide en un solo lugar.
    CatalogSyncService,
    ScheduledJobsService,
    // Reconcilia los syncs de catálogo del proceso anterior.
    JobsRecoveryService,
  ],
  exports: [
    CardComparisonService, CollectionComparisonService, TcgcsvService,
    SyncSetsService,
    SyncCardsService,
    SyncStateService,
    SyncPricesService,
    PriceSyncRegistryService,
    CatalogSyncService,
    CardPricesRetentionService,
  ],
})
export class JobsModule {}
