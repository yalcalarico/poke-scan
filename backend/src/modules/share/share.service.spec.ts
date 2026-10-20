import { type INestApplication, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import { RedisService } from '../../redis/index.js';
import { PRICE_PROVIDER } from '../providers/card-provider.interface.js';
import { CollectionsService } from '../collections/collections.service.js';
import { AddItemDto } from '../collections/dto/add-item.dto.js';
import { CreateCollectionDto } from '../collections/dto/create-collection.dto.js';
import { CreateShareDto } from './dto/create-share.dto.js';
import { UpdateShareDto } from './dto/update-share.dto.js';
import { ShareService, type SharedCollectionDto } from './share.service.js';
import { PublicShareController } from './public-share.controller.js';

const TEST_CARD_PREFIX = 'test-share-';
const TEST_CARD_ID = `${TEST_CARD_PREFIX}primary`;
const TEST_CARD_2_ID = `${TEST_CARD_PREFIX}secondary`;
const TEST_EMAIL_A = 'share-user-a@test.local';
const TEST_EMAIL_B = 'share-user-b@test.local';
const PRICE_PROVIDER_STUB = {
  id: 'tcgdex',
  defaultSource: 'tcgplayer',
  defaultCurrency: 'USD',
};
const cachedJson = new Map<string, string>();
const readCached = async (key: string): Promise<SharedCollectionDto | null> => {
  const json = cachedJson.get(key);
  return json ? JSON.parse(json) as SharedCollectionDto : null;
};
const writeCached = async (key: string, value: unknown, _ttl?: number): Promise<void> => {
  cachedJson.set(key, JSON.stringify(value));
};
const deleteCached = async (key: string): Promise<void> => { cachedJson.delete(key); };
const redisStub = {
  isAvailable: () => true,
  get: vi.fn(async () => null),
  getJson: vi.fn(readCached),
  set: vi.fn(async () => undefined),
  setJson: vi.fn(writeCached),
  del: vi.fn(deleteCached),
};

const addItem = (cardId: string, dto: Partial<AddItemDto> = {}): AddItemDto =>
  Object.assign(new AddItemDto(), { cardId }, dto);

const createShare = (dto: Partial<CreateShareDto> = {}): CreateShareDto =>
  Object.assign(new CreateShareDto(), dto);

const updateShare = (dto: Partial<UpdateShareDto>): UpdateShareDto =>
  Object.assign(new UpdateShareDto(), dto);

describe('ShareService', () => {
  const prismaClient = new PrismaClient();
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let service: ShareService;
  let collections: CollectionsService;
  let userA: string;
  let userB: string;
  let setId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [PublicShareController],
      providers: [
        ShareService,
        CollectionsService,
        { provide: PrismaService, useValue: prismaClient },
        { provide: PRICE_PROVIDER, useValue: PRICE_PROVIDER_STUB },
        // Caché en memoria: permite forzar hits/carreras sin tocar Redis real.
        { provide: RedisService, useValue: redisStub },
      ],
    }).compile();

    service = moduleRef.get(ShareService);
    collections = moduleRef.get(CollectionsService);
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await prismaClient.user.deleteMany({ where: { email: { in: [TEST_EMAIL_A, TEST_EMAIL_B] } } });
    await prismaClient.card.deleteMany({
      where: { id: { startsWith: TEST_CARD_PREFIX } },
    });
    await app.close();
    await prismaClient.$disconnect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    cachedJson.clear();
    redisStub.getJson.mockReset().mockImplementation(readCached);
    redisStub.setJson.mockReset().mockImplementation(writeCached);
    redisStub.del.mockReset().mockImplementation(deleteCached);
    await prismaClient.user.deleteMany({ where: { email: { in: [TEST_EMAIL_A, TEST_EMAIL_B] } } });
    await prismaClient.card.deleteMany({
      where: { id: { startsWith: TEST_CARD_PREFIX } },
    });

    userA = (await createUser(TEST_EMAIL_A, 'shareusera', 'Ada')).id;
    userB = (await createUser(TEST_EMAIL_B, 'shareuserb', 'Bob')).id;

    const set = await prismaClient.cardSet.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    expect(set).not.toBeNull();
    setId = set!.id;

    await prismaClient.card.create({
      data: {
        id: TEST_CARD_ID,
        name: 'Pikachu Share',
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
        id: TEST_CARD_2_ID,
        name: 'Bulbasaur Share',
        supertype: 'Pokémon',
        subtypes: [],
        types: ['Grass'],
        number: '2',
        rarity: 'Common',
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
        market: new Prisma.Decimal('10.00'),
        provider: 'tcgdex',
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function createUser(email: string, username: string, displayName: string) {
    return prismaClient.user.create({
      data: {
        email,
        username,
        passwordHash: 'fake-hash-not-used-in-these-tests',
        displayName,
      },
      select: { id: true },
    });
  }

  async function createCollection(userId: string, name: string) {
    return collections.create(
      userId,
      Object.assign(new CreateCollectionDto(), { name }),
    );
  }

  it('create devuelve un slug único y una url pública con ese slug', async () => {
    const link = await service.create(userA, createShare());

    expect(link.slug).toMatch(/^[a-z0-9]{10}$/);
    expect(link.url).toContain(link.slug);
    expect(link.collectionId).toBeNull();
    expect(link.collectionName).toBeNull();
    expect(link.isActive).toBe(true);
    expect(link.viewCount).toBe(0);
    expect(link.expiresAt).toBeNull();

    const row = await prismaClient.shareLink.findUniqueOrThrow({
      where: { slug: link.slug },
    });
    expect(row.userId).toBe(userA);
  });

  it('cinco links del mismo usuario tienen slugs distintos', async () => {
    const slugs: string[] = [];

    for (let i = 0; i < 5; i += 1) {
      const link = await service.create(userA, createShare());
      slugs.push(link.slug);
    }

    expect(new Set(slugs).size).toBe(5);

    const rows = await prismaClient.shareLink.count({ where: { userId: userA } });
    expect(rows).toBe(5);

    const listed = await service.listMine(userA);
    expect(listed).toHaveLength(5);
    expect(new Set(listed.map((l) => l.slug)).size).toBe(5);
  });

  it('create valida ownership de la colección y calcula expiresAt', async () => {
    const collection = await createCollection(userA, 'Para compartir');

    const link = await service.create(
      userA,
      createShare({ collectionId: collection.id, expiresInDays: 7 }),
    );
    expect(link.collectionId).toBe(collection.id);
    expect(link.collectionName).toBe('Para compartir');

    const days = link.expiresAt
      ? (new Date(link.expiresAt).getTime() - Date.now()) / 86_400_000
      : 0;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    // Colección de otro usuario → 404
    const foreign = await createCollection(userB, 'Privada');
    await expect(
      service.create(userA, createShare({ collectionId: foreign.id })),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.create(userA, createShare({ collectionId: 'no-existe' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ownership: userB no puede revocar ni actualizar el link de userA', async () => {
    const link = await service.create(userA, createShare());

    await expect(service.revoke(userB, link.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(userB, link.id, updateShare({ isActive: false })),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.revoke(userB, 'no-existe')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const untouched = await prismaClient.shareLink.findUniqueOrThrow({
      where: { id: link.id },
    });
    expect(untouched.isActive).toBe(true);
    expect(await service.listMine(userB)).toHaveLength(0);
  });

  it('revoke es idempotente y deja de exponer el link', async () => {
    const collection = await createCollection(userA, 'Deck');
    await collections.addItem(userA, collection.id, addItem(TEST_CARD_ID));
    const link = await service.create(userA, createShare({ collectionId: collection.id }));

    await service.revoke(userA, link.id);
    await service.revoke(userA, link.id); // segunda vez: no explota

    const row = await prismaClient.shareLink.findUniqueOrThrow({
      where: { id: link.id },
    });
    expect(row.isActive).toBe(false);

    await expect(service.getPublic(link.slug)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update cambia isActive y recalcula expiresAt', async () => {
    const link = await service.create(userA, createShare());

    const disabled = await service.update(
      userA,
      link.id,
      updateShare({ isActive: false }),
    );
    expect(disabled.isActive).toBe(false);

    const reactivated = await service.update(
      userA,
      link.id,
      updateShare({ isActive: true, expiresInDays: 30 }),
    );
    expect(reactivated.isActive).toBe(true);
    expect(reactivated.expiresAt).not.toBeNull();
  });

  it('getPublic devuelve items y stats, y NO filtra datos privados del usuario', async () => {
    const collection = await createCollection(userA, 'Mi binder');
    await collections.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_ID, { quantity: 2 }),
    );
    await collections.addItem(
      userA,
      collection.id,
      addItem(TEST_CARD_2_ID, { notes: 'nota privada' }),
    );

    const link = await service.create(
      userA,
      createShare({ collectionId: collection.id }),
    );
    const shared = await service.getPublic(link.slug);

    expect(shared.ownerDisplayName).toBe('Ada');
    expect(shared.collectionName).toBe('Mi binder');
    expect(shared.items).toHaveLength(2);
    expect(shared.truncated).toBe(false);
    expect(shared.sharedAt).toBe(link.createdAt);

    const pikachu = shared.items.find((i) => i.card.id === TEST_CARD_ID)!;
    expect(pikachu.card.name).toBe('Pikachu Share');
    expect(pikachu.card.set?.id).toBe(setId);
    expect(pikachu.quantity).toBe(2);
    expect(pikachu.price?.market).toBe(10);

    expect(shared.stats.totalCards).toBe(3); // 2 + 1
    expect(shared.stats.uniqueCards).toBe(2);
    expect(shared.stats.duplicateCards).toBe(1);
    expect(shared.stats.setsCount).toBe(1);
    expect(shared.stats.totalValueUsd).toBeCloseTo(20, 2); // 10 * 2
    expect(shared.stats.totalGroups).toBe(2);
    expect(shared.stats.pricedGroups).toBe(1);
    expect(shared.stats.cardsMissingPrice).toBe(1);
    expect(shared.stats.valuation.coverage.totalCopies).toBe(shared.stats.totalCards);
    expect(Object.keys(shared.items[0]!).sort()).toEqual(
      ['card', 'condition', 'price', 'quantity', 'variant'].sort(),
    );
    expect(Object.keys(pikachu.price!).sort()).toEqual(
      ['currency', 'evaluatedAt', 'fetchedAt', 'freshness', 'market', 'provider', 'source', 'upstreamFreshness', 'upstreamUpdatedAt'].sort(),
    );

    // ─── Evidencia explícita de no filtrar datos privados ───
    const serialized = JSON.stringify(shared);
    expect(serialized).not.toContain(TEST_EMAIL_A);
    expect(serialized).not.toContain('shareusera');
    expect(serialized).not.toContain(userA);
    expect(Object.keys(shared).sort()).toEqual(
      ['collectionName', 'items', 'ownerDisplayName', 'sharedAt', 'stats', 'truncated'].sort(),
    );

    // viewCount se incrementa en background
    await waitFor(async () => {
      const row = await prismaClient.shareLink.findUniqueOrThrow({
        where: { id: link.id },
        select: { viewCount: true },
      });
      return row.viewCount === 1;
    });
  });


  it('BE-04 usa un reloj para items y total, conserva caché evaluada y clasifica futuro sin rejuvenecer', async () => {
    const now = new Date('2026-10-08T12:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const collection = await createCollection(userA, 'Metadatos');
    await collections.addItem(userA, collection.id, addItem(TEST_CARD_ID, { quantity: 2 }));
    await collections.addItem(userA, collection.id, addItem(TEST_CARD_2_ID, { quantity: 3 }));
    await prismaClient.cardPrice.createMany({ data: [
      { cardId: TEST_CARD_ID, variant: 'normal', market: 0, provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', fetchedAt: now },
      { cardId: TEST_CARD_2_ID, variant: 'normal', market: 4, provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', fetchedAt: new Date(now.getTime() + 1) },
    ] });
    const link = await service.create(userA, createShare({ collectionId: collection.id }));
    const result = await service.getPublic(link.slug);
    expect(result.stats.valuation).toMatchObject({ amount: 12, evaluatedAt: now.toISOString(), coverage: { totalCopies: 5, pricedCopies: 5, unpricedCopies: 0, coverageRatio: 1 },
      recency: { freshness: 'mixed', freshCopies: 2, staleCopies: 0, unknownFreshnessCopies: 3, oldestFetchedAt: now.toISOString(), newestFetchedAt: now.toISOString() } });
    expect(result.items.every((item) => item.price?.evaluatedAt === result.stats.valuation.evaluatedAt)).toBe(true);
    expect(result.items.find((item) => item.card.id === TEST_CARD_2_ID)?.price?.freshness).toBe('unknown');
    expect(Object.keys(result.items[0]!.price!).sort()).toEqual(['currency', 'evaluatedAt', 'fetchedAt', 'freshness', 'market', 'provider', 'source', 'upstreamFreshness', 'upstreamUpdatedAt'].sort());
    vi.setSystemTime(new Date(now.getTime() + 86400000));
    const cached = await service.getPublic(link.slug);
    expect(cached.stats.valuation).toEqual(result.stats.valuation);
    expect(cached.items).toEqual(result.items);
  });

  it('getPublic de un slug inexistente o revocado da 404', async () => {
    await expect(service.getPublic('noexiste00')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const link = await service.create(userA, createShare());
    await service.revoke(userA, link.id);

    await expect(service.getPublic(link.slug)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getPublic(link.slug)).rejects.toThrow(
      'Este enlace no está disponible',
    );
  });

  it('valida vigencia antes del hit Redis y usa solo el namespace público versionado', async () => {
    const link = await service.create(userA, createShare());
    const activePayload = await service.getPublic(link.slug);
    expect(redisStub.getJson).toHaveBeenLastCalledWith(`share:public-v2:tcgdex:${link.slug}`);

    redisStub.getJson.mockResolvedValueOnce(activePayload);
    await expect(service.getPublic(link.slug)).resolves.toBe(activePayload);
    redisStub.del.mockRejectedValueOnce(new Error('Redis temporalmente caído'));
    await service.revoke(userA, link.id);
    const callsBefore = redisStub.getJson.mock.calls.length;
    await expect(service.getPublic(link.slug)).rejects.toBeInstanceOf(NotFoundException);
    expect(redisStub.getJson).toHaveBeenCalledTimes(callsBefore);
  });

  it('no lee payloads legacy privados y bloquea caché caliente tras desactivar aunque falle DEL', async () => {
    const collection = await createCollection(userA, 'Privacidad');
    await collections.addItem(userA, collection.id, addItem(TEST_CARD_ID, { notes: 'SECRETO-BE01' }));
    const link = await service.create(userA, createShare({ collectionId: collection.id }));
    const legacyKey = `share:tcgdex:${link.slug}`;
    cachedJson.set(legacyKey, JSON.stringify({ items: [{ notes: 'SECRETO-LEGACY', collectionId: collection.id }] }));
    const result = await service.getPublic(link.slug);
    expect(JSON.stringify(result)).not.toContain('SECRETO');
    expect(redisStub.getJson.mock.calls.map(([key]) => key)).toEqual([`share:public-v2:tcgdex:${link.slug}`]);
    expect(cachedJson.has(legacyKey)).toBe(true);
    expect(await service.getPublic(link.slug)).toEqual(result);
    redisStub.del.mockRejectedValueOnce(new Error('DEL falló'));
    await service.update(userA, link.id, updateShare({ isActive: false }));
    expect(cachedJson.has(`share:public-v2:tcgdex:${link.slug}`)).toBe(true);
    const callsBefore = redisStub.getJson.mock.calls.length;
    await expect(service.getPublic(link.slug)).rejects.toThrow('Este enlace no está disponible');
    expect(redisStub.getJson).toHaveBeenCalledTimes(callsBefore);
  });

  it('un SET tardío tras revocar no habilita una consulta pública nueva', async () => {
    const collection = await createCollection(userA, 'Carrera de caché');
    await collections.addItem(userA, collection.id, addItem(TEST_CARD_ID));
    const link = await service.create(userA, createShare({ collectionId: collection.id }));
    let signalReached!: () => void;
    let releaseRead!: () => void;
    const reachedRead = new Promise<void>((resolve) => { signalReached = resolve; });
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    redisStub.getJson.mockImplementationOnce(async () => {
      signalReached();
      await readGate;
      return null;
    });

    const inFlight = service.getPublic(link.slug);
    await reachedRead;
    await service.revoke(userA, link.id);
    releaseRead();
    await expect(inFlight).resolves.toMatchObject({ items: [{ card: { id: TEST_CARD_ID } }] });
    expect(cachedJson.has(`share:public-v2:tcgdex:${link.slug}`)).toBe(true);
    const readsBefore = redisStub.getJson.mock.calls.length;
    await expect(service.getPublic(link.slug)).rejects.toBeInstanceOf(NotFoundException);
    expect(redisStub.getJson).toHaveBeenCalledTimes(readsBefore);
  });

  it('getPublic de un link con expiresAt en el pasado da 404', async () => {
    const link = await service.create(userA, createShare({ expiresInDays: 1 }));
    await prismaClient.shareLink.update({
      where: { id: link.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await expect(service.getPublic(link.slug)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getPublic(link.slug)).rejects.toThrow(
      'Este enlace no está disponible',
    );
  });

  it('el borde expiresAt exacto también es no disponible aunque Redis esté caliente', async () => {
    const link = await service.create(userA, createShare());
    const now = new Date('2026-10-07T12:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    await service.getPublic(link.slug);
    await prismaClient.shareLink.update({ where: { id: link.id }, data: { expiresAt: new Date() } });
    const readsBefore = redisStub.getJson.mock.calls.length;
    await expect(service.getPublic(link.slug)).rejects.toBeInstanceOf(NotFoundException);
    expect(redisStub.getJson).toHaveBeenCalledTimes(readsBefore);
  });

  it('valor de referencia distingue scope vacío y grupos sin precio', async () => {
    const emptyLink = await service.create(userA, createShare());
    const empty = await service.getPublic(emptyLink.slug);
    expect(empty.stats).toMatchObject({ totalGroups: 0, totalValueUsd: 0, pricedGroups: 0, cardsMissingPrice: 0 });

    const collection = await createCollection(userA, 'Sin cotización');
    await collections.addItem(userA, collection.id, addItem(TEST_CARD_2_ID));
    const link = await service.create(userA, createShare({ collectionId: collection.id }));
    const populated = await service.getPublic(link.slug);
    expect(populated.stats).toMatchObject({ totalGroups: 1, totalValueUsd: null, pricedGroups: 0, cardsMissingPrice: 1 });
  });

  it('market cero es conocido y dos grupos iguales en colecciones distintas se conservan', async () => {
    const first = await createCollection(userA, 'Primera');
    const second = await createCollection(userA, 'Segunda');
    await collections.addItem(userA, first.id, addItem(TEST_CARD_2_ID));
    await collections.addItem(userA, second.id, addItem(TEST_CARD_2_ID, { quantity: 2 }));
    await prismaClient.cardPrice.createMany({ data: [
      { cardId: TEST_CARD_2_ID, variant: 'normal', market: new Prisma.Decimal(0), provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', fetchedAt: new Date('2026-01-01T00:00:00.000Z') },
      { cardId: TEST_CARD_2_ID, variant: 'normal', market: new Prisma.Decimal(99), provider: 'otro', source: 'tcgplayer', currency: 'USD', fetchedAt: new Date('2026-02-01T00:00:00.000Z') },
      { cardId: TEST_CARD_2_ID, variant: 'normal', market: new Prisma.Decimal(99), provider: 'tcgdex', source: 'otro', currency: 'USD', fetchedAt: new Date('2026-02-01T00:00:00.000Z') },
      { cardId: TEST_CARD_2_ID, variant: 'normal', market: new Prisma.Decimal(99), provider: 'tcgdex', source: 'tcgplayer', currency: 'ARS', fetchedAt: new Date('2026-02-01T00:00:00.000Z') },
    ] });
    const link = await service.create(userA, createShare());
    const result = await service.getPublic(link.slug);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.quantity).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(result.items.every((item) => item.card.id === TEST_CARD_2_ID && item.variant === 'normal' && item.condition === 'NM' && item.price?.market === 0)).toBe(true);
    expect(result.stats).toMatchObject({ totalGroups: 2, totalCards: 3, uniqueCards: 1, duplicateCards: 1, setsCount: 1, totalValueUsd: 0, pricedGroups: 2, cardsMissingPrice: 0,
      valuation: { amount: 0, coverage: { totalCopies: 3, pricedCopies: 3, unpricedCopies: 0, coverageRatio: 1 }, recency: { freshness: 'stale', staleCopies: 3, unknownFreshnessCopies: 0 } } });
  });

  it('agrega valor/cobertura fuera de los 500 visibles y preserva grupos idénticos entre colecciones', async () => {
    const collection = await createCollection(userA, 'Más de quinientos grupos');
    const second = await createCollection(userA, 'Mismo grupo');
    const foreign = await createCollection(userB, 'Fuera del alcance');
    const variants = ['normal', 'holofoil', 'reverseHolofoil', 'firstEditionNormal', 'firstEditionHolofoil', 'firstEdition', 'unlimited', 'unlimitedHolofoil'];
    const conditions = ['NM', 'LP', 'MP', 'HP', 'DM'];
    const ids = Array.from({ length: 13 }, (_, i) => `${TEST_CARD_PREFIX}bulk-${i}`);
    await prismaClient.card.createMany({
      data: ids.map((id) => ({
        id, name: 'Bulk card', supertype: 'Pokémon', subtypes: [], types: [], number: String(id),
        setId, imageSmall: 'https://example.test/bulk.png', imageLarge: 'https://example.test/bulk.png', rawJson: {},
      })),
    });
    await prismaClient.collectionItem.createMany({
      data: ids.flatMap((cardId) => variants.flatMap((variant) => conditions.map((condition) => ({
        collectionId: collection.id, cardId, variant, condition, quantity: 1, addedAt: new Date('2026-02-01T00:00:00.000Z'),
      })))),
    });
    await prismaClient.collectionItem.createMany({ data: [
      { collectionId: collection.id, cardId: TEST_CARD_ID, quantity: 3, addedAt: new Date('2026-01-01T00:00:00.000Z') },
      { collectionId: second.id, cardId: TEST_CARD_ID, quantity: 4, addedAt: new Date('2026-01-01T00:00:00.000Z') },
      { collectionId: collection.id, cardId: TEST_CARD_2_ID, quantity: 2, addedAt: new Date('2026-01-01T00:00:00.000Z') },
      { collectionId: foreign.id, cardId: TEST_CARD_ID, quantity: 99 },
    ] });
    await prismaClient.cardPrice.create({ data: {
      cardId: TEST_CARD_2_ID, variant: 'normal', market: new Prisma.Decimal(0), provider: 'tcgdex', source: 'tcgplayer', currency: 'USD',
    } });
    const link = await service.create(userA, createShare({ collectionId: collection.id }));
    const result = await service.getPublic(link.slug);
    expect(result.items).toHaveLength(500);
    expect(result.truncated).toBe(true);
    expect(result.items.every((item) => item.price === null)).toBe(true);
    expect(result.stats).toMatchObject({ totalGroups: 522, totalCards: 525, uniqueCards: 15, duplicateCards: 2, setsCount: 1, pricedGroups: 2, cardsMissingPrice: 520, totalValueUsd: 30,
      valuation: { coverage: { totalCopies: 525, pricedCopies: 5, unpricedCopies: 520 } } });
    const globalLink = await service.create(userA, createShare());
    const global = await service.getPublic(globalLink.slug);
    expect(global.stats).toMatchObject({ totalGroups: 523, totalCards: 529, uniqueCards: 15, duplicateCards: 3, setsCount: 1, pricedGroups: 3, cardsMissingPrice: 520, totalValueUsd: 70,
      valuation: { coverage: { totalCopies: 529, pricedCopies: 9, unpricedCopies: 520 } } });
    const smallLink = await service.create(userA, createShare({ collectionId: second.id }));
    expect((await service.getPublic(smallLink.slug)).items).toMatchObject([{ card: { id: TEST_CARD_ID }, variant: 'normal', condition: 'NM', quantity: 4 }]);
  });

  it('omite Redis SET si queda menos de un segundo de vigencia', async () => {
    const link = await service.create(userA, createShare());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'));
    await prismaClient.shareLink.update({
      where: { id: link.id },
      data: { expiresAt: new Date(Date.now() + 900) },
    });
    const before = redisStub.setJson.mock.calls.length;
    await service.getPublic(link.slug);
    expect(redisStub.setJson).toHaveBeenCalledTimes(before);
  });

  it('calcula TTL al escribir, con máximo 300, y no cachea si el enlace vence durante la lectura', async () => {
    const now = new Date('2026-10-07T12:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const unlimited = await service.create(userA, createShare());
    await service.getPublic(unlimited.slug);
    expect(redisStub.setJson).toHaveBeenLastCalledWith(`share:public-v2:tcgdex:${unlimited.slug}`, expect.any(Object), 300);

    const expiring = await service.create(userA, createShare());
    await prismaClient.shareLink.update({ where: { id: expiring.id }, data: { expiresAt: new Date(now.getTime() + 12_900) } });
    redisStub.getJson.mockImplementationOnce(async () => {
      vi.setSystemTime(now.getTime() + 1_200);
      return null;
    });
    await service.getPublic(expiring.slug);
    expect(redisStub.setJson).toHaveBeenLastCalledWith(`share:public-v2:tcgdex:${expiring.slug}`, expect.any(Object), 11);

    const duringLoad = await service.create(userA, createShare());
    await prismaClient.shareLink.update({ where: { id: duringLoad.id }, data: { expiresAt: new Date(now.getTime() + 2_000) } });
    redisStub.getJson.mockImplementationOnce(async () => {
      vi.setSystemTime(now.getTime() + 2_000);
      return null;
    });
    const writesBefore = redisStub.setJson.mock.calls.length;
    await expect(service.getPublic(duringLoad.slug)).resolves.toMatchObject({ items: [] });
    expect(redisStub.setJson).toHaveBeenCalledTimes(writesBefore);
    await expect(service.getPublic(duringLoad.slug)).rejects.toThrow('Este enlace no está disponible');
  });

  it('HTTP real devuelve no-store tanto en 200 como en 404 genérico con Redis caliente', async () => {
    const collection = await createCollection(userA, 'HTTP público');
    await collections.addItem(userA, collection.id, addItem(TEST_CARD_ID, { notes: 'SECRETO-HTTP' }));
    const link = await service.create(userA, createShare({ collectionId: collection.id }));
    const active = await fetch(`${baseUrl}/api/s/${link.slug}`);
    expect(active.status).toBe(200);
    expect(active.headers.get('cache-control')).toBe('no-store');
    const body = await active.json() as SharedCollectionDto;
    expect(body.items).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('SECRETO-HTTP');
    expect(cachedJson.has(`share:public-v2:tcgdex:${link.slug}`)).toBe(true);
    redisStub.del.mockRejectedValueOnce(new Error('DEL HTTP falló'));
    await service.revoke(userA, link.id);
    for (const slug of [link.slug, 'inexistente']) {
      const missing = await fetch(`${baseUrl}/api/s/${slug}`);
      expect(missing.status).toBe(404);
      expect(missing.headers.get('cache-control')).toBe('no-store');
      expect(await missing.json()).toMatchObject({ message: 'Este enlace no está disponible' });
    }
  });

  it('collectionId null agrega los items de TODAS las colecciones', async () => {
    const first = await createCollection(userA, 'Primera');
    const second = await createCollection(userA, 'Segunda');
    await collections.addItem(userA, first.id, addItem(TEST_CARD_ID));
    await collections.addItem(userA, second.id, addItem(TEST_CARD_2_ID));

    // Colección de otro usuario: NO tiene que aparecer.
    const foreign = await createCollection(userB, 'De Bob');
    await collections.addItem(userB, foreign.id, addItem(TEST_CARD_2_ID));

    const all = await service.create(userA, createShare());
    const shared = await service.getPublic(all.slug);

    expect(shared.collectionName).toBe('Todas las colecciones');
    expect(shared.items.map((i) => i.card.id).sort()).toEqual(
      [TEST_CARD_ID, TEST_CARD_2_ID].sort(),
    );
    expect(shared.stats.uniqueCards).toBe(2);
    expect(shared.stats.totalCards).toBe(2);

    // Con collectionId explícito solo entra esa colección.
    const onlyFirst = await service.create(
      userA,
      createShare({ collectionId: first.id }),
    );
    const scoped = await service.getPublic(onlyFirst.slug);
    expect(scoped.collectionName).toBe('Primera');
    expect(scoped.items).toHaveLength(1);
    expect(scoped.items[0]!.card.id).toBe(TEST_CARD_ID);
  });

  it('stats lista los links del usuario ordenados por viewCount', async () => {
    const low = await service.create(userA, createShare());
    const high = await service.create(userA, createShare());

    await service.getPublic(high.slug);
    await service.getPublic(high.slug);
    await waitFor(async () => {
      const row = await prismaClient.shareLink.findUniqueOrThrow({
        where: { id: high.id },
        select: { viewCount: true },
      });
      return row.viewCount === 2;
    });

    const stats = await service.stats(userA);
    expect(stats.map((s) => s.id)).toEqual([high.id, low.id]);
    expect(stats[0]!.viewCount).toBe(2);
    expect(stats[1]!.viewCount).toBe(0);
    expect(stats[0]!.url).toContain(high.slug);
    expect(await service.stats(userB)).toHaveLength(0);
  });
});

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('waitFor: la condición no se cumplió a tiempo');
}
