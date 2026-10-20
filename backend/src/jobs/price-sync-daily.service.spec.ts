import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PriceQueueService } from './price-queue.service.js';
import { PriceSyncRegistryService } from './price-sync-registry.service.js';
import { PriceSyncDailyService, utcDay } from './price-sync-daily.service.js';

describe('PriceSyncDailyService', () => {
  const setup = () => {
    const queryRaw = vi.fn(async () => []);
    const executeRaw = vi.fn(async () => 0);
    const enqueueMany = vi.fn(async () => 0);
    const ensureCuratedSeed = vi.fn(async () => ({ inserted: 0, missingSetIds: [] }));
    const queue = { enqueueMany } as unknown as PriceQueueService;
    const registry = {
      ensureCuratedSeed,
      reconcileCollectionSets: vi.fn(async () => 0),
    } as unknown as PriceSyncRegistryService;
    const config = { get: () => undefined } as unknown as ConfigService;
    const prisma = { $queryRaw: queryRaw, $executeRaw: executeRaw } as unknown as PrismaService;
    return { service: new PriceSyncDailyService(prisma, queue, registry, config), enqueueMany, ensureCuratedSeed, queryRaw };
  };

  it('normaliza el día con UTC, sin depender de la zona local', () => {
    expect(utcDay(new Date('2026-10-18T02:59:00-03:00')).toISOString()).toBe('2026-10-18T00:00:00.000Z');
  });

  it('espera el horario UTC antes de crear el ciclo', async () => {
    const { service, enqueueMany, ensureCuratedSeed } = setup();
    expect(await service.planToday(false, undefined, new Date('2026-10-18T03:14:59Z'))).toBe(0);
    expect(ensureCuratedSeed).toHaveBeenCalledOnce();
    expect(enqueueMany).not.toHaveBeenCalled();
  });

  it('una lista habilitada vacía falla cerrada y no crea jobs', async () => {
    const { service, enqueueMany } = setup();
    expect(await service.planToday(false, undefined, new Date('2026-10-18T03:15:00Z'))).toBe(0);
    expect(enqueueMany).not.toHaveBeenCalled();
  });
});
