import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../prisma/index.js';
import {
  CardPricesRetentionService,
  DETAIL_DAYS,
  RETENTION_DAYS,
} from './card-prices-retention.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_SET_ID = 'test-retention-set';
const TEST_CARD_PREFIX = 'test-retention-';

const daysAgo = (days: number, hours = 0): Date =>
  new Date(Date.now() - days * DAY_MS + hours * 60 * 60 * 1000);

/**
 * Una fecha en una hora concreta de hace N días.
 *
 * Existe para que "el último refresh del día" sea obvious en el test. Con
 * `daysAgo(200, -12)` no se sabe cuál de las dos filas del día es la última, y
 * un test que depende de eso no falla cuando algo está mal: falla cuando algo
 * está raro. `at(200, 12)` dice "mediodía de hace 200 días" y listo.
 *
 * `daysBack >= 1` siempre: una hora de hoy puede estar en el futuro, y una fila
 * futura no la podaría nada.
 */
const at = (daysBack: number, hour: number): Date => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysBack);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};

describe('CardPricesRetentionService', () => {
  const prismaClient = new PrismaClient();
  let service: CardPricesRetentionService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CardPricesRetentionService,
        { provide: PrismaService, useValue: prismaClient },
      ],
    }).compile();
    service = moduleRef.get(CardPricesRetentionService);
  });

  afterAll(async () => {
    await prismaClient.cardPrice.deleteMany({
      where: { cardId: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_CARD_PREFIX } } });
    await prismaClient.cardSet.deleteMany({ where: { id: TEST_SET_ID } });
    await prismaClient.$disconnect();
  });

  beforeEach(async () => {
    await prismaClient.cardPrice.deleteMany({
      where: { cardId: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.card.deleteMany({ where: { id: { startsWith: TEST_CARD_PREFIX } } });
    await prismaClient.cardSet.deleteMany({ where: { id: TEST_SET_ID } });
    await prismaClient.cardSet.create({
      data: { id: TEST_SET_ID, name: 'Set de retención', tcgdexSetId: 'ret' },
    });
  });

  const card = (id: string): Promise<unknown> =>
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
    overrides: { variant?: string; market?: number; provider?: string | null } = {},
  ): Promise<unknown> =>
    prismaClient.cardPrice.create({
      data: {
        cardId,
        variant: overrides.variant ?? 'holofoil',
        market: overrides.market ?? 10,
        provider: overrides.provider === undefined ? 'tcgdex' : overrides.provider,
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt,
      },
    });

  const rowsOf = (cardId: string) =>
    prismaClient.cardPrice.findMany({
      where: { cardId },
      orderBy: { fetchedAt: 'asc' },
      select: { variant: true, market: true, provider: true, fetchedAt: true },
    });

  describe('la consolidación colapsa a un punto por día', () => {
    it('deja la última fila de cada día y variante', async () => {
      const id = `${TEST_CARD_PREFIX}consolidar`;
      await card(id);
      // 5 refreshes del mismo día, más otro día.
      for (const hour of [1, 3, 6, 9, 12]) {
        await price(id, at(200, hour), { market: hour });
      }
      await price(id, at(199, 6), { market: 99 });

      const deleted = await service.consolidate(DETAIL_DAYS);

      expect(deleted).toBe(4);
      const rows = await rowsOf(id);
      expect(rows).toHaveLength(2);
      // El que sobrevive de cada día es el último: es el que elige el endpoint
      // de histórico para esa variante.
      expect(rows.map((r) => Number(r.market))).toEqual([12, 99]);
    });

    it('no toca nada dentro de la ventana de detalle', async () => {
      const id = `${TEST_CARD_PREFIX}reciente`;
      await card(id);
      for (let day = 1; day <= 5; day += 1) {
        for (const hour of [1, 5, 9]) await price(id, at(day, hour), { market: hour });
      }

      const deleted = await service.consolidate(DETAIL_DAYS);

      expect(deleted).toBe(0);
      expect(await rowsOf(id)).toHaveLength(15);
    });

    it('es idempotente: la segunda pasada no borra nada', async () => {
      const id = `${TEST_CARD_PREFIX}idempotente`;
      await card(id);
      for (const hour of [1, 4, 8]) await price(id, at(150, hour), { market: hour });
      await price(id, at(149, 7), { market: 7 });

      const first = await service.consolidate(DETAIL_DAYS);
      const second = await service.consolidate(DETAIL_DAYS);

      expect(first).toBe(2);
      expect(second).toBe(0);
      expect(await rowsOf(id)).toHaveLength(2);
    });

    it('mantiene las variantes separadas: una carta con dos variantes conserva las dos', async () => {
      const id = `${TEST_CARD_PREFIX}variantes`;
      await card(id);
      await price(id, at(150, 6), { variant: 'normal', market: 1 });
      await price(id, at(149, 6), { variant: 'reverseHolofoil', market: 2 });

      await service.consolidate(DETAIL_DAYS);

      const rows = await rowsOf(id);
      // Si la agrupación no tuviera la variante, un día habría comido al otro y
      // la serie de una variante desaparecería.
      expect(rows.map((r) => r.variant).sort()).toEqual(['normal', 'reverseHolofoil']);
    });

    it('no mezcla providers: el mismo día de dos fuentes son dos filas', async () => {
      const id = `${TEST_CARD_PREFIX}providers`;
      await card(id);
      await price(id, at(150, 6), { provider: 'tcgdex', market: 1 });
      await price(id, at(150, 9), { provider: null, market: 2 });

      await service.consolidate(DETAIL_DAYS);

      const rows = await rowsOf(id);
      // Una fila de cada procedencia: una serie que mezclara las dos sería un
      // número que no existe.
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.provider)).toContain('tcgdex');
      expect(rows.map((r) => r.provider)).toContain(null);
    });
  });

  describe('la poda dura respeta el horizonte y la última fila', () => {
    it('borra días enteros más allá del horizonte', async () => {
      const id = `${TEST_CARD_PREFIX}poda`;
      await card(id);
      // Más viejas que el horizonte (730 días): 740 y 735.
      await price(id, at(740, 6), { market: 1 });
      await price(id, at(735, 6), { market: 2 });
      await price(id, at(2, 6), { market: 3 });

      const deleted = await service.prune(RETENTION_DAYS);

      // Las dos viejas se van: son la misma variante que la vigente, así que la
      // vigente es la última del grupo y las otras no son "el último precio".
      expect(deleted).toBe(2);
      const rows = await rowsOf(id);
      expect(rows.map((r) => Number(r.market))).toEqual([3]);
    });

    it('no toca nada dentro del horizonte', async () => {
      const id = `${TEST_CARD_PREFIX}dentro`;
      await card(id);
      await price(id, at(RETENTION_DAYS - 5, 6), { market: 1 });
      await price(id, at(2, 6), { market: 2 });

      const deleted = await service.prune(RETENTION_DAYS);

      expect(deleted).toBe(0);
      expect(await rowsOf(id)).toHaveLength(2);
    });

    it('nunca borra la última fila de una variante, aunque sea antiquísima', async () => {
      const id = `${TEST_CARD_PREFIX}ultima`;
      await card(id);
      await price(id, at(2000, 6), { variant: 'normal', market: 5 });
      await price(id, at(2000, 6), { variant: 'holofoil', market: 6 });

      const deleted = await service.prune(RETENTION_DAYS);

      // Cero: son las últimas de sus grupos, y sin ellas la carta quedaría sin
      // precio en vez de con precio viejo.
      expect(deleted).toBe(0);
      expect(await rowsOf(id)).toHaveLength(2);
    });

    it('deja la última de cada provider aunque la otra sea más vieja', async () => {
      const id = `${TEST_CARD_PREFIX}ultima-provider`;
      await card(id);
      await price(id, at(3000, 6), { provider: null, market: 1 });
      await price(id, at(3000, 6), { provider: 'tcgdex', market: 2 });
      await price(id, at(1500, 6), { provider: 'tcgdex', market: 3 });

      const deleted = await service.prune(RETENTION_DAYS);

      // Se va la de tcgdex vieja, pero la legacy (que es la última de su grupo y
      // la que muestra el fallback) y la vigente se quedan.
      expect(deleted).toBe(1);
      const rows = await rowsOf(id);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.provider)).toContain(null);
    });
  });

  describe('el dry run no borra nada', () => {
    it('cuenta lo que haría y deja la tabla igual', async () => {
      const id = `${TEST_CARD_PREFIX}dry`;
      await card(id);
      for (const hour of [1, 4, 8]) await price(id, at(150, hour), { market: hour });
      await price(id, at(1400, 6), { market: 42 });

      const result = await service.run({ dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.consolidated).toBe(2);
      expect(result.pruned).toBe(1);
      // Y no se borró nada: es la razón de que sea el default del script.
      expect(await rowsOf(id)).toHaveLength(4);
    });
  });

  describe('el precio de referencia del delta sobrevive', () => {
    /*
     * La razón por la que la política consolidar-en-vez-de-borrar existe.
     *
     * `CardsService.referencePrices` toma la fila más reciente **más vieja que
     * la ventana** como precio de referencia del delta de 30 días. Si la poda
     * mirara solo "no borres lo reciente", una carta cuya última fila vieja
     * desapareciera vería su delta pasar a `null` de un día para otro: no un
     * error, un número que desaparece.
     *
     * El caso de acá es el peor de todos: 10 refreshes hace 100 días, o sea
     * fuera de la ventana de detalle, así que la consolidación los colapsa a un
     * punto. Ese punto es el que va a ser la referencia, y tiene que seguir
     * siendo un precio real.
     */
    it('consolidar deja una fila utilizable como referencia fuera de la ventana', async () => {
      const id = `${TEST_CARD_PREFIX}referencia`;
      await card(id);
      for (let hour = 1; hour <= 10; hour += 1) {
        await price(id, at(100, hour), { market: hour });
      }
      await price(id, at(1, 6), { market: 50 });

      await service.run({ detailDays: DETAIL_DAYS, horizonDays: RETENTION_DAYS });

      const rows = await rowsOf(id);
      // Queda un punto del día 100 (el último) y el vigente.
      expect(rows).toHaveLength(2);
      const referencia = rows.find((r) => r.fetchedAt < new Date(Date.now() - 30 * DAY_MS));
      expect(referencia).toBeDefined();
      // Y es la última del día, que es la que el endpoint elige para esa variante.
      expect(Number(referencia!.market)).toBe(10);
    });
  });
});
