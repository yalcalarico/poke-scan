import { createHash } from 'node:crypto';
import type { PriceProvider } from '../providers/card-provider.interface.js';
import {
  ConflictException,
  type ExecutionContext,
  type INestApplication,
  GoneException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CollectionsController } from './collections.controller.js';
import { SyncPricesService } from '../../jobs/sync-prices.service.js';
import { PRICE_PROVIDER } from '../providers/card-provider.interface.js';
import { PortfolioService } from './portfolio.service.js';
import { CollectionComparisonService } from '../../jobs/collection-comparison.service.js';
import { COMPARISON_POLICY } from '../../jobs/comparison.dto.js';
import { CollectionsService } from './collections.service.js';
import { AddItemDto } from './dto/add-item.dto.js';
import { CARD_CONDITIONS } from './dto/card-variant.js';
import { CreateCollectionDto } from './dto/create-collection.dto.js';
import { ListItemsDto } from './dto/list-items.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';

const TEST_CARD_PREFIX = 'test-collections-';
const TEST_CARD_ID = `${TEST_CARD_PREFIX}primary`;
const TEST_CARD_NO_PRICE_ID = `${TEST_CARD_PREFIX}no-price`;
// Set sin `total` ni `printedTotal`: sirve para probar que el denominador
// unknowable no se reemplaza por un `COUNT(cards)`.
const TEST_SET_ID = `${TEST_CARD_PREFIX}set-sin-total`;
const TEST_CARD_IN_UNKNOWN_SET_ID = `${TEST_CARD_PREFIX}in-set-sin-total`;
const TEST_EMAIL_A = 'user-a@test.local';
const TEST_EMAIL_B = 'user-b@test.local';
const TEST_MARKET = new Prisma.Decimal('12.50');
const DEFAULT_LIST_ITEMS = { page: 1, pageSize: 50 } as const;
const PRICE_PROVIDER_STUB = {
  id: 'tcgcsv',
  defaultSource: 'tcgplayer',
  defaultCurrency: 'USD',
};

const addItem = (cardId: string, dto: Partial<AddItemDto> = {}): AddItemDto =>
  Object.assign(new AddItemDto(), { cardId }, dto);

const updateItemDto = (dto: Partial<UpdateItemDto>): UpdateItemDto =>
  Object.assign(new UpdateItemDto(), dto);

