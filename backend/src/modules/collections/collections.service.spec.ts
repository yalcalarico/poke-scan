import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import { CollectionsService } from './collections.service.js';
import { AddItemDto } from './dto/add-item.dto.js';
import { CreateCollectionDto } from './dto/create-collection.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';

const TEST_CARD_PREFIX = 'test-collections-';
const TEST_CARD_ID = `${TEST_CARD_PREFIX}primary`;
const TEST_CARD_NO_PRICE_ID = `${TEST_CARD_PREFIX}no-price`;
// Set sin `total` ni `printedTotal`: sirve para probar que el denominador
// unknowable no se reemplaza por un `COUNT(cards)`.
const TEST_SET_ID = `${TEST_CARD_PREFIX}set-sin-total`;
const TEST_CARD_IN_UNKNOWN_SET_ID = `${TEST_CARD_PREFIX}in-set-sin-total`;
const TEST_MARKET = new Prisma.Decimal('12.50');
const DEFAULT_LIST_ITEMS = { page: 1, pageSize: 50 } as const;

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
        { provide: PrismaService, useValue: prismaClient },
      ],
    }).compile();

    service = moduleRef.get(CollectionsService);
  });

  afterAll(async () => {
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
      where: { email: { endsWith: '@test.local' } },
    });
    await prismaClient.card.deleteMany({
      where: { id: { startsWith: TEST_CARD_PREFIX } },
    });
    await prismaClient.cardSet.deleteMany({
      where: { id: { startsWith: TEST_CARD_PREFIX } },
    });

    userA = (await createUser('user-a@test.local', 'usera')).id;
    userB = (await createUser('user-b@test.local', 'userb')).id;

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
        source: 'test',
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
        source: 'test',
        currency: 'USD',
        fetchedAt: new Date('2024-06-01T00:00:00.000Z'),
      },
    });

    await prismaClient.cardPrice.create({
      data: {
        cardId: TEST_CARD_ID,
        variant: 'holofoil',
        market: new Prisma.Decimal('55.00'),
        source: 'test',
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
        source: 'test',
        currency: 'USD',
        fetchedAt: new Date('2024-06-01T00:00:00.000Z'),
      },
    });
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

    expect(stats).toEqual({
      totalCards: 0,
      uniqueCards: 0,
      duplicateCards: 0,
      setsCount: 0,
      totalValueUsd: 0,
      totalValueArs: null,
      cardsMissingPrice: 0,
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

    // Choca por condición: mismo variant 'normal' pero condición 'LP' ya usada
    await service.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { condition: 'LP' }),
    );
    await expect(
      service.updateItem(userA, normal.id, updateItemDto({ condition: 'LP' })),
    ).rejects.toBeInstanceOf(ConflictException);

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
    expect(rows).toHaveLength(3);
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

  let moduleRef: TestingModule;
  let service: CollectionsService;
  let userId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CollectionsService,
        { provide: PrismaService, useValue: prismaClient },
      ],
    }).compile();

    service = moduleRef.get(CollectionsService);
  });

  afterAll(async () => {
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await prismaClient.user.deleteMany({ where: { email: { endsWith: '@test.local' } } });
    await prismaClient.$disconnect();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prismaClient.user.deleteMany({ where: { email: { endsWith: '@test.local' } } });
    await prismaClient.card.deleteMany({ where: { id: { startsWith: PREFIX } } });

    userId = (
      await prismaClient.user.create({
        data: {
          email: 'b9@test.local',
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
        email: 'b9-otro@test.local',
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
        source: 'test',
        currency: 'USD',
        fetchedAt: new Date(fetchedAt),
      },
    });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CollectionsService,
        { provide: PrismaService, useValue: prismaClient },
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

  it('una fila más nueva con market NULL no hace caer a la fila vieja con precio', async () => {
    // La última cotización de la variante vino sin `market`. El total tiene que
    // sumar 0, no el 77 de la fila anterior: un `WHERE market IS NOT NULL` en el
    // lateral "arreglaría" el síntoma y mentiría sobre el dato más reciente.
    await price('normal', '77.00', '2024-01-01T00:00:00.000Z');
    await price('normal', null, '2024-06-01T00:00:00.000Z');

    await service.addItem(userId, collectionId, addItem(CARD, { quantity: 4 }));

    const stats = await service.getStats(userId, collectionId);
    expect(stats.totalValueUsd).toBe(0);

    // La carta sí tiene fila de precio, así que no cuenta como "sin precio"
    // (el criterio de `cardsMissingPrice` es la existencia, no el market).
    expect(stats.cardsMissingPrice).toBe(0);
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
