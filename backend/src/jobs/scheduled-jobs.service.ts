import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { CatalogSyncService } from './catalog-sync.service.js';
import { CardPricesRetentionService } from './card-prices-retention.service.js';
import { PriceBackfillService, BACKFILL_BATCH } from './price-backfill.service.js';

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
  private readonly backfillEnabled: boolean;
  private readonly retentionEnabled: boolean;

  constructor(
    config: ConfigService,
    private readonly catalogSync: CatalogSyncService,
    private readonly backfill: PriceBackfillService,
    private readonly retention: CardPricesRetentionService,
  ) {
    this.catalogSyncEnabled = flag(config, 'ENABLE_CATALOG_SYNC_CRON', true);
    this.backfillEnabled = flag(config, 'ENABLE_PRICE_BACKFILL_CRON', true);
    this.retentionEnabled = flag(config, 'ENABLE_RETENTION_CRON', true);
  }

  onModuleInit(): void {
    const enabled = this.describeSchedule();
    if (enabled.length === 0) {
      this.logger.warn('Todos los crons de mantenimiento están desactivados por configuración.');
      return;
    }
    this.logger.log(`Crons de mantenimiento activos: ${enabled.join('; ')}.`);
  }

  /**
   * Qué quedó prendido. Se loguea al arrancar para que una bandera de entorno
   * que apaga un job sea una decisión visible y no un misterio.
   */
  describeSchedule(): string[] {
    const jobs: string[] = [];
    if (this.catalogSyncEnabled) jobs.push('sync de catálogo (lunes 04:07)');
    if (this.backfillEnabled) jobs.push('backfill de precios (cada hora, :13)');
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
   * Backfill de precios, **cada hora**.
   *
   * Encola las cartas sin precio vigente del proveedor activo, hasta
   * `BACKFILL_BATCH` por corrida. No pide precios: encola, y el worker los pide
   * al ritmo global. Es la diferencia entre un job que gasta requests y uno que
   * respeta el presupuesto.
   *
   * ## Por qué cada hora y no una vez por día
   *
   * Por el **drenaje**, no por la cuota. El ritmo lo impone `ProviderRateGate`
   * (26/min) y el lote no lo cambia: 300 cartas son ~12 minutos de cola.
   *
   * La pregunta es cuánto tarda en vaciarse el backlog. Medido: con
   * `PRICE_PROVIDER=tcgdex` recién migrado, **20.667 de 20.670** cartas estaban
   * sin precio vigente. A 300 por día el backlog tarda 69 días en vaciarse, y
   * `sort=price` y los totales dan cero ese tiempo entero.
   *
   * A 300 por hora son 7.200 al día: el backlog se vacía en tres días y después
   * es un goteo. Y como el lote es chico, cada drenaje dura 12 minutos, así que
   * la cola no le queda llena de cartas de backfill por delante de la carta que
   * un usuario está mirando. Un lote de 5.000 vaciaría más rápido, pero dejaría
   * al usuario esperando una hora detrás de las 5.000.
   *
   * El `force: false` del sync de catálogo y este job son independientes a
   * propósito: uno mantiene el catálogo espejado, el otro los precios del
   * proveedor activo.
   */
  @Cron('13 * * * *')
  async backfillPricesHourly(): Promise<void> {
    if (!this.backfillEnabled) return;
    try {
      const { enqueued, pending } = await this.backfill.enqueueStale({ limit: BACKFILL_BATCH });
      this.logger.log(
        `Backfill: ${enqueued} encoladas, ${pending} cartas todavía sin precio vigente.`,
      );
    } catch (error) {
      // Un cron que lanza se cancela solo en algunas versiones de nest/schedule
      // y, en el peor caso, tumba el arranque del proceso. Un job de
      // mantenimiento que falla tiene que avisar y seguir.
      this.logger.error(`Falló el backfill: ${(error as Error).message}`);
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