describe('CollectionsService', () => {
  const prismaClient = new PrismaClient();
  let moduleRef: TestingModule;
  let service: CollectionsService;
  let userA: string;
  let userB: string;
  let setId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CollectionsService,
        PortfolioService,
        CollectionComparisonService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: PRICE_PROVIDER, useValue: PRICE_PROVIDER_STUB },
      ],
    }).compile();

    service = moduleRef.get(CollectionsService);
  });

  afterAll(async () => {
    await prismaClient.user.deleteMany({ where: { email: { in: [TEST_EMAIL_A, TEST_EMAIL_B] } } });
    // Solo se borran las cartas de prueba: el catálogo lo maneja el sync.
    await prismaClient.card.deleteMany({
      where: { id: { startsWith: TEST_CARD_PREFIX } },
    });
    // La FK de `cards` es ON DELETE CASCADE, así que esto también se lleva
    // TEST_CARD_IN_UNKNOWN_SET_ID.
    await prismaClient.cardSet.deleteMany({
      where: { id: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prismaClient.user.deleteMany({
      where: { email: { in: [TEST_EMAIL_A, TEST_EMAIL_B] } },
    });
    await prismaClient.card.deleteMany({
      where: { id: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.cardSet.deleteMany({
      where: { id: { startsWith: TEST_CARD_PREFIX } },
    });

    userA = (await createUser(TEST_EMAIL_A, 'usera')).id;
    userB = (await createUser(TEST_EMAIL_B, 'userb')).id;

    const set = await prismaClient.cardSet.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    expect(set).not.toBeNull();
    setId = set!.id;

    await prismaClient.card.create({
      data: {
        id: TEST_CARD_ID,
        name: 'Pikachu Test',
        supertype: 'Pokémon',
        subtypes: [],
        types: ['Lightning'],
        number: '1',
        rarity: 'Common',
        setId,
        imageSmall: 'https://example.test/small.png',
        imageLarge: 'https://example.test/large.png',
        rawJson: {},
      },
    });

    await prismaClient.card.create({
      data: {
        id: TEST_CARD_NO_PRICE_ID,
        name: 'Charizard Test',
        supertype: 'Pokémon',
        subtypes: [],
        types: ['Fire'],
        number: '2',
        rarity: 'Rare',
        setId,
        imageSmall: 'https://example.test/small2.png',
        imageLarge: 'https://example.test/large2.png',
        rawJson: {},
      },
    });

    await prismaClient.cardPrice.create({
      data: {
        cardId: TEST_CARD_ID,
        variant: 'normal',
        low: new Prisma.Decimal('1.00'),
        mid: new Prisma.Decimal('2.00'),
        high: new Prisma.Decimal('30.00'),
        market: TEST_MARKET,
        provider: 'tcgcsv',
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    });

    // Precio viejo de la misma variante: el service siempre toma el más reciente.
    await prismaClient.cardPrice.create({
      data: {
        cardId: TEST_CARD_ID,
        variant: 'normal',
        market: new Prisma.Decimal('99.00'),
        provider: 'tcgcsv',
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt: new Date('2024-06-01T00:00:00.000Z'),
      },
    });

    await prismaClient.cardPrice.create({
      data: {
        cardId: TEST_CARD_ID,
        variant: 'holofoil',
        market: new Prisma.Decimal('55.00'),
        provider: 'tcgcsv',
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt: new Date('2024-06-01T00:00:00.000Z'),
      },
    });

    await prismaClient.cardSet.create({
      data: {
        id: TEST_SET_ID,
        name: 'Set de prueba sin total',
        series: null,
        printedTotal: null,
        total: null,
      },
    });

    await prismaClient.card.create({
      data: {
        id: TEST_CARD_IN_UNKNOWN_SET_ID,
        name: 'Mew Test',
        supertype: 'Pokémon',
        subtypes: [],
        types: ['Psychic'],
        number: '1',
        rarity: 'Common',
        setId: TEST_SET_ID,
        imageSmall: 'https://example.test/mew-small.png',
        imageLarge: 'https://example.test/mew-large.png',
        rawJson: {},
      },
    });

    await prismaClient.cardPrice.create({
      data: {
        cardId: TEST_CARD_IN_UNKNOWN_SET_ID,
        variant: 'normal',
        market: new Prisma.Decimal('7.25'),
        provider: 'tcgcsv',
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt: new Date('2024-06-01T00:00:00.000Z'),
      },
    });
  });

  it('el portafolio usa sólo cartas propias, el último precio y registra un punto por día', async () => {
    const own = await createCollection(userA);
    const other = await createCollection(userB);
    await service.addItem(userA, own.id, addItem(TEST_CARD_ID, { quantity: 2 }));
    await service.addItem(userA, own.id, addItem(TEST_CARD_NO_PRICE_ID, { quantity: 3 }));
    await service.addItem(userB, other.id, addItem(TEST_CARD_ID, { quantity: 100 }));
    const portfolio = moduleRef.get(PortfolioService);
    const first = await portfolio.summary(userA);
    expect(first).toMatchObject({ totalCards: 5, unpricedCards: 3, valueUsd: 198 });
    expect(first.topCards).toHaveLength(1);
    expect(first.topCards[0]).toMatchObject({ cardId: TEST_CARD_ID, quantity: 2, marketUsd: 99, valueUsd: 198 });
    await service.addItem(userA, own.id, addItem(TEST_CARD_ID));
    const updated = await portfolio.summary(userA);
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0]?.valueUsd).toBe(297);
    expect(await prismaClient.portfolioSnapshot.count({ where: { userId: userB } })).toBe(0);
  });

  it('sin precios el portafolio registra un valor desconocido, no cero', async () => {
    const own = await createCollection(userA);
    await service.addItem(userA, own.id, addItem(TEST_CARD_NO_PRICE_ID));
    const summary = await moduleRef.get(PortfolioService).summary(userA);
    expect(summary.valueUsd).toBeNull();
    expect(summary.history[0]?.valueUsd).toBeNull();
    expect(summary.topCards).toEqual([]);
  });

  async function createUser(email: string, username: string) {
    return prismaClient.user.create({
      data: {
        email,
        username,
        passwordHash: 'fake-hash-not-used-in-these-tests',
        displayName: username,
      },
      select: { id: true },
    });
  }

  async function createCollection(
    userId: string,
    name = 'Principal',
    isDefault = false,
  ) {
    return service.create(
      userId,
      Object.assign(new CreateCollectionDto(), { name, isDefault }),
    );
  }

  it('la primera colección del usuario se crea con isDefault true', async () => {
    const first = await createCollection(userA, 'Mi deck');
    expect(first.isDefault).toBe(true);
    expect(first.itemCount).toBe(0);
    expect(first.uniqueCount).toBe(0);
    expect(first.totalValueUsd).toBe(0);
    expect(first.totalValueArs).toBeNull();

    const second = await createCollection(userA, ' binder', true);
    expect(second.isDefault).toBe(true);

    const all = await service.list(userA);
    expect(all).toHaveLength(2);
    expect(all.filter((c) => c.isDefault)).toHaveLength(1);
    expect(all[0]!.isDefault).toBe(true);
  });

  it('list() crea "Mi colección" por defecto si el usuario no tiene ninguna', async () => {
    const all = await service.list(userA);
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('Mi colección');
    expect(all[0]!.isDefault).toBe(true);
  });

  it('addItem dos veces la misma carta+variant+condition suma quantity en UNA sola fila', async () => {
    const collection = await createCollection(userA);

    const first = await service.addItem(userA, collection.id, addItem(TEST_CARD_ID));
    expect(first.quantity).toBe(1);
    expect(first.variant).toBe('normal');
    expect(first.condition).toBe('NM');
    expect(first.price?.market).toBe(99);

    const second = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { quantity: 1 }),
    );
    expect(second.id).toBe(first.id);
    expect(second.quantity).toBe(2);

    const rows = await prismaClient.collectionItem.count({
      where: { collectionId: collection.id },
    });
    expect(rows).toBe(1);

    // quantity explícita: "agregar N copias más"
    const third = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { quantity: 3 }),
    );
    expect(third.quantity).toBe(5);
  });

  it('replay con la misma clave confirma el alta sin volver a sumar; otra clave suma intencionalmente', async () => {
    const collection = await createCollection(userA);
    const firstKey = '4b2db49b-6ea0-4f04-9f3a-17eddfbc0434';
    const secondKey = 'd814ebc4-5fbb-4f1e-88df-8c2012e9e66e';
    const payload = addItem(TEST_CARD_ID, { quantity: 2 });

    const first = await service.addItem(
      userA,
      collection.id,
      payload,
      firstKey,
    );
    const replay = await service.addItem(
      userA,
      collection.id,
      payload,
      firstKey,
    );
    expect(replay.id).toBe(first.id);
    expect(replay.quantity).toBe(2);

    const deliberate = await service.addItem(
      userA,
      collection.id,
      payload,
      secondKey,
    );
    expect(deliberate.quantity).toBe(4);
    expect(
      await prismaClient.collectionItemAddOperation.count({
        where: { userId: userA },
      }),
    ).toBe(2);
  });

  it('reproduce el doble incremento si se pierde la respuesta de un cliente antiguo sin clave', async () => {
    const collection = await createCollection(userA);
    const payload = addItem(TEST_CARD_ID, { quantity: 1 });

    await service.addItem(userA, collection.id, payload); // La respuesta exitosa se pierde.
    const retry = await service.addItem(userA, collection.id, payload);

    expect(retry.quantity).toBe(2);
  });

  it('dos requests concurrentes con la misma clave aplican una sola vez', async () => {
    const collection = await createCollection(userA);
    const key = '0a16b7c0-2436-4c74-a936-909397196c40';
    const payload = addItem(TEST_CARD_ID, { quantity: 3 });

    const [first, replay] = await Promise.all([
      service.addItem(userA, collection.id, payload, key),
      service.addItem(userA, collection.id, payload, key),
    ]);
    expect(first.id).toBe(replay.id);
    expect(first.quantity).toBe(3);
    expect(replay.quantity).toBe(3);
  });

  it('dos claves distintas concurrentes sobre una combinación nueva confirman ambas altas', async () => {
    const collection = await createCollection(userA);
    let reads = 0;
    let releaseReads: () => void = () => undefined;
    const bothRead = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const concurrentPrisma = prismaClient.$extends({
      query: {
        collectionItem: {
          async findUnique({ args, query }) {
            const result = await query(args);
            if (args.where.collectionId_cardId_variant_condition) {
              reads += 1;
              if (reads === 2) releaseReads();
              // Obliga a ambas transacciones a leer la combinación ausente antes del INSERT.
              await bothRead;
            }
            return result;
          },
        },
      },
    });
    const concurrentService = new CollectionsService(
      concurrentPrisma as unknown as PrismaService,
      moduleRef.get(PRICE_PROVIDER),
    );
    const [first, second] = await Promise.all([
      concurrentService.addItem(
        userA,
        collection.id,
        addItem(TEST_CARD_ID, { quantity: 2 }),
        '3534a116-859d-4d42-bdb6-a0fd94fdd5f7',
      ),
      concurrentService.addItem(
        userA,
        collection.id,
        addItem(TEST_CARD_ID, { quantity: 3, isForTrade: true }),
        '6fd26e5c-90e0-4bb5-b68e-4a3f8b11b4d0',
      ),
    ]);
    expect(first.id).toBe(second.id);
    expect(
      await prismaClient.collectionItem.findUnique({ where: { id: first.id } }),
    ).toMatchObject({ quantity: 5, isForTrade: true });
    expect(
      await prismaClient.collectionItemAddOperation.count({
        where: { userId: userA },
      }),
    ).toBe(2);
  });

  it('la misma clave con otro payload responde 409 y el replay sigue sujeto a ownership', async () => {
    const own = await createCollection(userA);
    const foreign = await createCollection(userB);
    const key = 'b36bf62d-b8f7-48f8-a535-52d0cf9ccff2';
    const payload = addItem(TEST_CARD_ID);

    await service.addItem(userA, own.id, payload, key);
    await expect(
      service.addItem(
        userA,
        own.id,
        addItem(TEST_CARD_ID, { quantity: 2 }),
        key,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.addItem(userA, foreign.id, payload, key),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (
        await prismaClient.collectionItem.findFirst({
          where: { collectionId: own.id },
        })
      )?.quantity,
    ).toBe(1);
  });

  it('una clave vencida queda bloqueada y no vuelve a incrementar', async () => {
    const collection = await createCollection(userA);
    const key = '48c42b43-4435-40a7-84ee-3fbb109c6d4c';
    const payload = addItem(TEST_CARD_ID);
    await service.addItem(userA, collection.id, payload, key);
    await prismaClient.collectionItemAddOperation.update({
      where: { userId_key: { userId: userA, key } },
      data: { expiresAt: new Date(Date.now() - 1) },
    });

    await expect(
      service.addItem(userA, collection.id, payload, key),
    ).rejects.toBeInstanceOf(GoneException);
    await expect(
      service.addItem(userA, collection.id, payload, key),
    ).rejects.toBeInstanceOf(GoneException);
    expect(
      await prismaClient.collectionItemAddOperation.findUnique({
        where: { userId_key: { userId: userA, key } },
      }),
    ).toMatchObject({ resultItemId: null });
    expect(
      (
        await prismaClient.collectionItem.findFirst({
          where: { collectionId: collection.id },
        })
      )?.quantity,
    ).toBe(1);
  });

  it('el replay devuelve el total editado, sin atribuirlo al delta original ni pisar notas/intercambio', async () => {
    const collection = await createCollection(userA);
    const key = '3189c26e-707a-4c24-abcb-8a130dff03aa';
    const payload = addItem(TEST_CARD_ID, {
      quantity: 2,
      notes: 'nota original',
      isForTrade: true,
    });
    const first = await service.addItem(
      userA,
      collection.id,
      payload,
      key.toUpperCase(),
    );
    await service.updateItem(
      userA,
      first.id,
      updateItemDto({ quantity: 7, notes: 'nota editada', isForTrade: false }),
    );
    expect(
      await service.addItem(userA, collection.id, payload, key),
    ).toMatchObject({
      id: first.id,
      quantity: 7,
      notes: 'nota editada',
      isForTrade: false,
    });
    expect(
      await prismaClient.collectionItemAddOperation.count({
        where: { userId: userA },
      }),
    ).toBe(1);
  });

  it('la clave está particionada por usuario pero no se reutiliza en otra colección propia', async () => {
    const own = await createCollection(userA);
    const another = await createCollection(userA);
    const otherUser = await createCollection(userB);
    const key = 'e65effc4-8d84-431f-8bf0-52bf6f2f07d3';
    const payload = addItem(TEST_CARD_ID);
    await service.addItem(userA, own.id, payload, key);
    await expect(
      service.addItem(userA, another.id, payload, key),
    ).rejects.toBeInstanceOf(ConflictException);
    const independent = await service.addItem(
      userB,
      otherUser.id,
      payload,
      key,
    );
    expect(independent).toMatchObject({
      collectionId: otherUser.id,
      quantity: 1,
    });
    expect(
      await prismaClient.collectionItem.count({
        where: { collectionId: another.id },
      }),
    ).toBe(0);
  });

  it('el hash normaliza defaults pero distingue carta, variante, condición, notas y marca', async () => {
    const collection = await createCollection(userA);
    const key = '5180ea69-7244-484d-bfb1-d3b2cf7d3b4d';
    const payload = addItem(TEST_CARD_ID);
    await service.addItem(userA, collection.id, payload, key);
    await expect(
      service.addItem(
        userA,
        collection.id,
        addItem(TEST_CARD_ID, {
          variant: 'normal',
          condition: 'NM',
          quantity: 1,
        }),
        key,
      ),
    ).resolves.toMatchObject({ quantity: 1 });
    for (const changed of [
      addItem(TEST_CARD_NO_PRICE_ID),
      addItem(TEST_CARD_ID, { variant: 'holofoil' }),
      addItem(TEST_CARD_ID, { condition: 'LP' }),
      addItem(TEST_CARD_ID, { notes: 'otra nota' }),
      addItem(TEST_CARD_ID, { isForTrade: true }),
    ]) {
      await expect(
        service.addItem(userA, collection.id, changed, key),
      ).rejects.toBeInstanceOf(ConflictException);
    }
    expect(
      await prismaClient.collectionItem.count({
        where: { collectionId: collection.id },
      }),
    ).toBe(1);
  });

  it('eliminar y recrear el ítem no permite reaplicar una operación ya confirmada', async () => {
    const collection = await createCollection(userA);
    const key = 'c528be8a-9010-4402-b6d8-d3c60bf86ddf';
    const payload = addItem(TEST_CARD_ID, { quantity: 2 });
    const first = await service.addItem(userA, collection.id, payload, key);
    await service.removeItem(userA, first.id);
    await expect(
      service.addItem(userA, collection.id, payload, key),
    ).rejects.toBeInstanceOf(GoneException);
    const recreated = await service.addItem(userA, collection.id, payload);
    await expect(
      service.addItem(userA, collection.id, payload, key),
    ).rejects.toBeInstanceOf(GoneException);
    expect(
      await prismaClient.collectionItem.findUnique({
        where: { id: recreated.id },
      }),
    ).toMatchObject({ quantity: 2 });
    await service.remove(userA, collection.id);
    await expect(
      service.addItem(userA, collection.id, payload, key),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await prismaClient.collectionItemAddOperation.count({
        where: { userId: userA, key },
      }),
    ).toBe(1);
  });

  it('un alta inválida revierte también el registro de idempotencia', async () => {
    const collection = await createCollection(userA);
    const key = 'e39c9d52-0870-41d7-99bb-d508f056eadf';
    await expect(
      service.addItem(
        userA,
        collection.id,
        addItem('test-collections-inexistente'),
        key,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await prismaClient.collectionItemAddOperation.count({
        where: { userId: userA, key },
      }),
    ).toBe(0);
    await expect(
      service.addItem(userA, collection.id, addItem(TEST_CARD_ID), key),
    ).resolves.toMatchObject({ quantity: 1 });
  });

  it('dos payloads concurrentes con la misma clave confirman uno y rechazan el otro', async () => {
    const collection = await createCollection(userA);
    const key = '7e2ac928-d2a7-494d-a5bf-442329e795ac';
    const outcomes = await Promise.allSettled(
      [1, 3].map((quantity) =>
        service.addItem(
          userA,
          collection.id,
          addItem(TEST_CARD_ID, { quantity }),
          key,
        ),
      ),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(ConflictException);
    const fulfilled = outcomes.find(
      (outcome) => outcome.status === 'fulfilled',
    );
    expect(
      await prismaClient.collectionItem.findFirst({
        where: { collectionId: collection.id },
      }),
    ).toMatchObject({ quantity: fulfilled?.value.quantity });
  });

  it('un alta idempotente conserva notas existentes y solo abre la marca de intercambio', async () => {
    const collection = await createCollection(userA);
    const first = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { notes: 'conservar' }),
    );
    await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { notes: 'no reemplazar', isForTrade: true }),
      'a06750fb-c6c9-4b79-88c6-114f2fba3c55',
    );
    await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { isForTrade: false }),
      'd6b9cb93-cb69-4ff2-962c-b58874a611cb',
    );
    expect(
      await prismaClient.collectionItem.findUnique({ where: { id: first.id } }),
    ).toMatchObject({ quantity: 3, notes: 'conservar', isForTrade: true });
  });

  describe('HTTP política NM', () => {
    let app: INestApplication;
    let baseUrl: string;
    let actor: string;
    const key = '0b547447-5c58-4b87-8384-1d3c42dc3eea';

    beforeEach(async () => {
      actor = userA;
      const httpModule = await Test.createTestingModule({
        controllers: [CollectionsController],
        providers: [
          { provide: CollectionsService, useValue: service },
          { provide: PortfolioService, useValue: {} },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate(context: ExecutionContext) {
            context.switchToHttp().getRequest<{ user: { sub: string } }>().user =
              { sub: actor };
            return true;
          },
        })
        .compile();
      app = httpModule.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      await app.listen(0, '127.0.0.1');
      baseUrl = await app.getUrl();
    });

    afterEach(async () => {
      await app?.close();
      vi.restoreAllMocks();
    });

    const send = (path: string, method = 'GET', payload?: unknown, operationKey?: string) =>
      fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(operationKey ? { 'Idempotency-Key': operationKey } : {}),
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });

    async function accepted(path: string, method: string, payload: unknown, status: number, operationKey?: string) {
      const response = await send(path, method, payload, operationKey);
      expect(response.status).toBe(status);
      return response.json();
    }

    // El estado visible se relee por HTTP; el ledger privado sólo complementa
    // esa prueba porque no existe un endpoint público que lo exponga.
    async function state(collectionId: string) {
      const items = await send(`/collections/${collectionId}/items`);
      const collection = await send(`/collections/${collectionId}`);
      expect(items.status).toBe(200);
      expect(collection.status).toBe(200);
      const listed = await collection.json();
      const page = await items.json();
      return {
        items: page.data.map((item: {
          id: string; condition: string; variant: string; quantity: number;
          notes: string | null; isForTrade: boolean; addedAt: string;
        }) => ({
          id: item.id, condition: item.condition, variant: item.variant,
          quantity: item.quantity, notes: item.notes,
          isForTrade: item.isForTrade, addedAt: item.addedAt,
        })),
        total: page.total,
        counts: [listed.itemCount, listed.uniqueCount, listed.duplicateCount, listed.totalValueUsd],
        operations: await prismaClient.collectionItemAddOperation.findMany({
          where: { userId: userA }, orderBy: { key: 'asc' },
        }),
      };
    }

    async function legacyItem(collectionId: string, condition = 'LP') {
      return prismaClient.collectionItem.create({
        data: {
          collectionId, cardId: TEST_CARD_ID, condition,
          variant: 'normal', quantity: 3, notes: 'histórica', isForTrade: true,
        },
      });
    }

    it.each(CARD_CONDITIONS)('alta acepta %s pero persiste NM sin convertir filas históricas', async (condition) => {
      const collection = await createCollection(userA);
      const legacy = await legacyItem(collection.id, 'HP');
      const path = `/collections/${collection.id}/items`;
      const result = await accepted(path, 'POST', {
        cardId: TEST_CARD_ID, condition, variant: 'holofoil', quantity: 2,
        notes: 'nueva', isForTrade: true,
      }, 201);
      expect(result).toMatchObject({
        condition: 'NM', variant: 'holofoil', quantity: 2,
        notes: 'nueva', isForTrade: true, price: { market: 55 },
      });
      expect((await state(collection.id)).items).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: result.id, condition: 'NM', quantity: 2 }),
        expect.objectContaining({ id: legacy.id, condition: 'HP', quantity: 3, notes: 'histórica' }),
      ]));
    });

    it.each([undefined, ...CARD_CONDITIONS])('editar legacy con condición %s normaliza sin cambiar identidad ni atributos omitidos', async (condition) => {
      const collection = await createCollection(userA);
      const legacy = await legacyItem(collection.id);
      const result = await accepted(`/items/${legacy.id}`, 'PATCH', {
        quantity: 7, ...(condition === undefined ? {} : { condition }),
      }, 200);
      expect(result).toMatchObject({
        id: legacy.id, condition: 'NM', quantity: 7, variant: 'normal',
        notes: 'histórica', isForTrade: true, addedAt: legacy.addedAt.toISOString(),
        price: { market: 99 },
      });
      expect((await state(collection.id)).items).toEqual([
        expect.objectContaining({ id: legacy.id, condition: 'NM', quantity: 7, notes: 'histórica', isForTrade: true }),
      ]);
    });

    it('upsert NM conserva notas y OR de intercambio, suma deltas sin tope agregado y separa variantes', async () => {
      const collection = await createCollection(userA);
      const path = `/collections/${collection.id}/items`;
      const first = await accepted(path, 'POST', { cardId: TEST_CARD_ID, quantity: 999, notes: 'conservar' }, 201);
      const second = await accepted(path, 'POST', {
        cardId: TEST_CARD_ID, quantity: 2, notes: 'no pisar', isForTrade: true,
      }, 201);
      expect(second).toMatchObject({ id: first.id, condition: 'NM', quantity: 1001, notes: 'conservar', isForTrade: true });
      const third = await accepted(path, 'POST', { cardId: TEST_CARD_ID, isForTrade: false }, 201);
      expect(third).toMatchObject({ id: first.id, quantity: 1002, isForTrade: true });
      const holo = await accepted(path, 'POST', { cardId: TEST_CARD_ID, variant: 'holofoil' }, 201);
      expect(holo).toMatchObject({ condition: 'NM', quantity: 1, price: { market: 55 } });
      expect(holo.id).not.toBe(first.id);
      const edited = await accepted(`/items/${first.id}`, 'PATCH', { quantity: 7, notes: 'editada', isForTrade: false }, 200);
      expect(edited).toMatchObject({ quantity: 7, notes: 'editada', isForTrade: false, price: { market: 99 } });
      expect((await state(collection.id)).counts).toEqual([8, 2, 1, 748]);
      const before = await state(collection.id);
      const conflict = await send(`/items/${first.id}`, 'PATCH', { variant: 'holofoil', notes: 'no guardar' });
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toEqual({
        statusCode: 409, error: 'Conflict',
        message: 'Ya existe un item con esa misma variante y condición en la colección',
      });
      expect(await state(collection.id)).toEqual(before);
    });

    it('altas legacy de condiciones distintas incrementan la fila NM existente sin reemplazar atributos', async () => {
      const collection = await createCollection(userA);
      const path = `/collections/${collection.id}/items`;
      const first = await accepted(path, 'POST', { cardId: TEST_CARD_ID, quantity: 2, notes: 'NM original' }, 201);
      const legacy = await accepted(path, 'POST', {
        cardId: TEST_CARD_ID, condition: 'DM', quantity: 3, notes: 'no reemplazar', isForTrade: true,
      }, 201, key);
      expect(legacy).toMatchObject({ id: first.id, condition: 'NM', quantity: 5, notes: 'NM original', isForTrade: true });
      const again = await accepted(path, 'POST', { cardId: TEST_CARD_ID, condition: 'MP', isForTrade: false }, 201);
      expect(again).toMatchObject({ id: first.id, condition: 'NM', quantity: 6, notes: 'NM original', isForTrade: true });
      const saved = await state(collection.id);
      expect(saved.items).toHaveLength(1);
      expect(saved.counts).toEqual([6, 1, 1, 594]);
      expect(saved.operations).toHaveLength(1);
    });

    it('alta idempotente legacy normaliza NM pero conserva el hash original y replay sin escrituras', async () => {
      const collection = await createCollection(userA);
      const path = `/collections/${collection.id}/items`;
      const payload = { cardId: TEST_CARD_ID, condition: 'LP', quantity: 2, notes: 'original' };
      const first = await accepted(path, 'POST', payload, 201, key);
      expect(first).toMatchObject({ condition: 'NM', quantity: 2, notes: 'original' });
      const before = await state(collection.id);
      const capture = vi.spyOn(moduleRef.get(CollectionComparisonService), 'capture');
      const replay = await accepted(path, 'POST', payload, 201, key);
      expect(replay).toMatchObject({ id: first.id, condition: 'NM', quantity: 2 });
      expect(capture).not.toHaveBeenCalled();
      expect(await state(collection.id)).toEqual(before);
      const conflict = await send(path, 'POST', { ...payload, condition: 'NM' }, key);
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toEqual({ statusCode: 409, error: 'Conflict', message: 'La clave ya se usó con otros datos' });
      expect(await state(collection.id)).toEqual(before);
    });

    it('replay de una operación anterior a la política devuelve legacy sin normalizar ni sumar ni capturar', async () => {
      const collection = await createCollection(userA);
      const legacy = await legacyItem(collection.id);
      const payload = { cardId: TEST_CARD_ID, condition: 'LP', quantity: 3, notes: 'histórica', isForTrade: true };
      // Fixture del formato previo: no llama al alta actual para simular historia.
      const payloadHash = createHash('sha256').update(JSON.stringify({
        collectionId: collection.id, cardId: TEST_CARD_ID, variant: 'normal',
        condition: 'LP', quantity: 3, notes: 'histórica', isForTrade: true,
      })).digest('hex');
      await prismaClient.collectionItemAddOperation.create({
        data: { userId: userA, key, payloadHash, resultItemId: legacy.id, expiresAt: new Date(Date.now() + 86400000) },
      });
      const before = await state(collection.id);
      const capture = vi.spyOn(moduleRef.get(CollectionComparisonService), 'capture');
      const result = await accepted(`/collections/${collection.id}/items`, 'POST', payload, 201, key);
      expect(result).toMatchObject({ id: legacy.id, condition: 'LP', quantity: 3, notes: 'histórica', isForTrade: true });
      expect(capture).not.toHaveBeenCalled();
      expect(await state(collection.id)).toEqual(before);
    });

    it.each([{}, { condition: 'MP' }, { quantity: 9, notes: 'no guardar', isForTrade: false }])('colisión legacy con NM da 409 sin fusionar ni alterar datos: %j', async (payload) => {
      const collection = await createCollection(userA);
      const legacy = await legacyItem(collection.id);
      await accepted(`/collections/${collection.id}/items`, 'POST', { cardId: TEST_CARD_ID, quantity: 2, notes: 'NM' }, 201, key);
      const before = await state(collection.id);
      const capture = vi.spyOn(moduleRef.get(CollectionComparisonService), 'capture');
      const response = await send(`/items/${legacy.id}`, 'PATCH', payload);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        statusCode: 409, error: 'Conflict',
        message: 'Ya existe un item con esa misma variante y condición en la colección',
      });
      expect(capture).not.toHaveBeenCalled();
      expect(await state(collection.id)).toEqual(before);
    });

    it('ownership devuelve 404 en alta y edición legacy sin efectos', async () => {
      const collection = await createCollection(userA);
      const legacy = await legacyItem(collection.id);
      const before = await state(collection.id);
      actor = userB;
      for (const [path, method, payload, message] of [
        [`/collections/${collection.id}/items`, 'POST', { cardId: TEST_CARD_ID, condition: 'LP' }, `Colección no encontrada: ${collection.id}`],
        [`/items/${legacy.id}`, 'PATCH', { condition: 'NM', quantity: 8 }, `Item no encontrado: ${legacy.id}`],
      ] as const) {
        const response = await send(path, method, payload, key);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ statusCode: 404, error: 'Not Found', message });
      }
      actor = userA;
      expect(await state(collection.id)).toEqual(before);
      expect(await prismaClient.collectionItemAddOperation.count({ where: { userId: userB } })).toBe(0);
    });

    it.each([
      [{ condition: 'INVALID' }, 'condition must be one of the following values: NM, LP, MP, HP, DM'],
      [{ quantity: 0 }, 'quantity must not be less than 1'],
      [{ quantity: 1000 }, 'quantity must not be greater than 999'],
      [{ quantity: 1.5 }, 'quantity must be an integer number'],
      [{ variant: 'INVALID' }, 'variant must be one of the following values: normal, holofoil, reverseHolofoil, firstEditionNormal, firstEditionHolofoil, firstEdition, unlimited, unlimitedHolofoil'],
      [{ notes: 'x'.repeat(501) }, 'notes must be shorter than or equal to 500 characters'],
    ] as const)('validación rechaza alta y edición sin escrituras: %j', async (invalid, message) => {
      const collection = await createCollection(userA);
      const legacy = await legacyItem(collection.id);
      const before = await state(collection.id);
      for (const [path, method, payload] of [
        [`/collections/${collection.id}/items`, 'POST', { cardId: TEST_CARD_ID, ...invalid }],
        [`/items/${legacy.id}`, 'PATCH', invalid],
      ] as const) {
        const response = await send(path, method, payload, key);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ statusCode: 400, error: 'Bad Request', message: [message] });
        expect(await state(collection.id)).toEqual(before);
      }
    });
  });

  it('HTTP real: perder la respuesta y repetir la clave confirma el mismo alta sin duplicarla', async () => {
    const collection = await createCollection(userA);
    const key = '4b564c9d-2f7b-4ef7-ab5e-20f2f3d9b647';
    const payload = { cardId: TEST_CARD_ID, quantity: 2 };
    const httpModule = await Test.createTestingModule({
      controllers: [CollectionsController],
      providers: [
        { provide: CollectionsService, useValue: service },
        { provide: PortfolioService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<{ user: { sub: string } }>().user =
            { sub: userA };
          return true;
        },
      })
      .compile();
    const app = httpModule.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    try {
      await app.listen(0, '127.0.0.1');
      const url = `${await app.getUrl()}/collections/${collection.id}/items`;
      const post = () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': key,
          },
          body: JSON.stringify(payload),
        });
      // Descarta el resultado confirmado; el cliente conserva solo clave y payload.
      await (await post()).body?.cancel();
      const replay = await post();
      expect(replay.status).toBe(201);
      expect(await replay.json()).toMatchObject({
        collectionId: collection.id,
        quantity: 2,
      });
      expect(
        await prismaClient.collectionItem.findFirst({
          where: { collectionId: collection.id },
        }),
      ).toMatchObject({ quantity: 2 });
      expect(
        await prismaClient.collectionItemAddOperation.count({
          where: { userId: userA, key },
        }),
      ).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('fallos de precios después del commit no ocultan el alta ni rompen su replay', async () => {
    const collection = await createCollection(userA);
    const failingPricesPrisma = prismaClient.$extends({
      query: {
        $queryRaw({ args, query }) {
          const statement: unknown = Array.isArray(args) ? args[0] : args;
          if (
            typeof statement === 'object' &&
            statement !== null &&
            'sql' in statement &&
            typeof statement.sql === 'string' &&
            statement.sql.includes('FROM card_prices')
          ) {
            throw new Error('consulta de precios caída');
          }
          return query(args);
        },
      },
    });
    const enqueueRefresh = vi.fn(() => {
      throw new Error('cola caída');
    });
    const withFailingPrices = new CollectionsService(
      failingPricesPrisma as unknown as PrismaService,
      moduleRef.get(PRICE_PROVIDER),
      { enqueueRefresh } as unknown as SyncPricesService,
    );
    const payload = addItem(TEST_CARD_ID, { quantity: 2 });
    const key = 'c7c8b0a6-9f3f-4fe1-8a87-1b50d09f23ee';
    const first = await withFailingPrices.addItem(
      userA,
      collection.id,
      payload,
      key,
    );
    expect(first).toMatchObject({ quantity: 2, price: null });
    expect(
      await withFailingPrices.addItem(userA, collection.id, payload, key),
    ).toMatchObject({ id: first.id, quantity: 2, price: null });
    expect(enqueueRefresh).toHaveBeenCalledTimes(2);
  });

  /*
   * REGRESIÓN: el alta soltaba la marca para intercambio.
   *
   * El formulario de alta tiene el checkbox, lo guarda en el estado y lo manda en
   * el payload. Pero `AddItemDto` no tenía el campo, y con `whitelist: true` el
   * `ValidationPipe` lo descartaba sin error: la carta entraba a la colección y
   * el filtro server-side "para intercambio" no la mostraba nunca. Sin error en
   * ninguna parte, que es lo que lo hacía difícil de encontrar.
   */
  it('addItem guarda la marca para intercambio del alta', async () => {
    const collection = await createCollection(userA);

    const item = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { isForTrade: true }),
    );

    expect(item.isForTrade).toBe(true);

    // Y tiene que aparecer en el filtro, que es server-side.
    const filtered = await service.listItems(userA, collection.id, {
      ...DEFAULT_LIST_ITEMS,
      forTradeOnly: true,
    });
    expect(filtered.data.some((row) => row.id === item.id)).toBe(true);
  });

  it('addItem sin la marca la deja en false, y no la pisa si ya estaba marcada', async () => {
    const collection = await createCollection(userA);
    const marcada = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { isForTrade: true }),
    );
    expect(marcada.isForTrade).toBe(true);

    // Volver a agregar la misma carta sin tocar el checkbox no la desmarca.
    const sumada = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { quantity: 1 }),
    );
    expect(sumada.quantity).toBe(2);
    expect(sumada.isForTrade).toBe(true);
  });

  it('addItem con variant distinta crea un item separado', async () => {
    const collection = await createCollection(userA);

    const normal = await service.addItem(userA, collection.id, addItem(TEST_CARD_ID));
    const holo = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { variant: 'holofoil' }),
    );

    expect(holo.id).not.toBe(normal.id);
    expect(holo.variant).toBe('holofoil');
    expect(holo.price?.market).toBe(55);

    const items = await service.listItems(userA, collection.id, {
      ...DEFAULT_LIST_ITEMS,
    });
    expect(items.total).toBe(2);
    expect(items.data.map((i) => i.variant).sort()).toEqual([
      'holofoil',
      'normal',
    ]);
  });

  it('getDuplicates devuelve solo los items con quantity > 1', async () => {
    const collection = await createCollection(userA);
    await service.addItem(userA, collection.id, addItem(TEST_CARD_ID));
    await service.addItem(userA, collection.id, addItem(TEST_CARD_ID));
    await service.addItem(userA, collection.id, addItem(TEST_CARD_ID, { quantity: 4 }));
    await service.addItem(userA, collection.id, addItem(TEST_CARD_NO_PRICE_ID));
    await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { variant: 'holofoil' }),
    );

    const duplicates = await service.getDuplicates(userA, collection.id);

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.quantity).toBe(6);
    expect(duplicates[0]!.card.id).toBe(TEST_CARD_ID);
    expect(duplicates[0]!.card.set?.id).toBe(setId);

    const filtered = await service.listItems(userA, collection.id, {
      ...DEFAULT_LIST_ITEMS,
      duplicatesOnly: true,
    });
    expect(filtered.total).toBe(1);
    expect(filtered.data[0]!.quantity).toBe(6);
  });

  it('forTradeOnly filtra por isForTrade y compone con duplicatesOnly', async () => {
    const collection = await createCollection(userA);
    // Dos copias de la misma carta, marcadas para intercambiar.
    const tradeDup = await service.addItem(userA, collection.id, addItem(TEST_CARD_ID, { quantity: 2 }));
    await service.updateItem(userA, tradeDup.id, updateItemDto({ isForTrade: true }));
    // Otra variante de la misma carta, sin marcar y sin repetir.
    await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { variant: 'holofoil' }),
    );
    // Otra carta repetida, también para intercambiar.
    const tradeNoPrice = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_NO_PRICE_ID, { quantity: 3 }),
    );
    await service.updateItem(userA, tradeNoPrice.id, updateItemDto({ isForTrade: true }));
    // Y una repetida que NO está para intercambiar.
    const dupNoTrade = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_IN_UNKNOWN_SET_ID, { quantity: 5 }),
    );

    const all = await service.listItems(userA, collection.id, { ...DEFAULT_LIST_ITEMS });
    expect(all.total).toBe(4);

    const trade = await service.listItems(userA, collection.id, {
      ...DEFAULT_LIST_ITEMS,
      forTradeOnly: true,
    });
    expect(trade.total).toBe(2);
    expect(trade.data.every((item) => item.isForTrade)).toBe(true);
    expect(trade.data.map((item) => item.id).sort()).toEqual(
      [tradeDup.id, tradeNoPrice.id].sort(),
    );

    const dups = await service.listItems(userA, collection.id, {
      ...DEFAULT_LIST_ITEMS,
      duplicatesOnly: true,
    });
    expect(dups.total).toBe(3);

    // Los dos filtros juntos: repetidos Y para intercambiar.
    const both = await service.listItems(userA, collection.id, {
      ...DEFAULT_LIST_ITEMS,
      duplicatesOnly: true,
      forTradeOnly: true,
    });
    expect(both.total).toBe(2);
    expect(both.data.map((item) => item.id).sort()).toEqual(
      [tradeDup.id, tradeNoPrice.id].sort(),
    );
    expect(both.data.map((item) => item.id)).not.toContain(dupNoTrade.id);

    // El `count` tiene que usar el mismo filtro que los datos, o el `total`
    // y la página mienten: esto es lo que pasaba filtrando en el cliente.
    expect(both.total).toBe(both.data.length);
    expect(both.totalPages).toBe(Math.ceil(both.total / DEFAULT_LIST_ITEMS.pageSize));
  });

  it('ownership: userB no puede leer ni modificar nada de userA', async () => {
    const collection = await createCollection(userA);
    const item = await service.addItem(userA, collection.id, addItem(TEST_CARD_ID));

    await expect(service.findOne(userB, collection.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(userB, collection.id, { name: 'hackeada' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(userB, collection.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.listItems(userB, collection.id, { ...DEFAULT_LIST_ITEMS }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.addItem(userB, collection.id, addItem(TEST_CARD_ID)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getDuplicates(userB, collection.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getStats(userB, collection.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.updateItem(userB, item.id, updateItemDto({ quantity: 99 })),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeItem(userB, item.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const listB = await service.list(userB);
    expect(listB).toHaveLength(1);
    expect(listB[0]!.isDefault).toBe(true);

    const untouched = await service.findOne(userA, collection.id);
    expect(untouched.name).toBe('Principal');
    const itemAfter = await prismaClient.collectionItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(itemAfter.quantity).toBe(1);
  });

  it('stats: totalValueUsd = market más reciente x quantity', async () => {
    const collection = await createCollection(userA);
    await service.addItem(userA, collection.id, addItem(TEST_CARD_ID, { quantity: 2 }));
    await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { variant: 'holofoil' }),
    );
    await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_NO_PRICE_ID),
    );

    const stats = await service.getStats(userA, collection.id);

    expect(stats.totalCards).toBe(4); // 2 + 1 + 1
    expect(stats.uniqueCards).toBe(3);
    expect(stats.duplicateCards).toBe(1); // solo el de quantity 2
    expect(stats.setsCount).toBe(1);
    // 99.00 * 2 (normal) + 55.00 * 1 (holofoil); la carta sin precio no suma
    expect(stats.totalValueUsd).toBeCloseTo(253, 2);
    expect(stats.totalValueArs).toBeNull();
    expect(stats.cardsMissingPrice).toBe(1);

    // El mismo valor tiene que aparecer en el listado de colecciones
    const [listed] = await service.list(userA);
    expect(listed.totalValueUsd).toBeCloseTo(253, 2);
    expect(listed.itemCount).toBe(4);
    expect(listed.uniqueCount).toBe(3);
    expect(listed.duplicateCount).toBe(1);

    // Y el precio que se expone es SIEMPRE el más reciente de la variante
    const items = await service.listItems(userA, collection.id, {
      ...DEFAULT_LIST_ITEMS,
    });
    const normal = items.data.find(
      (i) => i.card.id === TEST_CARD_ID && i.variant === 'normal',
    )!;
    expect(normal.price?.market).toBe(99);
    const holo = items.data.find(
      (i) => i.card.id === TEST_CARD_ID && i.variant === 'holofoil',
    )!;
    expect(holo.price?.market).toBe(55);
    const priceless = items.data.find(
      (i) => i.card.id === TEST_CARD_NO_PRICE_ID,
    )!;
    expect(priceless.price).toBeNull();
  });

  it('stats de una colección sin items devuelve ceros, no nulls', async () => {
    const collection = await createCollection(userA);
    const stats = await service.getStats(userA, collection.id);

    expect(stats).toMatchObject({
      totalCards: 0,
      uniqueCards: 0,
      duplicateCards: 0,
      setsCount: 0,
      totalValueUsd: 0,
      totalValueArs: null,
      cardsMissingPrice: 0,
      valuation: { amount: 0, currency: 'USD', coverage: { totalCopies: 0, pricedCopies: 0, unpricedCopies: 0, coverageRatio: null }, recency: { freshness: 'unknown', upstreamFreshness: 'unknown', freshCopies: 0, staleCopies: 0, unknownFreshnessCopies: 0 } },
    });
  });

  it('addItem con una carta inexistente devuelve 404', async () => {
    const collection = await createCollection(userA);
    await expect(
      service.addItem(userA, collection.id, addItem('no-Existe')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('getSetProgress (B7)', () => {
    it('owned cuenta cartas únicas y valueUsd multiplica por quantity', async () => {
      const collection = await createCollection(userA);
      await service.addItem(userA, collection.id, addItem(TEST_CARD_ID, { quantity: 2 }));
      await service.addItem(
        userA,
        collection.id,
        addItem(TEST_CARD_ID, { variant: 'holofoil' }),
      );
      await service.addItem(
        userA,
        collection.id,
        addItem(TEST_CARD_NO_PRICE_ID),
      );

      const rows = await service.getSetProgress(userA, collection.id);
      expect(rows).toHaveLength(1);

      const row = rows[0]!;
      expect(row.setId).toBe(setId);
      // 2 items de la misma carta (normal x2 + holofoil) son UNA carta tenida.
      expect(row.owned).toBe(2);
      // 99.00 * 2 (normal) + 55.00 (holofoil); la carta sin precio no suma.
      expect(row.valueUsd).toBeCloseTo(253, 2);
      expect(row.valueArs).toBeNull();

      // El denominador es el de la fuente, nunca un COUNT(cards).
      const set = await prismaClient.cardSet.findUniqueOrThrow({
        where: { id: setId },
      });
      const declared = set.total ?? set.printedTotal ?? 0;
      expect(row.total).toBe(declared);
      expect(row.missingCount).toBe(Math.max(0, declared - 2));
    });

    it('el total de un set sin denominador es 0, no un COUNT(cards)', async () => {
      const collection = await createCollection(userA);
      await service.addItem(
        userA,
        collection.id,
        addItem(TEST_CARD_IN_UNKNOWN_SET_ID),
      );

      const rows = await service.getSetProgress(userA, collection.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.setId).toBe(TEST_SET_ID);
      expect(rows[0]!.total).toBe(0);
      expect(rows[0]!.missingCount).toBe(0);
      expect(rows[0]!.owned).toBe(1);
      expect(rows[0]!.valueUsd).toBeCloseTo(7.25, 2);
    });

    it('printedTotal es el segundo denominador cuando total es NULL', async () => {
      const printedOnly = await prismaClient.cardSet.update({
        where: { id: TEST_SET_ID },
        data: { total: null, printedTotal: 102 },
      });
      expect(printedOnly.printedTotal).toBe(102);

      const collection = await createCollection(userA);
      await service.addItem(
        userA,
        collection.id,
        addItem(TEST_CARD_IN_UNKNOWN_SET_ID),
      );

      const rows = await service.getSetProgress(userA, collection.id);
      expect(rows[0]!.total).toBe(102);
      expect(rows[0]!.missingCount).toBe(101);
    });

    it('ordena por valueUsd DESC y deja los sets sin denominador al final', async () => {
      const collection = await createCollection(userA);
      // El set sin denominador vale 7.25 y el del catálogo 253: el segundo
      // debería igual ir primero porque sí tiene porcentaje.
      await service.addItem(
        userA,
        collection.id,
        addItem(TEST_CARD_IN_UNKNOWN_SET_ID, { quantity: 1 }),
      );
      await service.addItem(userA, collection.id, addItem(TEST_CARD_ID, { quantity: 2 }));
      await service.addItem(
        userA,
        collection.id,
        addItem(TEST_CARD_ID, { variant: 'holofoil' }),
      );

      const rows = await service.getSetProgress(userA, collection.id);
      expect(rows.map((r) => r.setId)).toEqual([setId, TEST_SET_ID]);
      expect(rows[0]!.valueUsd).toBeGreaterThan(rows[1]!.valueUsd);
    });

    it('una colección vacía devuelve [] y no 404', async () => {
      const collection = await createCollection(userA);
      await expect(service.getSetProgress(userA, collection.id)).resolves.toEqual([]);
    });

    it('ownership: la colección de otro usuario da 404', async () => {
      const collection = await createCollection(userA);
      await service.addItem(userA, collection.id, addItem(TEST_CARD_ID));

      await expect(
        service.getSetProgress(userB, collection.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el mismo query devuelve las mismas cifras que getStats', async () => {
      const collection = await createCollection(userA);
      await service.addItem(userA, collection.id, addItem(TEST_CARD_ID, { quantity: 3 }));
      await service.addItem(
        userA,
        collection.id,
        addItem(TEST_CARD_NO_PRICE_ID),
      );

      const stats = await service.getStats(userA, collection.id);
      const rows = await service.getSetProgress(userA, collection.id);

      const sum = rows.reduce((acc, row) => acc + row.valueUsd, 0);
      expect(Number(sum.toFixed(2))).toBeCloseTo(stats.totalValueUsd, 2);
      const owned = rows.reduce((acc, row) => acc + row.owned, 0);
      expect(owned).toBe(stats.uniqueCards);
    });
  });


  it('BE-04 valúa el scope completo con variante/fuente exactas, nulos, cero y recencia por copias', async () => {
    const now = new Date('2026-10-08T12:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      const collection = await createCollection(userA);
      const prices = [
        { variant: 'normal', market: 10, fetchedAt: new Date(now.getTime() - 86399999) },
        { variant: 'holofoil', market: 4, fetchedAt: new Date(now.getTime() - 86400000) },
        { variant: 'reverseHolofoil', market: 6, fetchedAt: new Date(now.getTime() + 1) },
        { variant: 'firstEditionHolofoil', market: 0, fetchedAt: now },
        { variant: 'firstEditionNormal', market: 100, fetchedAt: new Date(now.getTime() - 1) },
        { variant: 'firstEditionNormal', market: null, fetchedAt: now },
      ];
      await prismaClient.cardPrice.createMany({ data: prices.map((price) => ({ ...price, cardId: TEST_CARD_ID, mid: 500, provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD' })) });
      await prismaClient.cardPrice.createMany({ data: [
        { cardId: TEST_CARD_ID, variant: 'normal', market: 999, provider: 'other', source: 'tcgplayer', currency: 'USD', fetchedAt: new Date(now.getTime() + 10) },
        { cardId: TEST_CARD_ID, variant: 'normal', market: 888, provider: 'tcgcsv', source: 'cardmarket', currency: 'USD', fetchedAt: new Date(now.getTime() + 10) },
        { cardId: TEST_CARD_ID, variant: 'normal', market: 777, provider: 'tcgcsv', source: 'tcgplayer', currency: 'EUR', fetchedAt: new Date(now.getTime() + 10) },
      ] });
      for (const [variant, quantity] of [['normal', 2], ['holofoil', 3], ['reverseHolofoil', 4], ['firstEditionHolofoil', 6], ['firstEditionNormal', 2]] as const) {
        await service.addItem(userA, collection.id, addItem(TEST_CARD_ID, { variant, quantity }));
      }
      await service.addItem(userA, collection.id, addItem(TEST_CARD_NO_PRICE_ID, { quantity: 5 }));
      const expected = { amount: 56, evaluatedAt: now.toISOString(), coverage: { totalCopies: 22, pricedCopies: 15, unpricedCopies: 7, coverageRatio: 15 / 22 },
        recency: { freshness: 'mixed', freshCopies: 8, staleCopies: 3, unknownFreshnessCopies: 4, oldestFetchedAt: new Date(now.getTime() - 86400000).toISOString(), newestFetchedAt: now.toISOString() } };
      expect((await service.findOne(userA, collection.id)).valuation).toMatchObject(expected);
      expect((await service.getStats(userA, collection.id)).valuation).toMatchObject(expected);
      const filtered = await service.listItems(userA, collection.id, { ...DEFAULT_LIST_ITEMS, search: 'charizard' });
      expect(filtered.data).toHaveLength(1);
      expect((await service.findOne(userA, collection.id)).valuation).toMatchObject(expected);
      const items = await service.listItems(userA, collection.id, DEFAULT_LIST_ITEMS);
      expect(items.data.find((item) => item.variant === 'firstEditionNormal')?.price).toMatchObject({ market: null, mid: 500 });
      expect(items.data.find((item) => item.variant === 'firstEditionHolofoil')?.price).toMatchObject({ market: 0, freshness: 'fresh' });
      const portfolio = new PortfolioService(prismaClient as unknown as PrismaService, PRICE_PROVIDER_STUB as PriceProvider, undefined,
        new CollectionComparisonService(prismaClient as unknown as PrismaService, PRICE_PROVIDER_STUB));
      await prismaClient.portfolioSnapshot.create({ data: { userId: userA, day: new Date('2026-10-07T00:00:00.000Z'), valueUsd: 999, totalCards: 4, unpricedCards: 2 } });
      await prismaClient.collectionComparisonSnapshot.create({ data: { collectionId: collection.id, provider: 'tcgcsv',
        policy: COMPARISON_POLICY, day: new Date('2026-10-07T00:00:00Z'), valueUsd: 10, totalCopies: 4, pricedCopies: 2,
        freshCopies: 2, staleCopies: 0, unknownFreshnessCopies: 0, compositionFingerprint: 'historical-test',
        compositionChanged: false, scopeCount: 1, snapshotCut: 'historical-test', evaluatedAt: new Date('2026-10-07T12:00:00Z') } });
      const result = await portfolio.summary(userA);
      expect(result.valuation).toMatchObject(expected);
      expect(result.valueUsd).toBe(56);
      expect(result.topCards.find((card) => card.variant === 'normal')?.reference).toMatchObject({ provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD', fetchedAt: new Date(now.getTime() - 86399999).toISOString(), freshness: 'fresh', evaluatedAt: now.toISOString() });
      expect(result.topCards.find((card) => card.variant === 'reverseHolofoil')?.reference.freshness).toBe('unknown');
      expect(result.history[0]?.valuation).toMatchObject({ amount: 10, evaluatedAt: null, recency: null, coverage: { totalCopies: 4, pricedCopies: 2, unpricedCopies: 2, coverageRatio: 0.5 } });
      await portfolio.summary(userA);
      expect(await prismaClient.portfolioSnapshot.count({ where: { userId: userA } })).toBe(1);
      expect(await prismaClient.portfolioSnapshot.count({ where: { userId: userA, day: new Date('2026-10-08T00:00:00.000Z') } })).toBe(0);
      expect(await prismaClient.collectionComparisonSnapshot.count({ where: { collectionId: collection.id, provider: 'tcgcsv', day: new Date('2026-10-08T00:00:00Z') } })).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it('updateItem cambia quantity y isForTrade, y da 409 si choca con el unique', async () => {
    const collection = await createCollection(userA);
    const normal = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID),
    );
    await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { variant: 'holofoil' }),
    );

    const updated = await service.updateItem(
      userA,
      normal.id,
      updateItemDto({ quantity: 7, isForTrade: true, notes: 'para trade' }),
    );
    expect(updated.quantity).toBe(7);
    expect(updated.isForTrade).toBe(true);
    expect(updated.notes).toBe('para trade');

    // Choca con el holofoil que ya existe: 409
    await expect(
      service.updateItem(userA, normal.id, updateItemDto({ variant: 'holofoil' })),
    ).rejects.toBeInstanceOf(ConflictException);

    // El input legacy se acepta pero apunta a la misma condición NM.
    const normalized = await service.updateItem(
      userA, normal.id, updateItemDto({ condition: 'LP' }),
    );
    expect(normalized).toMatchObject({ id: normal.id, condition: 'NM', quantity: 7 });

    // Mover a una combinación libre sí funciona
    const moved = await service.updateItem(
      userA,
      normal.id,
      updateItemDto({ variant: 'reverseHolofoil' }),
    );
    expect(moved.variant).toBe('reverseHolofoil');
    expect(moved.quantity).toBe(7);

    const rows = await prismaClient.collectionItem.findMany({
      where: { collectionId: collection.id },
      orderBy: { variant: 'asc' },
    });
    expect(rows).toHaveLength(2);
  });

  it('remove y removeItem borran en cascada', async () => {
    const collection = await createCollection(userA);
    const item = await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { quantity: 3 }),
    );

    await service.removeItem(userA, item.id);
    await expect(
      prismaClient.collectionItem.findUnique({ where: { id: item.id } }),
    ).resolves.toBeNull();
    const collection2 = await createCollection(userA, 'Para borrar');
    await service.addItem(userA, collection2.id, addItem(TEST_CARD_ID));
    await service.remove(userA, collection2.id);
    await expect(
      prismaClient.collectionItem.count({ where: { collectionId: collection2.id } }),
    ).resolves.toBe(0);
  });

  it('listItems filtra por setId y por search sobre el nombre de la carta', async () => {
    const collection = await createCollection(userA);
    await service.addItem(userA, collection.id, addItem(TEST_CARD_ID));
    await service.addItem(userA, collection.id, addItem(TEST_CARD_NO_PRICE_ID));

    const bySet = await service.listItems(userA, collection.id, {
      ...DEFAULT_LIST_ITEMS,
      setId,
    });
    expect(bySet.total).toBe(2);

    const bySearch = await service.listItems(userA, collection.id, {
      ...DEFAULT_LIST_ITEMS,
      search: 'charizard',
    });
    expect(bySearch.total).toBe(1);
    expect(bySearch.data[0]!.card.id).toBe(TEST_CARD_NO_PRICE_ID);

    const page = await service.listItems(userA, collection.id, {
      page: 2,
      pageSize: 1,
    });
    expect(page.data).toHaveLength(1);
    expect(page.page).toBe(2);
    expect(page.totalPages).toBe(2);
  });
});

describe('CollectionsService · cover de portada (B9)', () => {
  const prismaClient = new PrismaClient();
  const PREFIX = 'test-b9-';
  const CARD_A = `${PREFIX}a`;
  const CARD_B = `${PREFIX}b`;
  const CARD_C = `${PREFIX}c`;
  const CARD_D = `${PREFIX}d`;
  const CARD_E = `${PREFIX}e`;
  const TEST_EMAIL = 'b9@test.local';
  const OTHER_TEST_EMAIL = 'b9-otro@test.local';

  let moduleRef: TestingModule;
  let service: CollectionsService;
  let userId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CollectionsService,
        PortfolioService,
        CollectionComparisonService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: PRICE_PROVIDER, useValue: PRICE_PROVIDER_STUB },
      ],
    }).compile();

    service = moduleRef.get(CollectionsService);
  });

  afterAll(async () => {
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await prismaClient.user.deleteMany({ where: { email: { in: [TEST_EMAIL, OTHER_TEST_EMAIL] } } });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prismaClient.user.deleteMany({ where: { email: { in: [TEST_EMAIL, OTHER_TEST_EMAIL] } } });
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });

    userId = (
      await prismaClient.user.create({
        data: {
          email: TEST_EMAIL,
          username: 'b9user',
          passwordHash: 'fake-hash-not-used-in-these-tests',
          displayName: 'b9',
        },
        select: { id: true },
      })
    ).id;

    const set = await prismaClient.cardSet.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    for (const [index, id] of [CARD_A, CARD_B, CARD_C, CARD_D, CARD_E].entries()) {
      await prismaClient.card.create({
        data: {
          id,
          name: `Carta B9 ${index}`,
          supertype: 'Pokémon',
          subtypes: [],
          types: ['Fire'],
          number: String(index + 1),
          rarity: 'Rare',
          setId: set!.id,
          imageSmall: `https://example.test/${id}.png`,
          imageLarge: `https://example.test/${id}_hires.png`,
          rawJson: {},
        },
      });
    }
  });

  async function newCollection(name: string) {
    return service.create(userId, Object.assign(new CreateCollectionDto(), { name }));
  }

  async function add(cardId: string, quantity: number, variant = 'normal') {
    const collection = (await prismaClient.collection.findFirstOrThrow({
      where: { userId, isDefault: true },
      select: { id: true },
    })).id;
    return service.addItem(
      userId,
      collection,
      Object.assign(new AddItemDto(), { cardId, quantity, variant }),
    );
  }

  it('create devuelve cover: [] porque la colección está vacía', async () => {
    const created = await newCollection('Vacía');
    expect(created.cover).toEqual([]);
  });

  it('list trae hasta 4 items ordenados por quantity DESC', async () => {
    await newCollection('Principal');
    await add(CARD_A, 1);
    await add(CARD_B, 9);
    await add(CARD_C, 5);
    await add(CARD_D, 7);
    await add(CARD_E, 3);

    const [listed] = await service.list(userId);

    expect(listed!.cover.map((item) => item.cardId)).toEqual([
      CARD_B, // 9
      CARD_D, // 7
      CARD_C, // 5
      CARD_E, // 3
    ]);
    expect(listed!.cover[0]!.imageSmall).toBe(`https://example.test/${CARD_B}.png`);
  });

  it('no repite la misma carta aunque tenga dos variantes', async () => {
    await newCollection('Principal');
    await add(CARD_A, 1, 'normal');
    await add(CARD_A, 8, 'holofoil');
    await add(CARD_B, 4);

    const [listed] = await service.list(userId);

    expect(listed!.cover.map((item) => item.cardId)).toEqual([CARD_A, CARD_B]);
  });

  it('findOne y update devuelven el mismo cover que list', async () => {
    await newCollection('Principal');
    await add(CARD_A, 2);
    await add(CARD_B, 6);
    const created = (await service.list(userId))[0]!;

    const found = await service.findOne(userId, created.id);
    const updated = await service.update(userId, created.id, { name: 'Renombrada' });

    expect(found.cover.map((c) => c.cardId)).toEqual(created.cover.map((c) => c.cardId));
    expect(updated.cover.map((c) => c.cardId)).toEqual(created.cover.map((c) => c.cardId));
  });

  it('una colección vacía tiene cover: [] y no undefined', async () => {
    const first = await newCollection('Una');
    const second = await newCollection('Otra');

    expect(first.cover).toEqual([]);
    const listed = await service.list(userId);
    expect(listed).toHaveLength(2);
    for (const collection of listed) {
      expect(collection.cover).toEqual([]);
    }
    expect((await service.findOne(userId, second.id)).cover).toEqual([]);
  });

  it('el cover solo trae cartas de las colecciones del usuario', async () => {
    await newCollection('Principal');
    await add(CARD_A, 3);

    const other = await prismaClient.user.create({
      data: {
        email: OTHER_TEST_EMAIL,
        username: 'b9otro',
        passwordHash: 'fake-hash-not-used-in-these-tests',
        displayName: 'otro',
      },
      select: { id: true },
    });
    const otherCollection = await service.create(
      other.id,
      Object.assign(new CreateCollectionDto(), { name: 'Suyo' }),
    );
    await service.addItem(
      other.id,
      otherCollection.id,
      Object.assign(new AddItemDto(), { cardId: CARD_E, quantity: 50 }),
    );

    const [listed] = await service.list(userId);
    expect(listed!.cover.map((c) => c.cardId)).toEqual([CARD_A]);
  });
});

/**
 * El join de precio pasó de un `DISTINCT ON` global sobre `card_prices` a un
 * `LATERAL` anclado en cada item (`common/sql/latest-price.ts`). Estos tests
 * fijan las tres cosas que un `LATERAL ... ORDER BY fetchedAt DESC LIMIT 1`
 * podría hacer mal y que los tests de arriba no detectan.
 */
describe('CollectionsService · precio por item (latestMarketPriceJoin)', () => {
  const prismaClient = new PrismaClient();
  const PREFIX = 'test-b910-';
  const CARD = `${PREFIX}card`;
  const TEST_EMAIL = 'latest-price@b910.local';

  let moduleRef: TestingModule;
  let service: CollectionsService;
  let userId: string;
  let collectionId: string;

  const price = (variant: string, market: string | null, fetchedAt: string) =>
    prismaClient.cardPrice.create({
      data: {
        cardId: CARD,
        variant,
        mid: new Prisma.Decimal('3.00'),
        market: market === null ? null : new Prisma.Decimal(market),
        provider: 'tcgcsv',
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt: new Date(fetchedAt),
      },
    });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CollectionsService,
        PortfolioService,
        CollectionComparisonService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: PRICE_PROVIDER, useValue: PRICE_PROVIDER_STUB },
      ],
    }).compile();

    service = moduleRef.get(CollectionsService);
  });

  afterAll(async () => {
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await prismaClient.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prismaClient.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });

    userId = (
      await prismaClient.user.create({
        data: {
          email: TEST_EMAIL,
          username: 'latestprice',
          passwordHash: 'fake-hash-not-used-in-these-tests',
          displayName: 'latest price',
        },
        select: { id: true },
      })
    ).id;

    const set = await prismaClient.cardSet.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    await prismaClient.card.create({
      data: {
        id: CARD,
        name: 'Carta B9 10',
        supertype: 'Pokémon',
        subtypes: [],
        types: ['Fire'],
        number: '1',
        rarity: 'Rare',
        setId: set!.id,
        imageSmall: 'https://example.test/small.png',
        imageLarge: 'https://example.test/large.png',
        rawJson: {},
      },
    });

    collectionId = (
      await prismaClient.collection.create({
        data: { userId, name: 'Precios', isDefault: true },
        select: { id: true },
      })
    ).id;
  });

  it('el precio es el de la variante del item, no el más nuevo de la carta', async () => {
    // El `normal` es 10 y es más viejo que el `holofoil` (500, más nuevo). Un
    // join que ordenara por `fetchedAt` sin filtrar por variante devolvería 500
    // para el item `normal`.
    await price('normal', '10.00', '2024-01-01T00:00:00.000Z');
    await price('normal', '11.00', '2024-02-01T00:00:00.000Z');
    await price('holofoil', '500.00', '2024-03-01T00:00:00.000Z');

    await service.addItem(userId, collectionId, addItem(CARD, { quantity: 2 }));
    await service.addItem(
      userId,
      collectionId,
      addItem(CARD, { variant: 'holofoil', quantity: 1 }),
    );

    const stats = await service.getStats(userId, collectionId);
    // 11 (normal, la más reciente de esa variante) x 2 + 500 x 1
    expect(stats.totalValueUsd).toBeCloseTo(522, 2);
  });

  it('una fila más nueva con market NULL cuenta como precio faltante', async () => {
    // La última cotización de la variante vino sin `market`. El total tiene que
    // sumar 0, no el 77 de la fila anterior: un `WHERE market IS NOT NULL` en el
    // lateral "arreglaría" el síntoma y mentiría sobre el dato más reciente.
    await price('normal', '77.00', '2024-01-01T00:00:00.000Z');
    await price('normal', null, '2024-06-01T00:00:00.000Z');

    await service.addItem(userId, collectionId, addItem(CARD, { quantity: 4 }));

    const stats = await service.getStats(userId, collectionId);
    expect(stats.totalValueUsd).toBe(0);

    // La fila más nueva es la cotización vigente y no tiene `market` usable.
    expect(stats.cardsMissingPrice).toBe(1);
  });

  it('el mismo número aparece en /stats, en el listado y en el progreso por set', async () => {
    await price('normal', '12.00', '2024-01-01T00:00:00.000Z');
    await service.addItem(userId, collectionId, addItem(CARD, { quantity: 3 }));

    const stats = await service.getStats(userId, collectionId);
    const [listed] = await service.list(userId);
    const progress = await service.getSetProgress(userId, collectionId);

    expect(stats.totalValueUsd).toBeCloseTo(36, 2);
    expect(listed.totalValueUsd).toBeCloseTo(stats.totalValueUsd, 2);
    expect(progress[0]!.valueUsd).toBeCloseTo(stats.totalValueUsd, 2);
  });
});

