import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { PRICE_PROVIDER, type PriceProvider } from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/index.js';
import { PriceQueueWorker } from './price-queue.worker.js';
import {
  MAX_PRICE_REFRESH_ATTEMPTS,
  PriceQueueService,
} from './price-queue.service.js';
import { ProviderRateGate } from './provider-rate.gate.js';
import { SyncPricesService } from './sync-prices.service.js';

const TEST_CARD_PREFIX = 'test-queue-';
const TEST_CARD_A = `${TEST_CARD_PREFIX}a`;
const TEST_CARD_B = `${TEST_CARD_PREFIX}b`;
const TEST_CARD_C = `${TEST_CARD_PREFIX}c`;

/**
 * Estos tests van contra la tabla de verdad, y eso es el punto: la cola es una
 * fila en Postgres y las dos instancias de `ProviderRateGate` que se胳膊an acá
 * representan dos procesos del backend hablando con la misma base.
 */
describe('cola de precios persistente', () => {
  const prismaClient = new PrismaClient();
  let queue: PriceQueueService;
  let gate: ProviderRateGate;
  let gate2: ProviderRateGate;

  const providerStub: PriceProvider = {
    id: 'tcgdex',
    defaultSource: 'tcgplayer',
    defaultCurrency: 'USD',
    listSets: vi.fn(),
    getSetDetail: vi.fn(),
    getCardPrices: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PriceQueueService,
        ProviderRateGate,
        { provide: PrismaService, useValue: prismaClient },
        { provide: PRICE_PROVIDER, useValue: providerStub },
      ],
    }).compile();

    queue = moduleRef.get(PriceQueueService);
    gate = moduleRef.get(ProviderRateGate);
    // "Segunda instancia": un objeto distinto sobre la misma fila, que es lo
    // que hace un segundo proceso del backend.
    gate2 = new ProviderRateGate(
      prismaClient as unknown as PrismaService,
      providerStub,
    );
  });

  afterAll(async () => {
    await prismaClient.priceRefreshJob.deleteMany({});
    await prismaClient.providerRateLimit.deleteMany({});
    await prismaClient.$disconnect();
  });

  beforeEach(async () => {
    gate.setGapMs(0);
    gate2.setGapMs(0);
    /*
     * Se vacía la tabla **entera**, no solo las filas de este spec.
     *
     * `claimNext` ordena por `availableAt` y no filtra por carta, así que una
     * fila que otro spec dejó `pending` se le vuelve a este: el claim se la
     * llevaría y la aserción "tiré las dos filas que encolé" fallaría por algo
     * que no es de este código. Los specs corren en serie
     * (`fileParallelism: false`), así que en este punto no hay ningún worker
     * ajeno claimsando y vaciar la tabla es seguro.
     */
    await prismaClient.priceRefreshJob.deleteMany({});
    // El reloj del proveedor se reinicia con cada test: el gap es compartido, y
    // un `lastCalledAt` del test anterior haría dormir a este.
    await prismaClient.providerRateLimit.deleteMany({});
  });

  describe('deduplicación', () => {
    it('encolar N veces la misma carta deja una fila', async () => {
      await queue.enqueueAsync(TEST_CARD_A);
      await queue.enqueueAsync(TEST_CARD_A);
      await queue.enqueueAsync(TEST_CARD_A);

      const rows = await prismaClient.priceRefreshJob.findMany({
        where: { cardId: TEST_CARD_A },
      });
      expect(rows).toHaveLength(1);
    });

    it('encolar mientras la carta está en processing no la reprograma', async () => {
      // Es el caso que evita el doble request: la fila está tomada por el
      // worker, y una lectura encolando de nuevo no debe volver a armarla.
      await queue.enqueueAsync(TEST_CARD_A);
      const claimed = await queue.claimNext('instancia-1');
      expect(claimed?.cardId).toBe(TEST_CARD_A);

      const reenqueued = await queue.enqueueAsync(TEST_CARD_A);

      expect(reenqueued).toBe(false);
      const row = await prismaClient.priceRefreshJob.findUniqueOrThrow({
        where: { cardId: TEST_CARD_A },
      });
      expect(row.status).toBe('processing');
      expect(row.lockedBy).toBe('instancia-1');
    });

    it('encolar una carta ya terminada la vuelve a armar', async () => {
      await queue.enqueueAsync(TEST_CARD_A);
      const claimed = await queue.claimNext('instancia-1');
      await queue.complete(claimed!.id);

      const reenqueued = await queue.enqueueAsync(TEST_CARD_A);

      expect(reenqueued).toBe(true);
      const row = await prismaClient.priceRefreshJob.findUniqueOrThrow({
        where: { cardId: TEST_CARD_A },
      });
      expect(row.status).toBe('pending');
    });
  });

  describe('claim', () => {
    it('dos instancias nunca toman la misma fila', async () => {
      await queue.enqueueAsync(TEST_CARD_A);
      await queue.enqueueAsync(TEST_CARD_B);

      // Las dos instancias,...
      const [first, second] = await Promise.all([
        queue.claimNext('instancia-1'),
        queue.claimNext('instancia-2'),
      ]);
      // ...toman filas distintas, y entre las dos se llevan la cola entera.
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first!.id).not.toBe(second!.id);
      expect([first!.cardId, second!.cardId].sort()).toEqual(
        [TEST_CARD_A, TEST_CARD_B].sort(),
      );
      expect(await queue.claimNext('instancia-3')).toBeNull();
    });

    it('el claim suma un intento y deja quién lo tomó', async () => {
      await queue.enqueueAsync(TEST_CARD_A);

      const claimed = await queue.claimNext('instancia-1');

      expect(claimed?.attempts).toBe(1);
      const row = await prismaClient.priceRefreshJob.findUniqueOrThrow({
        where: { cardId: TEST_CARD_A },
      });
      expect(row.attempts).toBe(1);
      expect(row.lockedBy).toBe('instancia-1');
      expect(row.lockedAt).not.toBeNull();
    });

    it('una fila con availableAt en el futuro no se reclama', async () => {
      await prismaClient.priceRefreshJob.create({
        data: {
          id: 'futura',
          cardId: TEST_CARD_A,
          availableAt: new Date(Date.now() + 60_000),
        },
      });

      expect(await queue.claimNext('instancia-1')).toBeNull();
    });

    it('el orden es FIFO por availableAt, no por orden de inserción', async () => {
      await prismaClient.priceRefreshJob.createMany({
        data: [
          { id: 'tarde', cardId: TEST_CARD_B, availableAt: new Date(Date.now() + 10_000) },
          { id: 'pronto', cardId: TEST_CARD_A, availableAt: new Date(Date.now() - 10_000) },
        ],
      });

      const claimed = await queue.claimNext('instancia-1');

      expect(claimed?.cardId).toBe(TEST_CARD_A);
    });
  });

  describe('fallos y backoff', () => {
    it('un fallo con intentos disponibles vuelve a pending con backoff creciente', async () => {
      await queue.enqueueAsync(TEST_CARD_A);
      const first = await queue.claimNext('instancia-1');
      const t0 = Date.now();

      const status = await queue.fail(first!.id, first!.attempts, 'tcgdex 503');

      expect(status).toBe('pending');
      const row = await prismaClient.priceRefreshJob.findUniqueOrThrow({
        where: { cardId: TEST_CARD_A },
      });
      // 30 s de base para el primer fallo.
      expect(row.availableAt.getTime()).toBeGreaterThanOrEqual(t0 + 29_000);
      expect(row.lastError).toBe('tcgdex 503');
      expect(row.lockedBy).toBeNull();
    });

    it('agotados los intentos la fila queda failed y no se reintenta sola', async () => {
      await queue.enqueueAsync(TEST_CARD_A);
      const claimed = await queue.claimNext('instancia-1');

      const status = await queue.fail(
        claimed!.id,
        MAX_PRICE_REFRESH_ATTEMPTS,
        'tcgdex 503',
      );

      expect(status).toBe('failed');
      // Y no hay claim posible hasta que una señal nueva la rearme.
      await prismaClient.priceRefreshJob.update({
        where: { id: claimed!.id },
        data: { availableAt: new Date(Date.now() - 60_000) },
      });
      expect(await queue.claimNext('instancia-1')).toBeNull();
    });

    it('encolar nunca adelanta un backoff pendiente', async () => {
      await queue.enqueueAsync(TEST_CARD_A);
      const claimed = await queue.claimNext('instancia-1');
      const backoffUntil = new Date(Date.now() + 600_000);
      await prismaClient.priceRefreshJob.update({
        where: { id: claimed!.id },
        data: { status: 'failed', availableAt: backoffUntil },
      });

      await queue.enqueueAsync(TEST_CARD_A);

      const row = await prismaClient.priceRefreshJob.findUniqueOrThrow({
        where: { cardId: TEST_CARD_A },
      });
      expect(row.status).toBe('pending');
      // Aunque la rearme, la fila no puede corriderse antes del backoff: si no,
      // cada lectura de una carta rota sería un request nuevo al proveedor.
      expect(row.availableAt.getTime()).toBeGreaterThanOrEqual(
        backoffUntil.getTime() - 1000,
      );
    });

    it('completar limpia el error y el lock', async () => {
      await queue.enqueueAsync(TEST_CARD_A);
      const claimed = await queue.claimNext('instancia-1');

      await queue.complete(claimed!.id);

      const row = await prismaClient.priceRefreshJob.findUniqueOrThrow({
        where: { cardId: TEST_CARD_A },
      });
      expect(row.status).toBe('completed');
      expect(row.lastError).toBeNull();
      expect(row.lockedBy).toBeNull();
      expect(row.completedAt).not.toBeNull();
    });
  });

  describe('recuperación de jobs abandonados', () => {
    it('un processing viejo vuelve a la cola; uno reciente se deja', async () => {
      const viejo = await prismaClient.priceRefreshJob.create({
        data: {
          id: 'abandonado',
          cardId: TEST_CARD_A,
          status: 'processing',
          lockedBy: 'proceso-muerto',
          lockedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });
      await prismaClient.priceRefreshJob.create({
        data: {
          id: 'en-curso',
          cardId: TEST_CARD_B,
          status: 'processing',
          lockedBy: 'proceso-vivo',
          lockedAt: new Date(),
        },
      });

      const recovered = await queue.reconcileAbandoned();

      expect(recovered).toBe(1);
      const recuperada = await prismaClient.priceRefreshJob.findUniqueOrThrow({
        where: { id: viejo.id },
      });
      expect(recuperada.status).toBe('pending');
      expect(recuperada.lockedBy).toBeNull();
      const enCurso = await prismaClient.priceRefreshJob.findUniqueOrThrow({
        where: { id: 'en-curso' },
      });
      expect(enCurso.status).toBe('processing');
    });

    it('lo que estaba processing y se recuperó se puede reclamar', async () => {
      await prismaClient.priceRefreshJob.create({
        data: {
          id: 'abandonado',
          cardId: TEST_CARD_A,
          status: 'processing',
          lockedBy: 'proceso-muerto',
          lockedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });
      // Dejá `availableAt` un segundo en el pasado para que el reloj de Postgres
      // no lo vea unos milisegundos en el futuro respecto del reloj de Node.
      await queue.reconcileAbandoned(new Date(Date.now() - 1_000));

      const claimed = await queue.claimNext('instancia-nueva');

      expect(claimed?.cardId).toBe(TEST_CARD_A);
      // `attempts` arranca en 0 porque la fila se insertó a mano: el primer
      // claim real es el que lo sube a 1. La recuperación no inventa intentos.
      expect(claimed?.attempts).toBe(1);
    });
  });

  describe('ritmo global del proveedor', () => {
    it('dos instancias se turnan el slot y respetan el gap entre las dos', async () => {
      // Esta es la razón de existir de la tabla: el gap era un `Date.now()` en
      // memoria, o sea un reloj por proceso.
      const GAP_MS = 200;
      gate.setGapMs(GAP_MS);
      gate2.setGapMs(GAP_MS);
      const started: number[] = [];

      const call = async (g: ProviderRateGate) => {
        await g.wait();
        started.push(Date.now());
      };

      await Promise.all([call(gate), call(gate2), call(gate)]);

      expect(started).toHaveLength(3);
      /*
       * La tolerancia no es laxidad: `wait()` duerme `lastCalledAt + gap -
       * Date.now()`, y el `lastCalledAt` lo escribió el **servidor** mientras que
       * la medición es del **cliente**. Con los dos relojes desalineados, el gap
       * medido es el gap nominal menos la deriva. Lo que se verifica es que las
       * llamadas no salen juntas —que es la garantía—, no que los dos relojes
       * den lo mismo.
       */
      const tolerance = 30;
      for (const [i, at] of started.slice(1).entries()) {
        expect(at - started[i]!).toBeGreaterThanOrEqual(GAP_MS - tolerance);
      }
    });

    it('el slot se toma una sola vez por gap, no por cantidad de instancias', async () => {
      gate.setGapMs(5000);

      await gate.wait();

      // Inmediatamente después, otra instancia no puede tomar el slot: la fila
      // quedó con `lastCalledAt` ahora.
      const row = await prismaClient.providerRateLimit.findFirstOrThrow();
      const free = row.lastCalledAt.getTime() + 5000 - Date.now();
      expect(free).toBeGreaterThan(4000);
    });

    it('el reloj es por proveedor, no uno compartido', async () => {
      // Si dos providers compartieran fila, el segundo esperaría al primero sin
      // motivo. Cada uno tiene la suya.
      await prismaClient.providerRateLimit.deleteMany({});
      await prismaClient.providerRateLimit.createMany({
        data: [
          { providerId: 'tcgdex', lastCalledAt: new Date() },
          { providerId: 'otro', lastCalledAt: new Date(Date.now() - 60_000) },
        ],
      });

      await gate.wait();

      const otro = await prismaClient.providerRateLimit.findUniqueOrThrow({
        where: { providerId: 'otro' },
      });
      // `otro` no se tocó: el slot tomado fue el de tcgdex.
      expect(otro.lastCalledAt.getTime()).toBeLessThan(Date.now() - 30_000);
    });
  });

  describe('el worker drena la cola', () => {
    let moduleRef: TestingModule;
    let worker: PriceQueueWorker;
    let workerGate: ProviderRateGate;
    const refreshes: string[] = [];
    let failNext = false;

    /*
     * Con el poll y el gap inyectados, el worker atiende una carta en
     * milisegundos; el margen queda para el caso de que la DB esté lenta.
     */
    const WAIT_FOR_WORKER = { timeout: 8000, interval: 20 } as const;
    const TEST_TIMEOUT_MS = 20_000;

    beforeAll(async () => {
      const syncPricesStub = {
        fetchAndStore: vi.fn(async (cardId: string) => {
          refreshes.push(cardId);
          if (failNext) throw new Error('tcgdex 503');
          return [];
        }),
      };
      moduleRef = await Test.createTestingModule({
        providers: [
          PriceQueueService,
          ProviderRateGate,
          PriceQueueWorker,
          { provide: PrismaService, useValue: prismaClient },
          { provide: PRICE_PROVIDER, useValue: providerStub },
          { provide: SyncPricesService, useValue: syncPricesStub },
        ],
      }).compile();
      worker = moduleRef.get(PriceQueueWorker);
      workerGate = moduleRef.get(ProviderRateGate);
      // El poll del loop baja a milisegundos: con los 250 ms..2 s de producción
      // el test depende de un timer, y un test que depende de un timer es un
      // test flaky. El comportamiento que se prueba —tomar, refrescar, anotar—
      // no cambia por esto.
      worker.setPollInterval(5, 20);
      // El gap se baja en **esta** instancia: el `gate` del describe de afuera es
      // otro objeto, con su propio `gapMs`, y el worker no lo consultaría.
      workerGate.setGapMs(0);
      // Un solo `onModuleInit` para toda la suite: iniciarlo por test dejaría
      // loops anteriores corriendo y el segundo test no probaría el worker sino
      // dos workers.
      await worker.onModuleInit();
    });

    afterAll(async () => {
      worker.onModuleDestroy();
      await moduleRef.close();
    });

    beforeEach(async () => {
      refreshes.length = 0;
      failNext = false;
      workerGate.setGapMs(0);
    });

    it('toma la carta encolada, la refresca y la marca como completada', async () => {
      await queue.enqueueAsync(TEST_CARD_C);

      await vi.waitFor(() => {
        expect(refreshes).toEqual([TEST_CARD_C]);
      }, WAIT_FOR_WORKER);
      const row = await prismaClient.priceRefreshJob.findUniqueOrThrow({
        where: { cardId: TEST_CARD_C },
      });
      expect(row.status).toBe('completed');
      expect(row.completedAt).not.toBeNull();
    }, TEST_TIMEOUT_MS);

    it('un fallo del proveedor no tira el worker: la fila queda para el reintento', async () => {
      failNext = true;
      await queue.enqueueAsync(TEST_CARD_C);

      await vi.waitFor(async () => {
        const row = await prismaClient.priceRefreshJob.findUniqueOrThrow({
          where: { cardId: TEST_CARD_C },
        });
        expect(row.status).toBe('pending');
        expect(row.attempts).toBe(1);
        expect(row.lastError).toBe('tcgdex 503');
      }, WAIT_FOR_WORKER);
      // Y el worker sigue vivo: la segunda carta también la toma.
      failNext = false;
      await queue.enqueueAsync(TEST_CARD_B);
      await vi.waitFor(() => {
        expect(refreshes).toContain(TEST_CARD_B);
      }, WAIT_FOR_WORKER);
    }, TEST_TIMEOUT_MS);
  });
});
