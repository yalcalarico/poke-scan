import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import {
  CARD_DATA_PROVIDER,
  PROVIDER_IDS,
  type CardDataProvider,
} from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/index.js';
import { JobsRecoveryService } from './jobs-recovery.service.js';
import { PriceQueueService } from './price-queue.service.js';
import { SyncStateService } from './sync-state.service.js';

const provider: CardDataProvider = {
  id: PROVIDER_IDS.POKEMON_TCG_IO,
  getSets: async () => ({ data: [], page: 1, pageSize: 1, total: 0, totalPages: 1 }),
  getCardsPage: async () => ({ data: [], page: 1, pageSize: 1, total: 0, totalPages: 1 }),
  getCard: async () => null,
  getPricesForCard: async () => [],
};

describe('SyncStateService', () => {
  const prismaClient = new PrismaClient();
  let service: SyncStateService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SyncStateService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: CARD_DATA_PROVIDER, useValue: provider },
      ],
    }).compile();
    service = moduleRef.get(SyncStateService);
  });

  afterAll(async () => {
    await prismaClient.syncState.deleteMany({});
    await prismaClient.$disconnect();
  });

  beforeEach(async () => {
    await prismaClient.syncState.deleteMany({});
  });

  it('una base sin fila arranca en la página 0, no completa', async () => {
    expect(await service.readCards()).toEqual({
      lastPage: 0,
      totalPages: null,
      isComplete: false,
    });
  });

  it('guarda y relee el cursor', async () => {
    await service.saveCards(7, 83);

    expect(await service.readCards()).toEqual({
      lastPage: 7,
      totalPages: 83,
      isComplete: false,
    });
  });

  it('saveCards sin totalPages no pisa el que ya estaba', async () => {
    // El `pageSize` puede cambiar entre corridas, y mezclar el `totalPages` de una
    // con el `lastPage` de otra daría un "completo" en la página equivocada.
    await service.saveCards(7, 83);
    await service.saveCards(8);

    const state = await service.readCards();
    expect(state.lastPage).toBe(8);
    expect(state.totalPages).toBe(83);
  });

  it('completeCards marca el flag y no reinicia el cursor', async () => {
    await service.saveCards(83, 83);
    await service.completeCards(83);

    const state = await service.readCards();
    expect(state.isComplete).toBe(true);
    expect(state.lastPage).toBe(83);
  });

  it('reset borra la fila, así el próximo sync arranca de cero', async () => {
    await service.saveCards(83, 83);
    await service.completeCards(83);
    await service.resetCards();

    expect(await service.readCards()).toEqual({
      lastPage: 0,
      totalPages: null,
      isComplete: false,
    });
  });

  it('reset sobre un sync que nunca corrió no explota', async () => {
    await expect(service.resetCards()).resolves.toBeUndefined();
  });

  it('el cursor es por job y provider, no global', async () => {
    // La razón de que el id sea compuesto: el día que entre un segundo proveedor
    // de catálogo, su cursor no puede ser el mismo número de página.
    await service.saveCards(40, 83);
    await prismaClient.syncState.create({
      data: { id: 'cards:scrydex', lastPage: 3, totalPages: 90 },
    });

    expect((await service.readCards()).lastPage).toBe(40);
    const otro = await prismaClient.syncState.findUniqueOrThrow({
      where: { id: 'cards:scrydex' },
    });
    expect(otro.lastPage).toBe(3);
  });
});

describe('JobsRecoveryService', () => {
  const prismaClient = new PrismaClient();
  let recovery: JobsRecoveryService;
  let queue: PriceQueueService;
  let systemUserId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        JobsRecoveryService,
        PriceQueueService,
        { provide: PrismaService, useValue: prismaClient },
      ],
    }).compile();
    recovery = moduleRef.get(JobsRecoveryService);
    queue = moduleRef.get(PriceQueueService);

    const user = await prismaClient.user.findFirst({ select: { id: true } });
    if (!user) throw new Error('El spec necesita al menos un usuario en la base');
    systemUserId = user.id;
  });

  afterAll(async () => {
    // Sin esto, la última fila que crea el test queda `completed` en la base de
    // desarrollo y aparece en cualquier `SELECT` de la cola.
    await prismaClient.priceRefreshJob.deleteMany({});
    await prismaClient.scanJob.deleteMany({ where: { jobType: 'sync-catalog' } });
    await prismaClient.$disconnect();
  });

  beforeEach(async () => {
    await prismaClient.priceRefreshJob.deleteMany({});
    await prismaClient.scanJob.deleteMany({ where: { jobType: 'sync-catalog' } });
  });

  it('un scanJob en running más viejo que el TTL pasa a failed', async () => {
    const viejo = await prismaClient.scanJob.create({
      data: {
        userId: systemUserId,
        jobType: 'sync-catalog',
        status: 'running',
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    await recovery.onModuleInit();

    const row = await prismaClient.scanJob.findUniqueOrThrow({ where: { id: viejo.id } });
    expect(row.status).toBe('failed');
    expect(row.completedAt).not.toBeNull();
    // El mensaje dice que se puede reintentar y por qué: un `running` eterno
    // hace creer que hay trabajo en curso.
    expect(row.lastError).toMatch(/proceso/i);
  });

  it('un scanJob en running de una corrida sana no se toca', async () => {
    // Con dos instancias, el otro proceso puede estar syncando ahora mismo: tocar
    // su job sería cerrar un trabajo que está pasando.
    const enCurso = await prismaClient.scanJob.create({
      data: {
        userId: systemUserId,
        jobType: 'sync-catalog',
        status: 'running',
        startedAt: new Date(),
      },
    });

    await recovery.onModuleInit();

    const row = await prismaClient.scanJob.findUniqueOrThrow({ where: { id: enCurso.id } });
    expect(row.status).toBe('running');
  });

  it('un refresh de precio en processing abandonado vuelve a la cola', async () => {
    await prismaClient.priceRefreshJob.create({
      data: {
        id: 'abandonado-recuperacion',
        cardId: 'test-recovery-card',
        status: 'processing',
        lockedBy: 'proceso-muerto',
        lockedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    await recovery.onModuleInit();

    const row = await prismaClient.priceRefreshJob.findUniqueOrThrow({
      where: { cardId: 'test-recovery-card' },
    });
    expect(row.status).toBe('pending');
    expect(row.lockedBy).toBeNull();
    expect(await queue.pendingCount()).toBe(1);
  });
});
