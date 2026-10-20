import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/index.js';
import type { PriceProvider } from '../modules/providers/card-provider.interface.js';
import type { CatalogSyncService } from './catalog-sync.service.js';
import type { CardPricesRetentionService } from './card-prices-retention.service.js';
import type { PriceBackfillService } from './price-backfill.service.js';
import { ScheduledJobsService } from './scheduled-jobs.service.js';
import type { TcgcsvService } from './tcgcsv/tcgcsv.service.js';
import type { PriceSyncDailyService } from './price-sync-daily.service.js';

interface Control {
  provider: string; requestedGeneration: number; handledGeneration: number; lastHandledAt: Date | null;
  heartbeatAt: Date | null; schedulerEnabled: boolean; workerConfiguredEnabled: boolean; lockedBy: string | null;
  leaseUntil: Date | null; nextCycleAt: Date; lastError: string | null;
}
describe('Ciclos manuales: señal durable y consumidores únicos', () => {
  const prisma = new PrismaClient();
  let originals: Control[] = [];
  const planToday = vi.fn(async () => 3);
  const discover = vi.fn(async () => true);
  const build = (enabled = true, worker = true): ScheduledJobsService => new ScheduledJobsService(
    { get: (key: string) => key === 'ENABLE_PRICE_BACKFILL_CRON' ? String(enabled) : key === 'PRICE_QUEUE_ENABLED' ? String(worker) : 'false' } as ConfigService,
    {} as CatalogSyncService, {} as PriceBackfillService, {} as CardPricesRetentionService,
    prisma as PrismaService, { enabled: () => enabled, discover, signalDaily: async () => 0 } as unknown as TcgcsvService, { id: 'tcgdex' } as PriceProvider,
    { planToday } as unknown as PriceSyncDailyService,
  );
  beforeAll(async () => { originals = await prisma.$queryRaw<Control[]>`SELECT * FROM price_sync_controls ORDER BY provider`; });
  beforeEach(async () => {
    planToday.mockReset().mockResolvedValue(3);
    discover.mockReset().mockResolvedValue(true);
    await prisma.$executeRaw`
      UPDATE price_sync_controls SET "requestedGeneration" = 1, "handledGeneration" = 0, "lastHandledAt" = NULL,
        "lockedBy" = NULL, "leaseUntil" = NULL, "nextCycleAt" = NOW(), "lastError" = NULL
    `;
  });
  afterAll(async () => {
    for (const original of originals) await prisma.$executeRaw`
      UPDATE price_sync_controls SET "requestedGeneration" = ${original.requestedGeneration}, "handledGeneration" = ${original.handledGeneration},
        "lastHandledAt" = ${original.lastHandledAt}, "heartbeatAt" = ${original.heartbeatAt}, "schedulerEnabled" = ${original.schedulerEnabled},
        "workerConfiguredEnabled" = ${original.workerConfiguredEnabled}, "lockedBy" = ${original.lockedBy}, "leaseUntil" = ${original.leaseUntil},
        "nextCycleAt" = ${original.nextCycleAt}, "lastError" = ${original.lastError} WHERE provider = ${original.provider}
    `;
    await prisma.$disconnect();
  });
  it('dos instancias atienden una sola vez cada señal y no crean consumidores de red', async () => {
    await Promise.all([build().pollPriceCycles(), build().pollPriceCycles()]);
    expect(planToday).toHaveBeenCalledOnce();
    expect(planToday).toHaveBeenCalledWith(true);
    expect(discover).toHaveBeenCalledOnce();
    expect(discover).toHaveBeenCalledWith(true);
    const controls = await prisma.$queryRaw<Control[]>`SELECT * FROM price_sync_controls`;
    expect(controls.every((row) => row.handledGeneration === 1 && row.lockedBy === null)).toBe(true);
  });
  it('flags apagados conservan la señal y heartbeat identifica que no puede procesarse', async () => {
    await build(false, false).pollPriceCycles();
    expect(planToday).not.toHaveBeenCalled(); expect(discover).not.toHaveBeenCalled();
    const controls = await prisma.$queryRaw<Control[]>`SELECT * FROM price_sync_controls`;
    expect(controls.every((row) => row.handledGeneration === 0 && !row.schedulerEnabled && !row.workerConfiguredEnabled && row.heartbeatAt !== null)).toBe(true);
  });
  it('worker apagado conserva la señal y no encola el ciclo', async () => {
    await build(true, false).pollPriceCycles();
    const [control] = await prisma.$queryRaw<Control[]>`SELECT * FROM price_sync_controls WHERE provider = 'tcgdex'`;
    expect(control).toMatchObject({ schedulerEnabled: true, workerConfiguredEnabled: false });
    expect(planToday).not.toHaveBeenCalled();
    const [pending] = await prisma.$queryRaw<Control[]>`SELECT * FROM price_sync_controls WHERE provider = 'tcgdex'`;
    expect(pending.handledGeneration).toBe(0);
  });
  it('lease activo impide duplicación y otra instancia recupera un lease vencido sin perder el pedido', async () => {
    await prisma.$executeRaw`UPDATE price_sync_controls SET "lockedBy" = 'test-other', "leaseUntil" = NOW() + INTERVAL '1 hour' WHERE provider = 'tcgdex'`;
    await build().pollPriceCycles();
    expect(planToday).not.toHaveBeenCalled();
    await prisma.$executeRaw`UPDATE price_sync_controls SET "leaseUntil" = NOW() - INTERVAL '1 second' WHERE provider = 'tcgdex'`;
    await build().pollPriceCycles();
    expect(planToday).toHaveBeenCalledOnce();
  });
  it('un error conserva la señal con backoff durable; un falso discovery no se da por atendido', async () => {
    planToday.mockRejectedValueOnce(new Error('fixture fallida'));
    discover.mockResolvedValue(false);
    await build().pollPriceCycles();
    const controls = await prisma.$queryRaw<Control[]>`SELECT * FROM price_sync_controls ORDER BY provider`;
    expect(controls.every((row) => row.handledGeneration === 0 && row.lockedBy === null)).toBe(true);
    expect(controls.find((row) => row.provider === 'tcgdex')?.lastError).toBe('No se pudo encolar el ciclo de precios');
    await build().pollPriceCycles();
    expect(planToday).toHaveBeenCalledOnce(); expect(discover).toHaveBeenCalledOnce();
  });
});
