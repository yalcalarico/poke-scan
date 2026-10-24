import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/index.js';
import type { CatalogSyncService } from './catalog-sync.service.js';
import type { CardPricesRetentionService } from './card-prices-retention.service.js';
import { ScheduledJobsService } from './scheduled-jobs.service.js';
import type { TcgcsvService } from './tcgcsv/tcgcsv.service.js';

interface Control {
  provider: string; requestedGeneration: number; handledGeneration: number; lastHandledAt: Date | null;
  heartbeatAt: Date | null; schedulerEnabled: boolean; workerConfiguredEnabled: boolean; lockedBy: string | null;
  leaseUntil: Date | null; nextCycleAt: Date; lastError: string | null;
}

describe('Ciclos TCGCSV: señal durable y consumidor único', () => {
  const prisma = new PrismaClient();
  let originals: Control[] = [];
  const discover = vi.fn(async () => true);
  const signalDaily = vi.fn(async () => 0);
  const build = (enabled = true): ScheduledJobsService => new ScheduledJobsService(
    new ConfigService({ ENABLE_CATALOG_SYNC_CRON: 'false', ENABLE_RETENTION_CRON: 'false' }),
    {} as CatalogSyncService, {} as CardPricesRetentionService, prisma as PrismaService,
    { enabled: () => enabled, discover, signalDaily } as unknown as TcgcsvService,
  );

  beforeAll(async () => { originals = await prisma.$queryRaw<Control[]>`SELECT * FROM price_sync_controls ORDER BY provider`; });
  beforeEach(async () => {
    discover.mockReset().mockResolvedValue(true);
    signalDaily.mockReset().mockResolvedValue(0);
    await prisma.$executeRaw`
      UPDATE price_sync_controls SET "requestedGeneration" = 1, "handledGeneration" = 0, "lastHandledAt" = NULL,
        "lockedBy" = NULL, "leaseUntil" = NULL, "nextCycleAt" = NOW(), "lastError" = NULL
      WHERE provider = 'tcgcsv'
    `;
  });
  afterAll(async () => {
    for (const row of originals) await prisma.$executeRaw`
      UPDATE price_sync_controls SET "requestedGeneration" = ${row.requestedGeneration}, "handledGeneration" = ${row.handledGeneration},
        "lastHandledAt" = ${row.lastHandledAt}, "heartbeatAt" = ${row.heartbeatAt}, "schedulerEnabled" = ${row.schedulerEnabled},
        "workerConfiguredEnabled" = ${row.workerConfiguredEnabled}, "lockedBy" = ${row.lockedBy}, "leaseUntil" = ${row.leaseUntil},
        "nextCycleAt" = ${row.nextCycleAt}, "lastError" = ${row.lastError} WHERE provider = ${row.provider}
    `;
    await prisma.$disconnect();
  });
  const control = async () => (await prisma.$queryRaw<Control[]>`SELECT * FROM price_sync_controls WHERE provider = 'tcgcsv'`)[0]!;

  it('dos instancias atienden una sola vez la señal, sin tocar el control histórico', async () => {
    const before = await prisma.$queryRaw<Control[]>`SELECT * FROM price_sync_controls WHERE provider = 'tcgdex'`;
    await Promise.all([build().pollPriceCycles(), build().pollPriceCycles()]);
    expect(discover).toHaveBeenCalledExactlyOnceWith(true);
    expect(signalDaily).toHaveBeenCalledOnce();
    expect(await control()).toMatchObject({ handledGeneration: 1, lockedBy: null });
    expect(await prisma.$queryRaw<Control[]>`SELECT * FROM price_sync_controls WHERE provider = 'tcgdex'`).toEqual(before);
  });

  it('ingesta apagada conserva la señal y publica heartbeat sin prometer un worker', async () => {
    await build(false).pollPriceCycles();
    expect(discover).not.toHaveBeenCalled();
    expect(signalDaily).not.toHaveBeenCalled();
    expect(await control()).toMatchObject({ handledGeneration: 0, schedulerEnabled: false, workerConfiguredEnabled: false });
    expect((await control()).heartbeatAt).not.toBeNull();
  });

  it('un lease activo impide duplicación y un lease vencido permite recuperar el pedido', async () => {
    await prisma.$executeRaw`UPDATE price_sync_controls SET "lockedBy" = 'test-other', "leaseUntil" = NOW() + INTERVAL '1 hour' WHERE provider = 'tcgcsv'`;
    await build().pollPriceCycles();
    expect(discover).not.toHaveBeenCalled();
    await prisma.$executeRaw`UPDATE price_sync_controls SET "leaseUntil" = NOW() - INTERVAL '1 second' WHERE provider = 'tcgcsv'`;
    await build().pollPriceCycles();
    expect(discover).toHaveBeenCalledOnce();
    expect(await control()).toMatchObject({ handledGeneration: 1, lockedBy: null });
  });

  it('un error conserva la señal y aplica backoff durable sin bloquear el proceso', async () => {
    discover.mockRejectedValueOnce(new Error('Fallo de discovery'));
    await build().pollPriceCycles();
    const row = await control();
    expect(row).toMatchObject({ handledGeneration: 0, lockedBy: null, lastError: 'No se pudo encolar el ciclo de precios' });
    expect(row.nextCycleAt.getTime()).toBeGreaterThan(Date.now() + 3_500_000);
    expect(signalDaily).not.toHaveBeenCalled();
    await build().pollPriceCycles();
    expect(discover).toHaveBeenCalledOnce();
  });

  it('discovery incompleto no consume la señal y mantiene la señalización diaria', async () => {
    discover.mockResolvedValue(false);
    await build().pollPriceCycles();
    expect(await control()).toMatchObject({ handledGeneration: 0, lockedBy: null, lastError: null });
    expect(signalDaily).toHaveBeenCalledOnce();
  });
});
