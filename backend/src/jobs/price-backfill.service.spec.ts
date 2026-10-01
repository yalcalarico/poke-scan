import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import {
  PRICE_PROVIDER,
  type PriceProvider,
} from '../modules/providers/card-provider.interface.js';
import { PrismaService } from '../prisma/index.js';
import { PriceQueueService } from './price-queue.service.js';
import { PriceBackfillService } from './price-backfill.service.js';

const TEST_SET_ID = 'test-backfill-set';
const TEST_CARD_PREFIX = 'test-backfill-';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('PriceBackfillService', () => {
  const prismaClient = new PrismaClient();
  let service: PriceBackfillService;
  let queue: PriceQueueService;

  const getCardPrices = vi.fn();

  const provider: PriceProvider = {
    id: 'tcgdex',
    defaultSource: 'tcgplayer',
    defaultCurrency: 'USD',
    listSets: vi.fn(),
    getSetDetail: vi.fn(),
    getCardPrices,
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PriceBackfillService,
        PriceQueueService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: PRICE_PROVIDER, useValue: provider },
      ],
    }).compile();
    service = moduleRef.get(PriceBackfillService);
    queue = moduleRef.get(PriceQueueService);
    getCardPrices.mockClear();
  });

  afterAll(async () => {
    await prismaClient.priceRefreshJob.deleteMany({
      where: { cardId: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.cardPrice.deleteMany({
      where: { cardId: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_CARD_PREFIX } } });
    await prismaClient.cardSet.deleteMany({ where: { id: TEST_SET_ID } });
    await prismaClient.$disconnect();
  });

  beforeEach(async () => {
    await prismaClient.priceRefreshJob.deleteMany({});
    await prismaClient.cardPrice.deleteMany({
      where: { cardId: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_CARD_PREFIX } } });
    await prismaClient.cardSet.deleteMany({ where: { id: TEST_SET_ID } });
    await prismaClient.cardSet.create({
      data: { id: TEST_SET_ID, name: 'Set de backfill', tcgdexSetId: 'bf' },
    });
  });

  const makeCard = (id: string): Promise<unknown> =>
    prismaClient.card.create({
      data: {
        id,
        name: 'Carta',
        supertype: 'Pokémon',
        subtypes: [],
        types: [],
        number: '1',
        setId: TEST_SET_ID,
        imageSmall: 'https://example.test/s.png',
        imageLarge: 'https://example.test/l.png',
        rawJson: {},
      },
    });

  const price = (
    cardId: string,
    fetchedAt: Date,
    overrides: { provider?: string | null; source?: string; currency?: string } = {},
  ): Promise<unknown> =>
    prismaClient.cardPrice.create({
      data: {
        cardId,
        variant: 'holofoil',
        market: 10,
        provider: overrides.provider === undefined ? 'tcgdex' : overrides.provider,
        source: overrides.source ?? 'tcgplayer',
        currency: overrides.currency ?? 'USD',
        fetchedAt,
      },
    });

  const queuedCards = () =>
    prismaClient.priceRefreshJob.findMany({
      where: { cardId: { startsWith: TEST_CARD_PREFIX } },
      select: { cardId: true },
      orderBy: { cardId: 'asc' },
    });

  /**
   * La cola tarda un round trip en reflejar el encolado, porque `enqueue` es
   * fire-and-forget a propósito. Todo test que mire las filas tiene que esperar;
   * sin esto los que assertan después del `enqueueStale` pasan o fallan
   * depending de cuánto tarde la base.
   */
  const waitQueued = async (cardIds: string[]): Promise<void> => {
    await vi.waitFor(async () => {
      expect((await queuedCards()).map((r) => r.cardId)).toEqual(cardIds);
    });
  };

  it('encola una carta que nunca tuvo precio del proveedor activo', async () => {
    const id = `${TEST_CARD_PREFIX}sin-precio`;
    await makeCard(id);

    const result = await service.enqueueStale({ limit: 10, cardIds: [id] });

    expect(result.enqueued).toBe(1);
    // `enqueue` es fire-and-forget a propósito (va en el camino de una lectura),
    // así que la fila tarda un round trip en aparecer.
    await waitQueued([id]);
  });

  it('no encola una carta con precio fresco', async () => {
    const id = `${TEST_CARD_PREFIX}fresca`;
    await makeCard(id);
    await price(id, new Date());

    const result = await service.enqueueStale({ limit: 10, cardIds: [id] });

    expect(result.enqueued).toBe(0);
  });

  it('encola una carta cuyo precio vencido pasó las 24 h', async () => {
    // El mismo umbral que usa la lectura: si el backfill fuera más permisivo,
    // una carta sería "fresca" para el backfill y vieja para la lectura, y
    // tendría dos verdades.
    const id = `${TEST_CARD_PREFIX}vencida`;
    await makeCard(id);
    await price(id, new Date(Date.now() - 25 * 60 * 60 * 1000));

    const result = await service.enqueueStale({ limit: 10, cardIds: [id] });

    expect(result.enqueued).toBe(1);
  });

  it('una fila de otra fuente no cuenta como precio vigente, y no se re-encola en loop', async () => {
    const id = `${TEST_CARD_PREFIX}legacy`;
    await makeCard(id);
    await price(id, new Date(), { provider: null });

    const result = await service.enqueueStale({ limit: 10, cardIds: [id] });

    // Se encola: para el proveedor activo esa carta no tiene precio.
    expect(result.enqueued).toBe(1);
    // Y cuando el worker escriba la fila de tcgdex, deja de estar pendiente: si
    // el backfill aceptara la fila legacy como vigente, la volvería a encolar
    // para siempre.
    await price(id, new Date(), { provider: 'tcgdex' });
    expect(await service.pendingCount({ cardIds: [id] })).toBe(0);
  });

  it('ignora precios de otro mercado o de otra moneda', async () => {
    const id = `${TEST_CARD_PREFIX}otro-mercado`;
    await makeCard(id);
    await price(id, new Date(), { source: 'cardmarket' });
    await price(id, new Date(), { currency: 'EUR' });

    const result = await service.enqueueStale({ limit: 10, cardIds: [id] });

    expect(result.enqueued).toBe(1);
  });

  it('respeta el límite de la corrida', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `${TEST_CARD_PREFIX}lote-${i}`);
    for (const id of ids) await makeCard(id);

    const result = await service.enqueueStale({ limit: 2, cardIds: ids });

    expect(result.enqueued).toBe(2);
    // Se espera a que las dos filas aterricen: el encolado es fire-and-forget, y
    // comparar el largo de una vez es una carrera.
    await vi.waitFor(async () => {
      expect(await queuedCards()).toHaveLength(2);
    });
  });

  it('avanza hacia las más viejas, no siempre las mismas', async () => {
    // Sin esto, un lote de 300 sobre 20.670 cartas reprocesaría las mismas 300
    // para siempre y el backfill no avanzaría nunca.
    const vieja = `${TEST_CARD_PREFIX}vieja`;
    const nueva = `${TEST_CARD_PREFIX}nueva`;
    await makeCard(nueva);
    await makeCard(vieja);
    // La "nueva" sin precio tiene `MAX(fetchedAt) = NULL`, que va primero con
    // NULLS FIRST; para que la prueba signifique algo, la vieja tiene un precio
    // viejo y la otra ninguno, y el orden esperado es por antigüedad.
    await price(vieja, new Date(Date.now() - 100 * DAY_MS));

    await service.enqueueStale({ limit: 1, cardIds: [vieja, nueva] });

    await waitQueued([nueva]);
  });

  it('pendingCount cuenta lo que falta, no lo que hay', async () => {
    const ok = `${TEST_CARD_PREFIX}ok`;
    const falta = `${TEST_CARD_PREFIX}falta`;
    await makeCard(ok);
    await makeCard(falta);
    await price(ok, new Date());

    // Ojo: pendingCount cuenta **todo** el catálogo, y en la base de desarrollo
    // hay 20.670 cartas sin precio de tcgdex. Por eso se compara contra el
    // número de cartas de test, no contra un absoluto.
    const antes = await service.pendingCount({ cardIds: [ok, falta] });
    const resultado = await service.enqueueStale({ limit: 10, cardIds: [ok, falta] });
    expect(antes).toBe(1);
    expect(resultado.pending).toBe(1);
    expect(resultado.enqueued).toBe(1);
  });

  it('no toca el proveedor: encola, no pide precios', async () => {
    // La garantía estructural del backfill. Si este service llamara a
    // `getCardPrices`, tendría su propio reloj y duplicaría el ritmo hacia el
    // proveedor en cuanto hubiera dos instancias.
    const id = `${TEST_CARD_PREFIX}no-pide`;
    await makeCard(id);
    await service.enqueueStale({ limit: 10, cardIds: [id] });
    expect(getCardPrices).not.toHaveBeenCalled();
    // Lo pedido está en la cola, que es el único camino que conoce el ritmo.
    expect(await queue.pendingCount()).toBeGreaterThanOrEqual(1);
  });

  /*
   * El camino sin scope es el que usa el cron, y estuvo roto.
   *
   * `WHERE ${scope} AND NOT EXISTS (...)` con el scope vacío produce
   * `WHERE AND NOT EXISTS (...)`: error de sintaxis, en el cron horario entero.
   * No lo agarró ningún test porque todos pasaban scope.
   *
   * Este test mira el catálogo entero, así que el número exacto depende de la
   * base en la que corra. Lo que se asserta es que la consulta **no tira** y que
   * el conteo incluye las cartas de test sin precio, que es lo que la distingue
   * de una consulta que devuelve cero.
   */
  it('sin scope consulta el catálogo entero y no es un cero', async () => {
    const id = `${TEST_CARD_PREFIX}sin-scope`;
    await makeCard(id);

    const total = await service.pendingCount();
    expect(total).toBeGreaterThan(0);
    // La carta de test está incluida en el conteo con scope: un array vacío no
    // la deja fuera por accidente.
    expect(await service.pendingCount({ cardIds: [id] })).toBe(1);

    // Sin scope, el que se encola es la carta más necesitada **del catálogo
    // entero**, que en la base de desarrollo es una carta real y no la de test.
    // Eso es justamente lo que demuestra que el scope está ausente.
    const result = await service.enqueueStale({ limit: 1 });
    expect(result.enqueued).toBe(1);
    expect(result.pending).toBe(total);

    await vi.waitFor(async () => {
      const todas = await prismaClient.priceRefreshJob.findMany({
        where: { status: { in: ['pending', 'processing'] } },
        select: { cardId: true },
      });
      expect(todas.length).toBeGreaterThan(0);
      expect(
        todas.every((row) => !row.cardId.startsWith(TEST_CARD_PREFIX)),
      ).toBe(true);
    });

    // Y se limpia lo que el test metió en la cola real.
    await prismaClient.priceRefreshJob.deleteMany({
      where: { cardId: { not: { startsWith: TEST_CARD_PREFIX } } },
    });
  });
});