/**
 * `sort` en el listado de items y `GET /cards/:id/location`.
 *
 * El `sort=price` es la parte interesante: tiene que ordenar por el **mismo** join
 * que usa el `totalValueUsd` de `/stats`, sin pedirle nada a tcgdex, y la página
 * tiene que seguir trayendo los mismos items que el `count`.
 */
describe('CollectionsService · orden del listado y location de carta', () => {
  const prismaClient = new PrismaClient();
  const PREFIX = 'test-sort-';
  const CHEAP = `${PREFIX}cheap`; // número 10, market 2
  const MID = `${PREFIX}mid`; // número 4, market 20
  const RICH = `${PREFIX}rich`; // número 104, market 30
  const NO_PRICE = `${PREFIX}no-price`; // número 40, sin filas de precio
  const TEST_EMAIL = 'sort@b910.local';
  const OTHER_TEST_EMAIL = 'otro@b910.local';

  let moduleRef: TestingModule;
  let service: CollectionsService;
  let userId: string;
  let collectionId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CollectionsService,
        PortfolioService,
        CollectionComparisonService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: PRICE_PROVIDER, useValue: PRICE_PROVIDER_STUB },
      ],
    }).compile();

    service = moduleRef.get(CollectionsService);
  });

  afterAll(async () => {
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await prismaClient.user.deleteMany({ where: { email: { in: [TEST_EMAIL, OTHER_TEST_EMAIL] } } });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prismaClient.user.deleteMany({ where: { email: { in: [TEST_EMAIL, OTHER_TEST_EMAIL] } } });
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });

    userId = (
      await prismaClient.user.create({
        data: {
          email: TEST_EMAIL,
          username: 'sorteo',
          passwordHash: 'fake-hash-not-used-in-these-tests',
          displayName: 'sort',
        },
        select: { id: true },
      })
    ).id;

    const set = await prismaClient.cardSet.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    const cards = [
      { id: CHEAP, name: 'Carta Sort A', number: '10', rarity: 'Rare' },
      { id: MID, name: 'Carta Sort B', number: '4', rarity: 'Common' },
      { id: RICH, name: 'Carta Sort C', number: '104', rarity: null },
      { id: NO_PRICE, name: 'Carta Sort D', number: '40', rarity: 'Rare Holo' },
    ];
    for (const card of cards) {
      await prismaClient.card.create({
        data: {
          ...card,
          supertype: 'Pokémon',
          subtypes: [],
          types: ['Fire'],
          setId: set!.id,
          imageSmall: 'https://example.test/s.png',
          imageLarge: 'https://example.test/l.png',
          rawJson: {},
        },
      });
    }

    for (const [cardId, market] of [
      [CHEAP, '2.00'],
      [MID, '20.00'],
      [RICH, '30.00'],
    ] as const) {
      await prismaClient.cardPrice.create({
        data: {
          cardId,
          variant: 'normal',
          market: new Prisma.Decimal(market),
          provider: 'tcgcsv',
          source: 'tcgplayer',
          currency: 'USD',
          fetchedAt: new Date('2024-06-01T00:00:00.000Z'),
        },
      });
    }

    collectionId = (
      await prismaClient.collection.create({
        data: { userId, name: 'Orden', isDefault: true },
        select: { id: true },
      })
    ).id;
  });

  const list = (dto: Partial<ListItemsDto> = {}) =>
    service.listItems(userId, collectionId, {
      ...DEFAULT_LIST_ITEMS,
      ...dto,
    } as ListItemsDto);

  it('sin sort mantiene el orden por fecha de agregado', async () => {
    await service.addItem(userId, collectionId, addItem(CHEAP));
    await service.addItem(userId, collectionId, addItem(MID));
    await service.addItem(userId, collectionId, addItem(RICH));

    const result = await list();
    // El último agregado es el primero de la página.
    expect(result.data.map((item) => item.card.id)).toEqual([RICH, MID, CHEAP]);
  });

  it('sort=name ordena por el nombre de la carta', async () => {
    await service.addItem(userId, collectionId, addItem(RICH));
    await service.addItem(userId, collectionId, addItem(CHEAP));
    await service.addItem(userId, collectionId, addItem(MID));

    const result = await list({ sort: 'name' });
    expect(result.data.map((item) => item.card.id)).toEqual([CHEAP, MID, RICH]);
  });

  it('sort=rarity deja las cartas sin rareza al final', async () => {
    await service.addItem(userId, collectionId, addItem(RICH)); // rarity null
    await service.addItem(userId, collectionId, addItem(CHEAP)); // Rare
    await service.addItem(userId, collectionId, addItem(MID)); // Common
    await service.addItem(userId, collectionId, addItem(NO_PRICE)); // Rare Holo

    const result = await list({ sort: 'rarity' });
    expect(result.data.map((item) => item.card.id)).toEqual([
      MID, // Common
      CHEAP, // Rare
      NO_PRICE, // Rare Holo
      RICH, // null
    ]);
  });

  it('sort=number ordena por la parte numérica: 4 antes que 10 antes que 104', async () => {
    await service.addItem(userId, collectionId, addItem(RICH)); // 104
    await service.addItem(userId, collectionId, addItem(CHEAP)); // 10
    await service.addItem(userId, collectionId, addItem(MID)); // 4
    await service.addItem(userId, collectionId, addItem(NO_PRICE)); // 40

    const result = await list({ sort: 'number' });
    expect(result.data.map((item) => item.card.id)).toEqual([
      MID, // 4
      CHEAP, // 10
      NO_PRICE, // 40
      RICH, // 104
    ]);
  });

  it('sort=price ordena por el valor del item y deja los sin precio al final', async () => {
    await service.addItem(userId, collectionId, addItem(CHEAP)); // 1 x 2
    await service.addItem(userId, collectionId, addItem(MID)); // 1 x 20
    await service.addItem(userId, collectionId, addItem(RICH)); // 1 x 30
    await service.addItem(userId, collectionId, addItem(NO_PRICE)); // sin precio

    const result = await list({ sort: 'price' });
    expect(result.data.map((item) => item.card.id)).toEqual([
      RICH,
      MID,
      CHEAP,
      NO_PRICE,
    ]);
  });

  it('sort=price usa quantity: 3 copias de una barata ganan a 1 de una cara', async () => {
    await service.addItem(userId, collectionId, addItem(MID, { quantity: 3 })); // 60
    await service.addItem(userId, collectionId, addItem(RICH, { quantity: 1 })); // 30

    const result = await list({ sort: 'price' });
    expect(result.data.map((item) => item.card.id)).toEqual([MID, RICH]);

    // Y el total coincide con la suma de esos mismos valores.
    const stats = await service.getStats(userId, collectionId);
    expect(stats.totalValueUsd).toBe(90);
  });

  it('el sort y los filtros compone: la página trae los items del filtro y el total del filtro', async () => {
    await service.addItem(userId, collectionId, addItem(CHEAP, { quantity: 5 }));
    await service.addItem(userId, collectionId, addItem(MID));
    await service.addItem(userId, collectionId, addItem(RICH));

    const result = await list({ sort: 'price', duplicatesOnly: true });
    expect(result.total).toBe(1);
    expect(result.data.map((item) => item.card.id)).toEqual([CHEAP]);
  });

  it('sort=price pagina sin repetir items entre páginas', async () => {
    await service.addItem(userId, collectionId, addItem(CHEAP));
    await service.addItem(userId, collectionId, addItem(MID));
    await service.addItem(userId, collectionId, addItem(RICH));

    const first = await list({ sort: 'price', pageSize: 2 });
    const second = await list({ sort: 'price', page: 2, pageSize: 2 });

    expect(first.data).toHaveLength(2);
    expect(second.data).toHaveLength(1);
    expect(second.total).toBe(3);
    for (const item of second.data) {
      expect(first.data.map((row) => row.card.id)).not.toContain(item.card.id);
    }
  });

  it('una página más allá del final conserva el total real', async () => {
    await service.addItem(userId, collectionId, addItem(MID));

    const result = await list({ sort: 'price', page: 5, pageSize: 10 });
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('findCardLocation devuelve la colección, el item y la cantidad', async () => {
    const item = await service.addItem(userId, collectionId, addItem(MID, { quantity: 3 }));

    const found = await service.findCardLocation(userId, MID);
    expect(found).toEqual({
      collectionId,
      collectionName: 'Orden',
      itemId: item.id,
      quantity: 3,
      variant: 'normal',
      condition: 'NM',
    });
  });

  it('findCardLocation da null si el usuario no tiene la carta', async () => {
    await expect(service.findCardLocation(userId, CHEAP)).resolves.toBeNull();
  });

  it('findCardLocation da 404 si la carta no existe', async () => {
    await expect(service.findCardLocation(userId, `${PREFIX}nada`)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('ownership: el item de otro usuario no se ve (null, no 403)', async () => {
    await service.addItem(userId, collectionId, addItem(MID));

    const other = await prismaClient.user.create({
      data: {
        email: OTHER_TEST_EMAIL,
        username: 'otro',
        passwordHash: 'fake-hash-not-used-in-these-tests',
        displayName: 'otro',
      },
      select: { id: true },
    });

    await expect(service.findCardLocation(other.id, MID)).resolves.toBeNull();
  });

  it('con la carta en varias colecciones manda la principal, no la que más copias tiene', async () => {
    await service.addItem(userId, collectionId, addItem(MID, { quantity: 9 }));
    const secundaria = await service.create(
      userId,
      Object.assign(new CreateCollectionDto(), { name: 'Secundaria', isDefault: false }),
    );
    await service.addItem(userId, secundaria.id, addItem(MID, { quantity: 1 }));

    const found = await service.findCardLocation(userId, MID);
    expect(found?.collectionId).toBe(collectionId);
    expect(found?.quantity).toBe(9);

    // Si la principal deja de serlo (la otra tiene menos copias), la otra gana.
    await prismaClient.collection.update({
      where: { id: collectionId },
      data: { isDefault: false },
    });
    await prismaClient.collection.update({
      where: { id: secundaria.id },
      data: { isDefault: true },
    });
    const foundSecondary = await service.findCardLocation(userId, MID);
    expect(foundSecondary?.collectionId).toBe(secundaria.id);
    expect(foundSecondary?.quantity).toBe(1);
  });
});
