import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { SyncPricesService } from '../../jobs/sync-prices.service.js';
import { PrismaService } from '../../prisma/index.js';
import { CurrencyService } from '../currency/currency.service.js';
import { PRICE_PROVIDER } from '../providers/card-provider.interface.js';
import { CardsService } from './cards.service.js';
import { SearchCardsDto } from './dto/search-cards.dto.js';

const search = (dto: SearchCardsDto) => dto;
const PRICE_PROVIDER_STUB = {
  id: 'tcgdex',
  defaultSource: 'tcgplayer',
  defaultCurrency: 'USD',
};

describe('CardsService', () => {
  const prismaClient = new PrismaClient();
  let moduleRef: TestingModule;
  let service: CardsService;
  /** Mock del rate cacheado: estos tests no pegan a DolarApi. */
  let cachedRate: { rate: number; rateType: 'blue' | 'oficial'; fetchedAt: string; stale: boolean } | null;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: PRICE_PROVIDER, useValue: PRICE_PROVIDER_STUB },
        {
          provide: SyncPricesService,
          useValue: {
            getPricesForCard: async (cardId: string) => [
              {
                cardId,
                variant: 'holofoil',
                low: new Prisma.Decimal('1.15'),
                mid: new Prisma.Decimal('9.87'),
                high: new Prisma.Decimal('45.50'),
                market: new Prisma.Decimal('7.25'),
                provider: 'tcgdex',
                isStale: false,
                source: 'tcgplayer',
                currency: 'USD',
                fetchedAt: new Date('2024-05-01T12:00:00.000Z'),
              },
            ],
          },
        },
        {
          provide: CurrencyService,
          useValue: { getCachedRate: async () => cachedRate },
        },
      ],
    }).compile();

    service = moduleRef.get(CardsService);
  });

  afterAll(async () => {
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(() => {
    cachedRate = null;
  });

  it('busca por nombre con q="pikachu" y devuelve la paginación correcta', async () => {
    const result = await service.search(search({ q: 'pikachu', pageSize: 5 }));

    expect(result.total).toBeGreaterThan(0);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.length).toBeLessThanOrEqual(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(5);
    expect(result.totalPages).toBe(Math.ceil(result.total / 5));

    for (const card of result.data) {
      expect(card.name.toLowerCase()).toContain('pikachu');
      expect(card.setId).toEqual(expect.any(String));
      expect(Array.isArray(card.types)).toBe(true);
    }
  });

  it('resuelve prefijos: q="Pika" trae Pikachu y lo rankea primero', async () => {
    const result = await service.search(search({ q: 'Pika', pageSize: 10 }));

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]!.name.toLowerCase()).toContain('pikachu');
    expect(result.data.map((card) => card.name.toLowerCase())).toContain(
      'pikachu',
    );
  });

  it('tolera typos vía trigram: q="pikacu" trae Pikachu', async () => {
    const result = await service.search(search({ q: 'pikacu', pageSize: 5 }));

    expect(result.total).toBeGreaterThan(0);
    expect(result.data[0]!.name.toLowerCase()).toContain('pikachu');
  });

  it('no trae nada para un texto sin coincidencias', async () => {
    const result = await service.search(
      search({ q: 'zzzqqqxxnotfound', pageSize: 5 }),
    );

    expect(result).toEqual({
      data: [],
      page: 1,
      pageSize: 5,
      total: 0,
      totalPages: 0,
    });
  });

  it('página correctamente: la segunda página no repite la primera', async () => {
    const first = await service.search(search({ q: 'pika', pageSize: 2 }));
    const second = await service.search(search({ q: 'pika', page: 2, pageSize: 2 }));

    expect(second.page).toBe(2);
    expect(second.total).toBe(first.total);
    expect(second.totalPages).toBe(first.totalPages);

    const firstIds = first.data.map((card) => card.id);
    const secondIds = second.data.map((card) => card.id);
    for (const id of secondIds) {
      expect(firstIds).not.toContain(id);
    }
  });

  it('filtra por setId y todos los resultados pertenecen a ese set', async () => {
    const sample = await prismaClient.card.findFirst({
      orderBy: { id: 'asc' },
      select: { setId: true },
    });
    expect(sample).not.toBeNull();

    const result = await service.search(
      search({ setId: sample!.setId, pageSize: 10 }),
    );

    expect(result.data.length).toBeGreaterThan(0);
    for (const card of result.data) {
      expect(card.setId).toBe(sample!.setId);
    }
  });

  it('filtra por tipo de energía y por supertype', async () => {
    const fireCard = await prismaClient.card.findFirst({
      where: { types: { has: 'Fire' } },
      select: { types: true },
    });
    expect(fireCard).not.toBeNull();

    const result = await service.search(search({ type: 'Fire', pageSize: 5 }));
    expect(result.data.length).toBeGreaterThan(0);
    for (const card of result.data) {
      expect(card.types).toContain('Fire');
    }

    const trainers = await service.search(
      search({ supertype: 'Trainer', pageSize: 5 }),
    );
    for (const card of trainers.data) {
      expect(card.supertype).toBe('Trainer');
    }
  });

  it('ordena por número usando CAST (10 va después de 9)', async () => {
    const result = await service.search(
      search({ setId: 'base1', sort: 'number', pageSize: 100 }),
    );

    const numbers = result.data
      .map((card) => Number.parseInt(card.number, 10))
      .filter((value) => Number.isFinite(value));

    const sorted = [...numbers].sort((a, b) => a - b);
    expect(numbers).toEqual(sorted);
  });

  it('getById devuelve la carta con su set incluido', async () => {
    const sample = await prismaClient.card.findFirst({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(sample).not.toBeNull();

    const card = await service.getById(sample!.id);

    expect(card.id).toBe(sample!.id);
    expect(card.set).toBeDefined();
    expect(card.set?.id).toBe(card.setId);
    expect(card.set?.name).toEqual(expect.any(String));
    expect(card.set?.releaseDate === null || typeof card.set.releaseDate === 'string').toBe(true);
  });

  it('getById lanza NotFoundException con un id inexistente', async () => {
    await expect(service.getById('no-existe-este-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getCardWithPrices convierte los Decimal de Prisma a number', async () => {
    const sample = await prismaClient.card.findFirst({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    const result = await service.getCardWithPrices(sample!.id);

    expect(result.card.id).toBe(sample!.id);
    expect(result.prices.length).toBeGreaterThan(0);

    for (const price of result.prices) {
      expect(typeof price.market).toBe('number');
      expect(typeof price.mid).toBe('number');
      expect(price.market).toBeCloseTo(7.25, 5);
      expect(price.mid).toBeCloseTo(9.87, 5);
      expect(JSON.parse(JSON.stringify(price)).market).toBe(7.25);
      expect(price.fetchedAt).toBe('2024-05-01T12:00:00.000Z');
    }
  });

  it('getCardWithPrices sin ?currency=ARS no agrega priceArs ni consulta el rate', async () => {
    const sample = await prismaClient.card.findFirst({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    const result = await service.getCardWithPrices(sample!.id);

    expect(result.prices[0]!.priceArs).toBeUndefined();
    expect(result.conversion).toBeUndefined();
  });

  it('getCardWithPrices?currency=ARS agrega priceArs usando el rate cacheado', async () => {
    const sample = await prismaClient.card.findFirst({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    cachedRate = {
      rate: 1000,
      rateType: 'blue',
      fetchedAt: '2026-09-25T20:58:00.000Z',
      stale: false,
    };

    const result = await service.getCardWithPrices(sample!.id, { currency: 'ARS' });

    const price = result.prices[0]!;
    expect(price.priceArs).toEqual({ low: 1150, mid: 9870, high: 45500, market: 7250 });
    expect(result.conversion).toEqual({
      rate: 1000,
      rateType: 'blue',
      fetchedAt: '2026-09-25T20:58:00.000Z',
      stale: false,
    });
  });

  it('?currency=ARS sin rate cacheado devuelve priceArs undefined sin fallar', async () => {
    const sample = await prismaClient.card.findFirst({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    cachedRate = null;

    const result = await service.getCardWithPrices(sample!.id, { currency: 'ARS' });

    expect(result.prices[0]!.priceArs).toBeUndefined();
    expect(result.conversion).toBeUndefined();
  });

  describe('getSetCards (B8)', () => {
    const EMPTY_SET_ID = 'test-empty-set-cards';

    beforeEach(async () => {
      await prismaClient.cardSet.deleteMany({ where: { id: EMPTY_SET_ID } });
    });

    afterAll(async () => {
      await prismaClient.cardSet.deleteMany({ where: { id: EMPTY_SET_ID } });
    });

    /** El set más poblado del catálogo: es el peor caso del binder. */
    async function biggestSet(): Promise<{ id: string; count: number }> {
      const rows = await prismaClient.$queryRaw<{ id: string; count: number }[]>(
        Prisma.sql`
          SELECT c."setId" AS id, COUNT(*)::int AS count
          FROM cards c
          GROUP BY c."setId"
          ORDER BY count DESC, c."setId" ASC
          LIMIT 1
        `,
      );
      return rows[0]!;
    }

    it('devuelve el set, todas sus cartas y el conteo real de la tabla', async () => {
      const { id: setId, count } = await biggestSet();

      const result = await service.getSetCards(setId);

      expect(result.set.id).toBe(setId);
      expect(result.set.name).not.toBe('');
      expect(result.total).toBe(count);
      expect(result.cards).toHaveLength(count);
      expect(count).toBeGreaterThan(100);

      for (const card of result.cards) {
        expect(card.setId).toBe(setId);
        expect(card.id).toEqual(expect.any(String));
        expect(card.number).toEqual(expect.any(String));
      }
    });

    it('ordena por número de carta, no por nombre', async () => {
      const { id: setId } = await biggestSet();
      const result = await service.getSetCards(setId);
      const numbers = result.cards.map((card) => card.number);

      // El mismo NUMERIC_NUMBER que usa sort:'number' en /cards/search.
      const numeric = (value: string): number | null => {
        const digits = value.replace(/\D/g, '');
        return digits === '' ? null : Number.parseInt(digits, 10);
      };
      const sorted = [...numbers].sort((a, b) => {
        const left = numeric(a);
        const right = numeric(b);
        if (left === null && right === null) return a.localeCompare(b);
        if (left === null) return 1;
        if (right === null) return -1;
        return left - right || a.localeCompare(b);
      });
      expect(numbers).toEqual(sorted);

      // Y de verdad hay números de dos dígitos después de los de un dígito.
      const firstDoubleDigit = numbers.findIndex((n) => /^\d{2,}$/.test(n));
      if (firstDoubleDigit > 0) {
        expect(numbers.slice(0, firstDoubleDigit).every((n) => /^\d$/.test(n))).toBe(true);
      }
    });

    it('coincide con el total de /cards/search?setId= y pagina al mismo conjunto', async () => {
      const { id: setId, count } = await biggestSet();
      const paged = await service.search(search({ setId, pageSize: 100 }));
      const binder = await service.getSetCards(setId);

      expect(binder.total).toBe(paged.total);
      expect(binder.total).toBe(count);
      expect(new Set(binder.cards.map((c) => c.id)).size).toBe(count);
    });

    it('un set sin cartas devuelve cards: [] y total 0, sin 404', async () => {
      const empty = await prismaClient.cardSet.create({
        data: { id: EMPTY_SET_ID, name: 'Set vacío de prueba' },
      });

      const result = await service.getSetCards(empty.id);

      expect(result.set.id).toBe(empty.id);
      expect(result.cards).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('un set inexistente devuelve 404', async () => {
      await expect(service.getSetCards('no-existe-el-set')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('findAllSets devuelve los sets ordenados por releaseDate descendente', async () => {    const sets = await service.findAllSets();
    const expected = await prismaClient.cardSet.count();

    expect(sets.length).toBe(expected);
    expect(sets.length).toBeGreaterThan(0);

    const dates = sets.map((set) => set.releaseDate);
    for (let index = 1; index < dates.length; index += 1) {
      const previous = dates[index - 1];
      const current = dates[index];
      if (previous && current) {
        expect(new Date(previous).getTime()).toBeGreaterThanOrEqual(
          new Date(current).getTime(),
        );
      }
    }
  });

  // Un set propio con precios conocidos: el catálogo real tiene 44 cartas con
  // precio y sus valores cambian con cada sync, así que un test de `sort=price`
  // sobre él sería o frágil o imposible de afirmar.
  describe('searchBy / sort=price / direction (B1, B2, B3)', () => {
    const SET = 'test-cards-queries';
    const A = `${SET}-a`; // número 4, holofoil 10 + normal 250 → el mejor es 250
    const B = `${SET}-b`; // número 40, fila con market null
    const C = `${SET}-c`; // número 104, sin filas de precio
    const D = `${SET}-d`; // número 4a, holofoil 5
    const E = `${SET}-e`; // número TG02, sin precio
    const CARD = {
      supertype: 'Pokémon',
      subtypes: [],
      types: ['Fire'],
      rarity: 'Common',
      imageSmall: 'https://example.test/small.png',
      imageLarge: 'https://example.test/large.png',
      rawJson: {},
    } as const;

    beforeAll(async () => {
      await prismaClient.card.deleteMany({ where: { id: { startsWith: SET } } });
      await prismaClient.cardSet.deleteMany({ where: { id: SET } });
      await prismaClient.cardSet.create({
        data: { id: SET, name: 'Set de pruebas de queries' },
      });

      const cards = [
        { id: A, name: 'Alfa', number: '4', artist: 'Ken Sugimori' },
        { id: B, name: 'Bravo', number: '40', artist: 'Ken Sugimori' },
        { id: C, name: 'Charlie', number: '104', artist: 'Naoki Takahashi' },
        { id: D, name: 'Delta', number: '4a', artist: 'Naoki Takahashi' },
        { id: E, name: 'Eco', number: 'TG02', artist: 'Naoki Takahashi' },
      ];
      for (const card of cards) {
        await prismaClient.card.create({ data: { ...card, setId: SET, ...CARD } });
      }

      const prices = [
        { cardId: A, variant: 'holofoil', market: '10.00' },
        { cardId: A, variant: 'normal', market: '250.00' },
        { cardId: B, variant: 'holofoil', market: null },
        { cardId: D, variant: 'holofoil', market: '5.00' },
      ];
      for (const price of prices) {
        await prismaClient.cardPrice.create({
          data: {
            ...price,
            market: price.market === null ? null : new Prisma.Decimal(price.market),
            provider: 'tcgdex',
            source: 'tcgplayer',
            currency: 'USD',
            fetchedAt: new Date('2024-01-01T00:00:00.000Z'),
          },
        });
      }
    });

    afterAll(async () => {
      await prismaClient.card.deleteMany({ where: { id: { startsWith: SET } } });
      await prismaClient.cardSet.deleteMany({ where: { id: SET } });
    });

    describe('searchBy', () => {
      it('number matchea el token exacto: 4 no trae 40, 104 ni 4a', async () => {
        const result = await service.search(
          search({ setId: SET, q: '4', searchBy: 'number', pageSize: 50 }),
        );

        expect(result.total).toBe(1);
        expect(result.data.map((card) => card.number)).toEqual(['4']);
        expect(result.data[0]!.id).toBe(A);
      });

      it('number normaliza el input: "#4" y espacios son el mismo 4', async () => {
        for (const q of ['#4', '  4  ']) {
          const result = await service.search(
            search({ setId: SET, q, searchBy: 'number', pageSize: 50 }),
          );
          expect(result.data.map((card) => card.id)).toEqual([A]);
        }
      });

      it('number es igualdad case-insensitive: tg02 encuentra TG02', async () => {
        const result = await service.search(
          search({ setId: SET, q: 'tg02', searchBy: 'number', pageSize: 50 }),
        );

        expect(result.total).toBe(1);
        expect(result.data[0]!.id).toBe(E);
      });

      it('number ordena por set y número, no por score ni alfabética', async () => {
        const result = await service.search(
          search({ setId: SET, q: '4', searchBy: 'number', pageSize: 50 }),
        );

        // Todas empatan en score (1.0), así que el orden lo define el set y el
        // número: sin esto el único criterio sería el nombre.
        expect(result.data.map((card) => card.id)).toEqual([A]);
      });

      it('artist matchea por nombre de artista, con trigram', async () => {
        const byName = await service.search(
          search({ setId: SET, q: 'sugimor', searchBy: 'artist', pageSize: 50 }),
        );
        // Typo a propósito: con trigram 0.2 sigue matcheando "Ken Sugimori".
        expect(byName.data.map((card) => card.id).sort()).toEqual([A, B]);

        const exact = await service.search(
          search({ setId: SET, q: 'Naoki', searchBy: 'artist', pageSize: 50 }),
        );
        expect(exact.data.map((card) => card.id).sort()).toEqual([C, D, E]);
      });

      it('name sigue siendo el default y no matchea números ni artistas', async () => {
        const byNumber = await service.search(
          search({ setId: SET, q: '4', pageSize: 50 }),
        );
        expect(byNumber.total).toBe(0);

        const byArtist = await service.search(
          search({ setId: SET, q: 'Sugimori', pageSize: 50 }),
        );
        expect(byArtist.total).toBe(0);

        const byName = await service.search(
          search({ setId: SET, q: 'Alfa', pageSize: 50 }),
        );
        expect(byName.data.map((card) => card.id)).toEqual([A]);
      });
    });

    describe('sort=price', () => {
      it('desc ordena de más caro a más barato', async () => {
        const result = await service.search(
          search({ setId: SET, sort: 'price', direction: 'desc', pageSize: 50 }),
        );

        expect(result.total).toBe(5);
        expect(result.data.map((card) => card.id)).toEqual([A, D, B, C, E]);
      });

      it('asc ordena de más barato a más caro', async () => {
        const result = await service.search(
          search({ setId: SET, sort: 'price', direction: 'asc', pageSize: 50 }),
        );

        expect(result.data.map((card) => card.id)).toEqual([D, A, B, C, E]);
      });

      it('el precio de la carta es el mejor de sus variantes, no el de la holofoil', async () => {
        const result = await service.search(
          search({ setId: SET, sort: 'price', direction: 'desc', pageSize: 50 }),
        );

        // A tiene holofoil 10 y normal 250. El criterio es "el mejor precio
        // disponible", no "el de la holofoil": si fuera la holofoil, A valdría
        // 10 y el orden por precio no distinguiría las variantes.
        const prices = await prismaClient.$queryRaw<{ id: string; price: number }[]>(
          Prisma.sql`
            SELECT best."cardId" AS id, MAX(best.market)::float8 AS price
            FROM (
              SELECT DISTINCT ON (p."cardId", p.variant)
                p."cardId" AS "cardId", p.variant AS "variant", p.market AS "market"
              FROM card_prices p
              WHERE p."cardId" LIKE ${`${SET}%`}
              ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
            ) best
            WHERE best.market IS NOT NULL
            GROUP BY best."cardId"
          `,
        );
        const expected = new Map(prices.map((row) => [row.id, row.price]));
        expect(expected.get(A)).toBe(250);

        // El orden del service es el mismo que el de la query de referencia.
        const order = result.data
          .map((card) => card.id)
          .filter((id) => expected.has(id));
        const sorted = [...order].sort(
          (left, right) => expected.get(right)! - expected.get(left)!,
        );
        expect(order).toEqual(sorted);
      });

      it('las cartas sin precio van al final en las DOS direcciones', async () => {
        const desc = await service.search(
          search({ setId: SET, sort: 'price', direction: 'desc', pageSize: 50 }),
        );
        const asc = await service.search(
          search({ setId: SET, sort: 'price', direction: 'asc', pageSize: 50 }),
        );

        // B tiene fila pero con market null, C y E no tienen fila: los tres
        // empatan en "sin precio" y se desempatan por nombre.
        expect(desc.data.slice(2).map((card) => card.id)).toEqual([B, C, E]);
        expect(asc.data.slice(2).map((card) => card.id)).toEqual([B, C, E]);
      });

      it('sort=price pagina sin repetidos', async () => {
        const first = await service.search(
          search({ setId: SET, sort: 'price', direction: 'desc', page: 1, pageSize: 2 }),
        );
        const second = await service.search(
          search({ setId: SET, sort: 'price', direction: 'desc', page: 2, pageSize: 2 }),
        );

        expect(first.data.map((c) => c.id)).toEqual([A, D]);
        expect(second.data.map((c) => c.id)).toEqual([B, C]);
        expect(first.total).toBe(second.total);
      });
    });

    describe('direction', () => {
      it('aplica a sort=name en los dos sentidos', async () => {
        const asc = await service.search(
          search({ setId: SET, sort: 'name', pageSize: 50 }),
        );
        const desc = await service.search(
          search({ setId: SET, sort: 'name', direction: 'desc', pageSize: 50 }),
        );

        expect(asc.data.map((card) => card.id)).toEqual([A, B, C, D, E]);
        expect(desc.data.map((card) => card.id)).toEqual([E, D, C, B, A]);
      });

      it('aplica a sort=number y a sort=rarity', async () => {
        const numbers = await service.search(
          search({ setId: SET, sort: 'number', direction: 'desc', pageSize: 50 }),
        );
        // 104 > 40 > 4, y "4" y "4a" vale 4 los dos: desempata el nombre
        // ("Alfa" antes que "Delta"). "TG02" no tiene dígitos, va al final.
        expect(numbers.data.map((card) => card.number)).toEqual([
          '104',
          '40',
          '4',
          '4a',
          'TG02',
        ]);

        const rarity = await service.search(
          search({ setId: SET, rarity: 'Common', sort: 'rarity', direction: 'desc', pageSize: 50 }),
        );
        expect(rarity.total).toBe(5);
      });

      it('se ignora con q: el score de relevancia no es invertible', async () => {
        const withDirection = await service.search(
          search({ setId: SET, q: 'a', sort: 'price', direction: 'desc', pageSize: 50 }),
        );
        const without = await service.search(
          search({ setId: SET, q: 'a', pageSize: 50 }),
        );

        // Todos matchean "a" (prefijo o substring), así que el score empata y
        // manda el desempate por nombre. `direction` no invierte nada.
        expect(withDirection.data.map((card) => card.id)).toEqual(
          without.data.map((card) => card.id),
        );
        expect(withDirection.data[0]!.id).toBe(A);
      });
    });
  });

  // El bloque de arriba filtra siempre por `setId`, así que nunca ejercita el
  // camino **global** de `searchByCurrentPrice`, que es el que atiende la
  // consulta real (`/cards/search?sort=price` sin filtros) y el único donde el
  // salto entre los dos tramos se puede ver de verdad: el set de pruebas tiene
  // 5 cartas y su tramo cotizado entero entra en la primera página.
  //
  // Acá el catálogo es el de verdad y sus precios cambian con cada sync, así que
  // no se pueden fijar ids a mano. La referencia sale de la **query anterior al
  // cambio**: el `LEFT JOIN` con el `ORDER BY` global sobre `cards`. Si algún día
  // divergen, el orden público de `sort=price` cambió, que es exactamente lo que
  // estos tests tienen que vigilar.
  describe('sort=price global (tramo cotizado + tramo sin precio)', () => {
    const PAGE_SIZE = 24;

    /**
     * "Una cotización actual por carta": la última fila de cada variante y el
     * mejor `market` entre variantes. Es la referencia que comparten la query
     * vieja y `CURRENT_CARD_MARKET_PRICES`; si algún día divergieran, el orden
     * público dejaría de ser el mismo y estos tests lo dicen.
     */
    const CURRENT_PRICES = `
      SELECT best."cardId" AS "cardId", MAX(best.market) AS "price"
      FROM (
        SELECT DISTINCT ON (p."cardId", p.variant)
          p."cardId" AS "cardId", p.variant AS "variant", p.market AS "market"
        FROM card_prices p
        WHERE p.provider = 'tcgdex'
          AND p.source = 'tcgplayer'
          AND p.currency = 'USD'
        ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
      ) best
      WHERE best.market IS NOT NULL
      GROUP BY best."cardId"
    `;

    /** El `LEFT JOIN` + `ORDER BY` global que `searchByCurrentPrice` reemplaza. */
    async function legacyIds(
      direction: 'asc' | 'desc',
      limit: number,
      offset: number,
    ): Promise<string[]> {
      const rows = await prismaClient.$queryRaw<{ id: string }[]>(Prisma.sql`
        WITH cp AS (${Prisma.raw(CURRENT_PRICES)})
        SELECT c.id
        FROM cards c
        LEFT JOIN card_sets s ON s.id = c."setId"
        LEFT JOIN cp ON cp."cardId" = c.id
        ORDER BY cp.price ${Prisma.raw(direction.toUpperCase())} NULLS LAST,
                 c.name ASC, c.id ASC
        LIMIT ${limit} OFFSET ${offset}
      `);
      return rows.map((row) => row.id);
    }

    /** Las primeras cartas sin cotización actual, en el orden del tramo final. */
    async function firstUnpricedByName(limit: number): Promise<string[]> {
      const rows = await prismaClient.$queryRaw<{ id: string }[]>(Prisma.sql`
        WITH cp AS (${Prisma.raw(CURRENT_PRICES)})
        SELECT c.id
        FROM cards c
        WHERE NOT EXISTS (SELECT 1 FROM cp WHERE cp."cardId" = c.id)
        ORDER BY c.name ASC, c.id ASC
        LIMIT ${limit}
      `);
      return rows.map((row) => row.id);
    }

    /** Cuántas cartas del catálogo entero tienen cotización actual. */
    async function countPriced(): Promise<number> {
      const rows = await prismaClient.$queryRaw<{ count: number }[]>(Prisma.sql`
        WITH cp AS (${Prisma.raw(CURRENT_PRICES)})
        SELECT COUNT(*)::int AS count
        FROM cp JOIN cards c ON c.id = cp."cardId"
      `);
      return rows[0]?.count ?? 0;
    }

    async function countCards(): Promise<number> {
      const rows = await prismaClient.$queryRaw<{ count: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS count FROM cards c`,
      );
      return rows[0]?.count ?? 0;
    }

    const TEST_PRICE_AT = new Date('2000-01-02T00:00:00.000Z');
    beforeAll(async () => {
      await prismaClient.cardPrice.deleteMany({
        where: {
          cardId: { in: ['base1-4', 'base2-10', 'xy4-117'] },
          provider: 'tcgdex',
          fetchedAt: TEST_PRICE_AT,
        },
      });
      await prismaClient.cardPrice.createMany({
        data: [
          { cardId: 'base1-4', variant: 'holofoil', market: 100, provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', fetchedAt: TEST_PRICE_AT },
          { cardId: 'base2-10', variant: 'normal', market: 60, provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', fetchedAt: TEST_PRICE_AT },
          { cardId: 'xy4-117', variant: 'holofoil', market: 40, provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', fetchedAt: TEST_PRICE_AT },
        ],
      });
    });

    afterAll(async () => {
      await prismaClient.cardPrice.deleteMany({
        where: {
          cardId: { in: ['base1-4', 'base2-10', 'xy4-117'] },
          provider: 'tcgdex',
          fetchedAt: TEST_PRICE_AT,
        },
      });
    });

    it('el catálogo tiene cartas cotizadas: sin esto los tests de abajo no miden nada', async () => {
      const priced = await countPriced();
      expect(priced).toBeGreaterThan(0);
      // El supuesto del que depende la otimización: las cotizadas son una
      // fracción minúscula del catálogo.
      expect(priced).toBeLessThan((await countCards()) / 10);
    });

    it('la primera página global son cartas cotizadas, no el inicio del catálogo', async () => {
      const result = await service.search(
        search({ sort: 'price', direction: 'desc', pageSize: PAGE_SIZE }),
      );

      expect(result.data).toHaveLength(PAGE_SIZE);
      expect(result.data.map((card) => card.id)).toEqual(
        await legacyIds('desc', PAGE_SIZE, 0),
      );
    });

    it('total y totalPages son los del catálogo entero, no los de las cotizadas', async () => {
      const total = await countCards();
      const result = await service.search(
        search({ sort: 'price', direction: 'desc', pageSize: PAGE_SIZE }),
      );

      expect(result.total).toBe(total);
      expect(result.totalPages).toBe(Math.ceil(total / PAGE_SIZE));
    });

    it('las dos direcciones dan la misma lista invertida, con las sin precio al final', async () => {
      const desc = await service.search(
        search({ sort: 'price', direction: 'desc', pageSize: PAGE_SIZE }),
      );
      const asc = await service.search(
        search({ sort: 'price', direction: 'asc', pageSize: PAGE_SIZE }),
      );

      expect(desc.data.map((card) => card.id)).toEqual(
        await legacyIds('desc', PAGE_SIZE, 0),
      );
      expect(asc.data.map((card) => card.id)).toEqual(
        await legacyIds('asc', PAGE_SIZE, 0),
      );
    });

    it('el cruce de página entre los dos tramos no repite ni saltea filas', async () => {
      const priced = await countPriced();
      // Página donde el tramo cotizado se queda corto y hay que completarla con
      // el de las sin precio: es el único caso que consulta los dos.
      const crossingPage = Math.floor(priced / PAGE_SIZE) + 1;
      const crossingOffset = (crossingPage - 1) * PAGE_SIZE;
      const fromPriced = Math.max(0, priced - crossingOffset);

      const result = await service.search(
        search({
          sort: 'price',
          direction: 'desc',
          pageSize: PAGE_SIZE,
          page: crossingPage,
        }),
      );
      const ids = result.data.map((card) => card.id);

      expect(result.data).toHaveLength(PAGE_SIZE);
      expect(ids).toEqual(await legacyIds('desc', PAGE_SIZE, crossingOffset));

      // Y el corte, explícito: la cola del tramo cotizado arriba y, detrás, el
      // comienzo alfabético del tramo sin precio. Si el offset del segundo tramo
      // no estuviera corrido por las cotizadas, esta mitad sería la primera
      // página sin precio repetida.
      expect(ids.slice(0, fromPriced)).toEqual(
        await legacyIds('desc', fromPriced, crossingOffset),
      );
      expect(ids.slice(fromPriced)).toEqual(
        await firstUnpricedByName(PAGE_SIZE - fromPriced),
      );
    });

    it('recorrer todas las páginas del tramo cotizado da la lista vieja completa, sin huecos', async () => {
      const priced = await countPriced();
      const lastPage = Math.ceil(priced / PAGE_SIZE);

      const seen: string[] = [];
      for (let page = 1; page <= lastPage; page++) {
        const result = await service.search(
          search({
            sort: 'price',
            direction: 'desc',
            pageSize: PAGE_SIZE,
            page,
          }),
        );
        seen.push(...result.data.map((card) => card.id));
      }

      // Es la lista vieja partida en trozos: si el paginado del tramo cotizado
      // se desfasara una sola fila, los ids no empatarían aunque cada página por
      // separado pareciera correcta.
      expect(seen).toEqual(await legacyIds('desc', seen.length, 0));
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('una página entera dentro del tramo sin precio trae las cartas correctas', async () => {
      const priced = await countPriced();
      const deepPage = Math.floor(priced / PAGE_SIZE) + 2;
      const deepOffset = (deepPage - 1) * PAGE_SIZE;

      const result = await service.search(
        search({
          sort: 'price',
          direction: 'desc',
          pageSize: PAGE_SIZE,
          page: deepPage,
        }),
      );

      expect(result.data).toHaveLength(PAGE_SIZE);
      expect(result.data.map((card) => card.id)).toEqual(
        await legacyIds('desc', PAGE_SIZE, deepOffset),
      );
    });
  });
});

describe('CardsService · change de 30 días (B10)', () => {
  const prismaClient = new PrismaClient();
  const PREFIX = 'test-b10-';
  const CARD = `${PREFIX}card`;
  const DAY = 24 * 60 * 60 * 1000;

  /** Precio actual que devuelve el mock de SyncPrices, por test. */
  let current: {
    variant: string;
    market: Prisma.Decimal | null;
    mid: Prisma.Decimal | null;
    fetchedAt: Date;
  }[] = [];

  let moduleRef: TestingModule;
  let service: CardsService;

  const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY);

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: PRICE_PROVIDER, useValue: PRICE_PROVIDER_STUB },
        {
          provide: SyncPricesService,
          useValue: {
            getPricesForCard: async (cardId: string) =>
              current.map((price) => ({
                cardId,
                variant: price.variant,
                low: new Prisma.Decimal('1.00'),
                mid: price.mid,
                high: new Prisma.Decimal('99.00'),
                market: price.market,
                provider: 'tcgdex',
                isStale: false,
                source: 'tcgplayer',
                currency: 'USD',
                fetchedAt: price.fetchedAt,
              })),
          },
        },
        { provide: CurrencyService, useValue: { getCachedRate: async () => null } },
      ],
    }).compile();

    service = moduleRef.get(CardsService);
  });

  afterAll(async () => {
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });
    const set = await prismaClient.cardSet.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    await prismaClient.card.create({
      data: {
        id: CARD,
        name: 'Charizard B10',
        supertype: 'Pokémon',
        subtypes: [],
        types: ['Fire'],
        number: '4',
        rarity: 'Rare',
        setId: set!.id,
        imageSmall: 'https://example.test/s.png',
        imageLarge: 'https://example.test/l.png',
        rawJson: {},
      },
    });
    current = [];
  });

  /** Inserta una fila de referencia: una por llamada. */
  async function seedReference(
    variant: string,
    fetchedAt: Date,
    price: { market?: string | null; mid?: string | null },
  ): Promise<void> {
    const decimal = (value: string | null | undefined) =>
      value === undefined || value === null ? null : new Prisma.Decimal(value);

    await prismaClient.cardPrice.create({
      data: {
        cardId: CARD,
        variant,
        market: decimal(price.market),
        mid: decimal(price.mid),
        provider: 'tcgdex',
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt,
      },
    });
  }

  const changeOf = async (variant: string) => {
    const result = await service.getCardWithPrices(CARD);
    return result.prices.find((price) => price.variant === variant)?.change;
  };

  it('compara contra la última cotización anterior a la ventana', async () => {
    const old31 = daysAgo(31);
    await seedReference('holofoil', daysAgo(40), { market: '10.00' });
    // Una fila más nueva que la ventana no debe ganar: la referencia es la
    // última **anterior** a los 30 días, no la última disponible.
    await seedReference('holofoil', old31, { market: '8.00' });
    current = [
      {
        variant: 'holofoil',
        market: new Prisma.Decimal('5.00'),
        mid: new Prisma.Decimal('99.00'),
        fetchedAt: daysAgo(0),
      },
    ];

    expect(await changeOf('holofoil')).toEqual({
      usd: -3,
      // -37,5 exacto con redondeo simétrico: -38, no el -37 de Math.round.
      percent: -38,
      windowDays: 30,
      from: old31.toISOString(),
    });
  });

  it('sin fila anterior a la ventana devuelve null, no 0', async () => {
    await seedReference('holofoil', daysAgo(3), { market: '10.00' });
    current = [
      {
        variant: 'holofoil',
        market: new Prisma.Decimal('5.00'),
        mid: new Prisma.Decimal('99.00'),
        fetchedAt: daysAgo(0),
      },
    ];

    expect(await changeOf('holofoil')).toBeNull();
  });

  it('una referencia de más de 90 días devuelve null', async () => {
    await seedReference('holofoil', daysAgo(120), { market: '10.00' });
    current = [
      {
        variant: 'holofoil',
        market: new Prisma.Decimal('5.00'),
        mid: new Prisma.Decimal('99.00'),
        fetchedAt: daysAgo(0),
      },
    ];

    expect(await changeOf('holofoil')).toBeNull();
  });

  it('un precio actual de más de 24 h devuelve null (el cliente ya lo marca viejo)', async () => {
    await seedReference('holofoil', daysAgo(40), { market: '10.00' });
    current = [
      {
        variant: 'holofoil',
        market: new Prisma.Decimal('5.00'),
        mid: new Prisma.Decimal('99.00'),
        fetchedAt: daysAgo(2),
      },
    ];

    expect(await changeOf('holofoil')).toBeNull();
  });

  it('sin market usa mid, y compara mid contra mid', async () => {
    await seedReference('holofoil', daysAgo(40), { market: null, mid: '20.00' });
    current = [
      {
        variant: 'holofoil',
        market: null,
        mid: new Prisma.Decimal('15.00'),
        fetchedAt: daysAgo(0),
      },
    ];

    const change = await changeOf('holofoil');
    expect(change?.usd).toBe(-5);
    expect(change?.percent).toBe(-25);
  });

  it('market hoy contra una referencia sin market devuelve null (no cambia de columna)', async () => {
    await seedReference('holofoil', daysAgo(40), { market: null, mid: '20.00' });
    current = [
      {
        variant: 'holofoil',
        market: new Prisma.Decimal('15.00'),
        mid: null,
        fetchedAt: daysAgo(0),
      },
    ];

    expect(await changeOf('holofoil')).toBeNull();
  });

  it('una referencia de 0 devuelve null, no Infinity ni 0 %', async () => {
    await seedReference('holofoil', daysAgo(40), { market: '0.00' });
    current = [
      {
        variant: 'holofoil',
        market: new Prisma.Decimal('15.00'),
        mid: null,
        fetchedAt: daysAgo(0),
      },
    ];

    expect(await changeOf('holofoil')).toBeNull();
  });

  it('sin market ni mid no hay precio de referencia y no hay delta', async () => {
    await seedReference('holofoil', daysAgo(40), { market: '10.00' });
    current = [
      { variant: 'holofoil', market: null, mid: null, fetchedAt: daysAgo(0) },
    ];

    expect(await changeOf('holofoil')).toBeNull();
  });

  it('los campos planos del delta son el mismo número que `change`', async () => {
    await seedReference('holofoil', daysAgo(40), { market: '10.00' });
    current = [
      {
        variant: 'holofoil',
        market: new Prisma.Decimal('5.00'),
        mid: null,
        fetchedAt: daysAgo(0),
      },
    ];

    const [price] = (await service.getCardWithPrices(CARD)).prices;
    // Son los tres campos que consume la píldora del cliente, y no un segundo
    // cálculo: si divergieran, el "-$5 (-50 %)" y el `change` dirían distinto.
    expect(price?.changeUsd).toBe(price?.change?.usd);
    expect(price?.changePercent).toBe(price?.change?.percent);
    expect(price?.windowLabel).toBe('últimos 30 días');
  });

  it('sin delta los tres campos planos vienen null, no 0', async () => {
    await seedReference('holofoil', daysAgo(3), { market: '10.00' });
    current = [
      {
        variant: 'holofoil',
        market: new Prisma.Decimal('5.00'),
        mid: null,
        fetchedAt: daysAgo(0),
      },
    ];

    const [price] = (await service.getCardWithPrices(CARD)).prices;
    expect(price?.change).toBeNull();
    expect(price?.changeUsd).toBeNull();
    expect(price?.changePercent).toBeNull();
    expect(price?.windowLabel).toBeNull();
  });
});

/**
 * `GET /cards/:id/prices/history` arma la serie con un `DISTINCT ON` sobre el día
 * de la tabla `card_prices`, que ya existe. Estos tests fijan las tres reglas que
 * un `DISTINCT ON` mal escrito rompe sin error: el día, el criterio del día y el
 * `null` honesto cuando no hay dos extremos.
 */
describe('CardsService · histórico de precios', () => {
  const prismaClient = new PrismaClient();
  const PREFIX = 'test-history-';
  const CARD = `${PREFIX}card`;
  const DAY = 24 * 60 * 60 * 1000;

  let moduleRef: TestingModule;
  let service: CardsService;

  // Ancla al mediodía UTC para que `daysAgo(3)` y `daysAgo(2.96)` no caigan
  // en días distintos cuando la suite corre cerca de medianoche UTC.
  const todayAtNoonUtc = (() => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  })();
  const daysAgo = (days: number): Date => new Date(todayAtNoonUtc - days * DAY);

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: PRICE_PROVIDER, useValue: PRICE_PROVIDER_STUB },
        // El histórico no toca el proveedor de precios: si lo tocara, estos
        // tests pasarían igual y el rate limit no.
        { provide: SyncPricesService, useValue: { getPricesForCard: async () => [] } },
        { provide: CurrencyService, useValue: { getCachedRate: async () => null } },
      ],
    }).compile();

    service = moduleRef.get(CardsService);
  });

  afterAll(async () => {
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });
    const set = await prismaClient.cardSet.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    await prismaClient.card.create({
      data: {
        id: CARD,
        name: 'Charizard Histórico',
        supertype: 'Pokémon',
        subtypes: [],
        types: ['Fire'],
        number: '4',
        rarity: 'Rare',
        setId: set!.id,
        imageSmall: 'https://example.test/s.png',
        imageLarge: 'https://example.test/l.png',
        rawJson: {},
      },
    });
  });

  const seed = (variant: string, market: string | null, fetchedAt: Date) =>
    prismaClient.cardPrice.create({
      data: {
        cardId: CARD,
        variant,
        market: market === null ? null : new Prisma.Decimal(market),
        provider: 'tcgdex',
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt,
      },
    });

  it('devuelve un punto por día, en orden cronológico y con la última cotización del día', async () => {
    // Dos filas del mismo día: gana la más nueva, y el día es **uno solo**.
    await seed('holofoil', '10.00', daysAgo(3));
    await seed('holofoil', '12.00', daysAgo(2.96));
    await seed('holofoil', '8.00', daysAgo(1));

    const result = await service.getPriceHistory(CARD);

    expect(result.cardId).toBe(CARD);
    expect(result.currency).toBe('USD');
    expect(result.variant).toBeNull();
    expect(result.windowDays).toBe(30);
    expect(result.points).toHaveLength(2);
    expect(result.points.map((point) => point.date)).toEqual([
      result.points[0]!.date,
      result.points[1]!.date,
    ]);
    expect(result.points[0]!.date < result.points[1]!.date).toBe(true);
    expect(result.points[0]!.market).toBe(12);
    expect(result.points[1]!.market).toBe(8);
  });

  it('el delta de la ventana sale del primer y el último punto con market', async () => {
    await seed('holofoil', '10.00', daysAgo(20));
    await seed('holofoil', '7.50', daysAgo(10));
    await seed('holofoil', '5.00', daysAgo(1));

    const result = await service.getPriceHistory(CARD);

    expect(result.change).toEqual({ changeUsd: -5, changePercent: -50 });
    expect(result.from).toBe(result.points[0]!.date);
    expect(result.to).toBe(result.points[2]!.date);
  });

  it('un solo punto no tiene delta: null, no 0 %', async () => {
    await seed('holofoil', '10.00', daysAgo(1));

    const result = await service.getPriceHistory(CARD);

    expect(result.points).toHaveLength(1);
    expect(result.change).toBeNull();
  });

  it('una carta sin histórico devuelve points vacío y change null', async () => {
    const result = await service.getPriceHistory(CARD);

    expect(result.points).toEqual([]);
    expect(result.change).toBeNull();
    expect(result.from).toBeNull();
    expect(result.to).toBeNull();
  });

  it('con variant se acota a esa variante y responde con el variant pedido', async () => {
    await seed('holofoil', '90.00', daysAgo(2));
    await seed('normal', '3.00', daysAgo(2));

    const result = await service.getPriceHistory(CARD, { variant: 'normal' });

    expect(result.variant).toBe('normal');
    expect(result.points).toHaveLength(1);
    expect(result.points[0]!.market).toBe(3);
  });

  it('sin variant gana la mejor cotización del día, como el sort=price del catálogo', async () => {
    await seed('holofoil', '90.00', daysAgo(2));
    await seed('normal', '3.00', daysAgo(2));

    const result = await service.getPriceHistory(CARD);

    expect(result.variant).toBeNull();
    expect(result.points).toHaveLength(1);
    expect(result.points[0]!.market).toBe(90);
  });

  it('days acota la ventana y se recorta a 7..365', async () => {
    await seed('holofoil', '10.00', daysAgo(100));
    await seed('holofoil', '11.00', daysAgo(20));

    expect((await service.getPriceHistory(CARD, { days: 30 })).points).toHaveLength(1);
    expect((await service.getPriceHistory(CARD, { days: 365 })).points).toHaveLength(2);
    // 5000 se recorta a 365 en vez de dar 400.
    expect((await service.getPriceHistory(CARD, { days: 5000 })).windowDays).toBe(365);
    // 1 se recorta a 7: una semana es el piso de una "serie".
    expect((await service.getPriceHistory(CARD, { days: 1 })).windowDays).toBe(7);
  });

  it('una carta inexistente da 404, como el resto de las rutas de carta', async () => {
    await expect(service.getPriceHistory(`${PREFIX}no-existe`)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
