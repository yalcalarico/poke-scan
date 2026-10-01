import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../prisma/index.js';
import { RedisService } from '../redis/index.js';
import { CatalogSyncService } from './catalog-sync.service.js';
import { SyncCardsService } from './sync-cards.service.js';
import { SYNC_LOCK_KEY, SYNC_LOCK_TTL_SECONDS } from './sync.constants.js';

/**
 * Redis de mentira con el lock real semántico: un solo ganador, y `release`
 * devuelve `false` si el token no es el propio.
 */
const stubRedis = () => {
  const locks = new Map<string, { token: string }>();
  return {
    isAvailable: () => true,
    get: async () => null,
    getNumber: async () => null,
    getJson: async () => null,
    set: async () => undefined,
    setJson: async () => undefined,
    del: async () => undefined,
    acquireLock: async (key: string, token: string) => {
      if (locks.has(key)) return false;
      locks.set(key, { token });
      return true;
    },
    extendLock: async (key: string, token: string) =>
      locks.get(key)?.token === token,
    releaseLock: async (key: string, token: string) => {
      if (locks.get(key)?.token !== token) return false;
      locks.delete(key);
      return true;
    },
    _locks: locks,
  };
};

describe('CatalogSyncService', () => {
  const prismaClient = new PrismaClient();
  let service: CatalogSyncService;
  let syncCards: { syncAll: ReturnType<typeof vi.fn> };
  let redis: ReturnType<typeof stubRedis>;

  beforeAll(async () => {
    const existing = await prismaClient.user.findFirst({ select: { id: true } });
    if (!existing) throw new Error('El spec necesita al menos un usuario en la base');

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogSyncService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: RedisService, useValue: redis },
        { provide: SyncCardsService, useValue: { syncAll: vi.fn() } },
      ],
    }).compile();
    service = moduleRef.get(CatalogSyncService);
    syncCards = { syncAll: vi.fn().mockResolvedValue({ processed: 0, total: 0, skipped: true }) };
  });

  afterAll(async () => {
    await prismaClient.scanJob.deleteMany({ where: { jobType: 'sync-catalog' } });
    await prismaClient.$disconnect();
  });

  beforeEach(async () => {
    redis = stubRedis();
    await prismaClient.scanJob.deleteMany({ where: { jobType: 'sync-catalog' } });
    syncCards.syncAll.mockClear();
  });

  const build = async (): Promise<void> => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogSyncService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: RedisService, useValue: redis },
        { provide: SyncCardsService, useValue: { syncAll: syncCards.syncAll } },
      ],
    }).compile();
    service = moduleRef.get(CatalogSyncService);
  };

  it('toma el lock, crea el ScanJob y arranca', async () => {
    await build();
    // El sync queda colgado a propósito: `start` dispara `run` en
    // fire-and-forget, así que con un stub que resuelve al instante el job ya
    // estaría terminado cuando se lee la fila, y "running" sería imposible de
    // observar. Colgándolo, el estado en vuelo es un invariante real.
    let liberar: () => void = () => undefined;
    syncCards.syncAll.mockImplementationOnce(
      () => new Promise((resolve) => { liberar = () => resolve({ processed: 0, total: 0, skipped: true }); }),
    );

    const result = await service.start(false);

    expect(result.started).toBe(true);
    expect(result.jobId).toBeTruthy();
    expect(redis._locks.has(SYNC_LOCK_KEY)).toBe(true);
    const job = await prismaClient.scanJob.findUniqueOrThrow({
      where: { id: result.jobId },
    });
    expect(job.status).toBe('running');
    expect(job.jobType).toBe('sync-catalog');

    liberar();
  });

  /*
   * La garantía estructural de la Fase 3.
   *
   * El cron y el endpoint disparan el mismo service. Si el cron tuviera su propio
   * camino, el lock solo se pediría en el endpoint y "alguien pidió el sync
   * mientras ya había uno" —el escenario para el que el lock existe— duplicaría
   * los requests contra pokemontcg.io, que es el recurso más escaso del
   * proyecto. Con un solo service, el segundo apenas puede hacer `start`.
   */
  it('un segundo start no arranca nada: se queda sin lock', async () => {
    await build();

    const primero = await service.start(false);
    const segundo = await service.start(false);

    expect(primero.started).toBe(true);
    expect(segundo.started).toBe(false);
    expect(segundo.reason).toBe('lock-taken');
    expect(segundo.jobId).toBe('');
    // Y no dejó un ScanJob colgado: el 409 del endpoint sale por `started:false`,
    // no por un registro que nunca termina.
    const jobs = await prismaClient.scanJob.count({ where: { jobType: 'sync-catalog' } });
    expect(jobs).toBe(1);
  });

  it('run anota skipped sin processed', async () => {
    await build();
    const started = await service.start(false);
    const token = 'token-de-test';

    await service.run(started.jobId, false, token);

    const job = await prismaClient.scanJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    expect(job.status).toBe('skipped');
    expect(job.completedAt).not.toBeNull();
  });

  it('run anota failed y guarda el error cuando el sync explota', async () => {
    await build();
    syncCards.syncAll.mockRejectedValueOnce(new Error('boom de pokemontcg.io'));
    const started = await service.start(false);

    await service.run(started.jobId, false, 'token-de-test');

    const job = await prismaClient.scanJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    expect(job.status).toBe('failed');
    expect(job.lastError).toBe('boom de pokemontcg.io');
  });

  it('el TTL del lock es el que dice el contrato, no uno nuevo', async () => {
    // El TTL tiene que seguir siendo 30 min: el sync tarda 15-20 y el TTL es la
    // red que evita que un proceso muerto bloquee el sync siguiente para siempre.
    expect(SYNC_LOCK_TTL_SECONDS).toBe(1800);
  });
});