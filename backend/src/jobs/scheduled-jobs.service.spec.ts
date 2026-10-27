import { ConfigService } from '@nestjs/config';

import { CatalogSyncService } from './catalog-sync.service.js';
import { CardPricesRetentionService } from './card-prices-retention.service.js';
import { ScheduledJobsService } from './scheduled-jobs.service.js';

type Env = Record<string, string | undefined>;

/**
 * Lo que importa acá no es que el cron dispare —eso lo prueba `@nestjs/schedule`
 * y no nosotros—, sino tres cosas que son nuestras:
 *
 * 1. **Los kill switches funcionan.** Un cron que no se puede apagar desde un
 *    despliegue es un cron que termina apagado tarde o temprano.
 * 2. **TCGCSV requiere habilitación explícita.** No hay otro ciclo de precios.
 * 3. **Un fallo de mantenimiento no tumba el proceso.** Un `@Cron` que lanza
 *    puede cancelar los timers siguientes según la versión.
 */
describe('ScheduledJobsService', () => {
  const build = (
    env: Env,
    stubs: {
      catalogSync?: Partial<CatalogSyncService>;
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
    const retention = {
      run: vi.fn().mockResolvedValue({ consolidated: 0, pruned: 0, dryRun: false }),
      ...stubs.retention,
    } as unknown as CardPricesRetentionService;

    // Se construye con `new` y no con el `TestingModule` porque los crons leen
    // los flags **en el constructor**: hace falta que el entorno esté listo
    // antes de que exista el service, y `createTestingModule().get()` es
    // async justamente por el `compile()`.
    return new ScheduledJobsService(config, catalogSync, retention,
      {} as import('../prisma/index.js').PrismaService,
      { enabled: () => env.ENABLE_TCGCSV_INGESTION === 'true' } as import('./tcgcsv/tcgcsv.service.js').TcgcsvService);
  };

  it('sin flags, catálogo y retención están prendidos y TCGCSV requiere habilitación explícita', () => {
    const service = build({});

    expect(service.describeSchedule()).toHaveLength(2);
  });

  it('cada flag apaga su job y solo el suyo', () => {
    const sinCatalogo = build({ ENABLE_CATALOG_SYNC_CRON: 'false' });
    expect(sinCatalogo.describeSchedule().join()).not.toContain('catálogo');

    const conPrecios = build({ ENABLE_TCGCSV_INGESTION: 'true' });
    expect(conPrecios.describeSchedule().join()).toContain('TCGCSV');

    const sinRetencion = build({ ENABLE_RETENTION_CRON: '0' });
    expect(sinRetencion.describeSchedule().join()).not.toContain('retención');
  });

  it('los tres apagados no dejan ningún job', () => {
    const service = build({
      ENABLE_CATALOG_SYNC_CRON: 'false',
      ENABLE_TCGCSV_INGESTION: 'false',
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

});
