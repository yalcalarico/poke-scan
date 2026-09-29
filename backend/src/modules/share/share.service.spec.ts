import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import { RedisService } from '../../redis/index.js';
import { CollectionsService } from '../collections/collections.service.js';
import { AddItemDto } from '../collections/dto/add-item.dto.js';
import { CreateCollectionDto } from '../collections/dto/create-collection.dto.js';
import { CreateShareDto } from './dto/create-share.dto.js';
import { UpdateShareDto } from './dto/update-share.dto.js';
import { ShareService } from './share.service.js';

const TEST_CARD_PREFIX = 'test-share-';
const TEST_CARD_ID = `${TEST_CARD_PREFIX}primary`;
const TEST_CARD_2_ID = `${TEST_CARD_PREFIX}secondary`;
const TEST_EMAIL_A = 'share-user-a@test.local';
const TEST_EMAIL_B = 'share-user-b@test.local';

const addItem = (cardId: string, dto: Partial<AddItemDto> = {}): AddItemDto =>
  Object.assign(new AddItemDto(), { cardId }, dto);

const createShare = (dto: Partial<CreateShareDto> = {}): CreateShareDto =>
  Object.assign(new CreateShareDto(), dto);

const updateShare = (dto: Partial<UpdateShareDto>): UpdateShareDto =>
  Object.assign(new UpdateShareDto(), dto);

describe('ShareService', () => {
  const prismaClient = new PrismaClient();
  let moduleRef: TestingModule;
  let service: ShareService;
  let collections: CollectionsService;
  let userA: string;
  let userB: string;
  let setId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        ShareService,
        CollectionsService,
        { provide: PrismaService, useValue: prismaClient },
        // Sin Redis en los tests: el service tiene que degradar a "sin caché".
        {
          provide: RedisService,
          useValue: {
            isAvailable: () => false,
            get: async () => null,
            getJson: async () => null,
            set: async () => undefined,
            setJson: async () => undefined,
            del: async () => undefined,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ShareService);
    collections = moduleRef.get(CollectionsService);
  });

  afterAll(async () => {
    await prismaClient.card.deleteMany({
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
        source: 'test',
        currency: 'USD',
        fetchedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    });
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
    expect(shared.stats.totalValueArs).toBeNull();
    expect(shared.stats.cardsMissingPrice).toBe(1);

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
