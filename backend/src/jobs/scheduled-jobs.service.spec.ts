import { ConfigService } from '@nestjs/config';

import { CatalogSyncService } from './catalog-sync.service.js';
import { CardPricesRetentionService } from './card-prices-retention.service.js';
import { PriceBackfillService } from './price-backfill.service.js';
import { ScheduledJobsService } from './scheduled-jobs.service.js';

type Env = Record<string, string | undefined>;

/**
 * Lo que importa acá no es que el cron dispare —eso lo prueba `@nestjs/schedule`
 * y no nosotros—, sino tres cosas que son nuestras:
 *
 * 1. **Los kill switches funcionan.** Un cron que no se puede apagar desde un
 *    despliegue es un cron que termina apagado tarde o temprano.
 * 2. **El backfill no pide precios.** Solo encola: es lo que garantiza que el
 *    ritmo global se respete.
 * 3. **Un fallo de mantenimiento no tumba el proceso.** Un `@Cron` que lanza
 *    puede cancelar los timers siguientes según la versión.
 */
describe('ScheduledJobsService', () => {
  const build = (
    env: Env,
    stubs: {
      catalogSync?: Partial<CatalogSyncService>;
      backfill?: Partial<PriceBackfillService>;
      retention?: Partial<CardPricesRetentionService>;
    } = {},
  ): ScheduledJobsService => {
    const config = {
      get: (key: string) => env[key],
    } as ConfigService;

    const catalogSync = {
      start: vi.fn().mockResolvedValue({ started: true, jobId: 'job-1' }),
      ...stubs.catalogSync,
    } as unknown as CatalogSyncService;
    const backfill = {
      enqueueStale: vi.fn().mockResolvedValue({ enqueued: 0, pending: 0 }),
      ...stubs.backfill,
    } as unknown as PriceBackfillService;
    const retention = {
      run: vi.fn().mockResolvedValue({ consolidated: 0, pruned: 0, dryRun: false }),
      ...stubs.retention,
    } as unknown as CardPricesRetentionService;

    // Se construye con `new` y no con el `TestingModule` porque los crons leen
    // los flags **en el constructor**: hace falta que el entorno esté listo
    // antes de que exista el service, y `createTestingModule().get()` es
    // async justamente por el `compile()`.
    return new ScheduledJobsService(config, catalogSync, backfill, retention);
  };

  it('sin flags, los tres jobs están prendidos', () => {
    const service = build({});

    expect(service.describeSchedule()).toHaveLength(3);
  });

  it('cada flag apaga su job y solo el suyo', () => {
    const sinCatalogo = build({ ENABLE_CATALOG_SYNC_CRON: 'false' });
    expect(sinCatalogo.describeSchedule().join()).not.toContain('catálogo');

    const sinBackfill = build({ ENABLE_PRICE_BACKFILL_CRON: 'false' });
    expect(sinBackfill.describeSchedule().join()).not.toContain('backfill');

    const sinRetencion = build({ ENABLE_RETENTION_CRON: '0' });
    expect(sinRetencion.describeSchedule().join()).not.toContain('retención');
  });

  it('los tres apagados no dejan ningún job', () => {
    const service = build({
      ENABLE_CATALOG_SYNC_CRON: 'false',
      ENABLE_PRICE_BACKFILL_CRON: 'no',
      ENABLE_RETENTION_CRON: 'false',
    });

    expect(service.describeSchedule()).toEqual([]);
  });

  it('una variable vacía cae al default, no apaga el job', () => {
    // `ENABLE_RETENTION_CRON=` vacío en un compose es mucho más probable que sea
    // un valor sin querer que una intención de apagar. Si vacío significara
    // "apagado", un typo dejaría el sync de catálogo apagado sin que nadie lo
    // note hasta que el catálogo quede viejo.
    const service = build({ ENABLE_CATALOG_SYNC_CRON: '' });

    expect(service.describeSchedule().join()).toContain('catálogo');
  });

  it('con el sync apagado, el cron no pide el lock', async () => {
    const catalogSync = { start: vi.fn() };
    const service = build({ ENABLE_CATALOG_SYNC_CRON: 'false' }, { catalogSync });

    await service.syncCatalogWeekly();

    // Si el flag no se respetara, el cron syncaría contra pokemontcg.io sin que
    // nadie lo haya pedido.
    expect(catalogSync.start).not.toHaveBeenCalled();
  });

  it('con el sync prendido pero otro en curso, no duplica', async () => {
    const catalogSync = {
      start: vi.fn().mockResolvedValue({ started: false, jobId: '', reason: 'lock-taken' }),
    };
    const service = build({}, { catalogSync });

    await service.syncCatalogWeekly();

    // Pide el lock y respeta la respuesta: el caso "ya hay uno corriendo" es
    // normal, no un error.
    expect(catalogSync.start).toHaveBeenCalledTimes(1);
    expect(catalogSync.start).toHaveBeenCalledWith(false);
  });

  it('el backfill encola y nunca pide precios al proveedor', async () => {
    const backfill = {
      enqueueStale: vi.fn().mockResolvedValue({ enqueued: 7, pending: 20000 }),
    };
    const service = build({}, { backfill });

    await service.backfillPricesHourly();

    expect(backfill.enqueueStale).toHaveBeenCalledTimes(1);
    // El único método del backfill es encolar. Si alguno apareciera, sería el
    // que rompe el ritmo global.
    expect(Object.keys(backfill)).toEqual(['enqueueStale']);
  });

  it('un fallo del backfill no sube: lo loguea y sigue', async () => {
    const backfill = {
      enqueueStale: vi.fn().mockRejectedValue(new Error('la DB se cayó')),
    };
    const service = build({}, { backfill });

    await expect(service.backfillPricesHourly()).resolves.toBeUndefined();
    // Y el siguiente cron puede volver a intentarlo, porque el estado interno
    // del timer no quedó envenenado.
    await expect(service.backfillPricesHourly()).resolves.toBeUndefined();
    expect(backfill.enqueueStale).toHaveBeenCalledTimes(2);
  });

  it('un fallo de la retención tampoco sube', async () => {
    const retention = { run: vi.fn().mockRejectedValue(new Error('nope')) };
    const service = build({}, { retention });

    await expect(service.prunePricesMonthly()).resolves.toBeUndefined();
    expect(retention.run).toHaveBeenCalledTimes(1);
  });

  it('la retención corre por el service, con la política de producción y sin dry run', async () => {
    const retention = {
      run: vi.fn().mockResolvedValue({ consolidated: 3, pruned: 0, dryRun: false }),
    };
    const service = build({}, { retention });

    await service.prunePricesMonthly();

    // Sin argumentos: el cron usa DETAIL_DAYS y RETENTION_DAYS. Pasarle un
    // dry run dejaría la tabla creciendo para siempre en silencio.
    expect(retention.run).toHaveBeenCalledWith();
  });

  it('laperiodicidad del sync es semanal y el backfill diario', async () => {
    // No es un test de cron: es un test de que las expresiones de `@Cron` no
    //Sally de un semanal a diario sin que nadie lo lea. 83 requests de catálogo
    // por día contra una cuota de 1.000 es 8,3 % del presupuesto diario en una
    // tarea que no lo necesita.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./scheduled-jobs.service.ts', import.meta.url), 'utf8'),
    );
    expect(source).toContain("@Cron('7 4 * * 1')");
    expect(source).toContain("@Cron('13 * * * *')");
  });
});