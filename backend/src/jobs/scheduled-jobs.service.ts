import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/index.js';
import { TcgcsvService } from './tcgcsv/tcgcsv.service.js';

import { CatalogSyncService } from './catalog-sync.service.js';
import { CardPricesRetentionService } from './card-prices-retention.service.js';

/**
 * Lee un booleano de la config con default.
 *
 * Los crons se apagan **por variable de entorno** y no por código: en un
 * despliegue hay que poder apagar el sync de catálogo sin tocar la imagen, y en
 * desarrollo hay que poder apagarlos sin acordarse de qué hay que descomentar.
 */
function flag(config: ConfigService, key: string, fallback: boolean): boolean {
  const raw = config.get<string>(key) ?? process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

@Injectable()
export class ScheduledJobsService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledJobsService.name);
  private readonly catalogSyncEnabled: boolean;
  private readonly retentionEnabled: boolean;

  constructor(
    config: ConfigService,
    private readonly catalogSync: CatalogSyncService,
    private readonly retention: CardPricesRetentionService,
    private readonly prisma: PrismaService,
    private readonly tcgcsv: TcgcsvService,
  ) {
    this.catalogSyncEnabled = flag(config, 'ENABLE_CATALOG_SYNC_CRON', true);
    this.retentionEnabled = flag(config, 'ENABLE_RETENTION_CRON', true);
  }

  onModuleInit(): void {
    void this.prisma.$executeRaw`UPDATE price_sync_controls SET "schedulerEnabled" = FALSE, "workerConfiguredEnabled" = FALSE WHERE provider = 'tcgdex'`
      .catch(() => this.logger.warn('No se pudo actualizar el estado del proveedor retirado'));
    const enabled = this.describeSchedule();
    if (enabled.length === 0) {
      this.logger.warn('Todos los crons de mantenimiento están desactivados por configuración.');
      return;
    }
    this.logger.log(`Crons de mantenimiento activos: ${enabled.join('; ')}.`);
    // El ciclo diario se recupera mediante la señal durable y la hora UTC.
  }

  @Cron('*/5 * * * * *', { timeZone: 'UTC' })
  async pollPriceCycles(): Promise<void> {
    const enabled = this.tcgcsv.enabled();
    const owner = randomUUID();
    try {
      await this.prisma.$executeRaw`
        UPDATE price_sync_controls SET "heartbeatAt" = NOW(), "schedulerEnabled" = ${enabled}, "workerConfiguredEnabled" = ${enabled}
        WHERE provider = 'tcgcsv'
      `;
      if (!enabled) return;
      const [claim] = await this.prisma.$queryRaw<{ requestedGeneration: number }[]>`
        UPDATE price_sync_controls SET "lockedBy" = ${owner}, "leaseUntil" = NOW() + INTERVAL '2 minutes'
        WHERE provider = 'tcgcsv' AND "requestedGeneration" > "handledGeneration" AND "nextCycleAt" <= NOW()
          AND ("leaseUntil" IS NULL OR "leaseUntil" <= NOW()) RETURNING "requestedGeneration"
      `;
      if (!claim) return;
      const done = await this.tcgcsv.discover(true);
      await this.tcgcsv.signalDaily();
      await this.prisma.$executeRaw`
        UPDATE price_sync_controls SET "handledGeneration" = CASE WHEN ${done} THEN ${claim.requestedGeneration} ELSE "handledGeneration" END,
          "lastHandledAt" = CASE WHEN ${done} THEN NOW() ELSE "lastHandledAt" END,
          "nextCycleAt" = NOW() + INTERVAL '1 minute', "lastError" = NULL, "lockedBy" = NULL, "leaseUntil" = NULL
        WHERE provider = 'tcgcsv' AND "lockedBy" = ${owner} AND "leaseUntil" > NOW()
      `;
    } catch {
      await this.prisma.$executeRaw`
        UPDATE price_sync_controls SET "lockedBy" = NULL, "leaseUntil" = NULL, "nextCycleAt" = NOW() + INTERVAL '1 hour',
          "lastError" = 'No se pudo encolar el ciclo de precios' WHERE provider = 'tcgcsv' AND "lockedBy" = ${owner}
      `;
      this.logger.warn('Ciclo tcgcsv pendiente; se conserva la señal');
    }
  }

  /**
   * Qué quedó prendido. Se loguea al arrancar para que una bandera de entorno
   * que apaga un job sea una decisión visible y no un misterio.
   */
  describeSchedule(): string[] {
    const jobs: string[] = [];
    if (this.catalogSyncEnabled) jobs.push('sync de catálogo (lunes 04:07)');
    if (this.tcgcsv.enabled()) jobs.push('precios TCGCSV diarios (21:00 UTC)');
    if (this.retentionEnabled) jobs.push('retención de precios (mensual)');
    return jobs;
  }

  /**
   * Sync del catálogo, semanal.
   *
   * **Lunes a las 04:07**, no a las 04:00: el minuto raro es deliberado. Si el
   * cron y otro proceso coinciden en la misma franja, staggering evita que las dos
   * cosas compitan por los requests de la fuente externa.
   *
   * ## Por qué semanal y no diario
   *
   * Es un cálculo de cuota, no una preferencia: 83 páginas son 83 requests
   * contra un límite de **1.000 por día**. Diario serían 8,3 % de la cuota
   * diaria gastados en una tarea que el catálogo no necesita cada día:
   * pokemontcg.io no publica cartas nuevas seguido. Semanal deja el 90 % libre
   * para lo que de verdad la consume, que es el sync inicial y los reintentos.
   *
   * Y la fuente es **deprecada**: sus keys mueren el 1/3/2027. Automatizar algo
   * que va a morir es trabajo que puede quedar viejo, así que el cron es
   * semanal, apagable por env, y el costo de apagarlo es cero.
   */
  @Cron('7 4 * * 1')
  async syncCatalogWeekly(): Promise<void> {
    if (!this.catalogSyncEnabled) return;
    try {
      const result = await this.catalogSync.start(false);
      if (!result.started) {
        this.logger.log('Sync de catálogo semanal omitido: ya había uno corriendo.');
      }
    } catch (error) {
      this.logger.error(`Falló el sync de catálogo semanal: ${(error as Error).message}`);
    }
  }

  /**
   * Retención de `card_prices`, mensual.
   *
   * Corre la política de consolidación con los defaults de producción. Existe
   * porque `card_prices` es append-only: sin esto, la tabla crece linealmente y
   * las consultas de variación se van encareciendo.
   *
   * El día 1 a las 03:23, y no el 1 a medianoche, por el mismo criterio de
   * staggering que el sync de catálogo.
   */
  @Cron('23 3 1 * *')
  async prunePricesMonthly(): Promise<void> {
    if (!this.retentionEnabled) return;
    try {
      const result = await this.retention.run();
      if (result.consolidated > 0 || result.pruned > 0) {
        this.logger.log(
          `Retención mensual: ${result.consolidated} consolidadas, ${result.pruned} podadas.`,
        );
      }
    } catch (error) {
      this.logger.error(`Falló la retención mensual: ${(error as Error).message}`);
    }
  }
}
