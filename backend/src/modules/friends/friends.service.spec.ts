import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import { RedisService } from '../../redis/index.js';
import { CollectionsService } from '../collections/collections.service.js';
import { AddItemDto } from '../collections/dto/add-item.dto.js';
import { CreateCollectionDto } from '../collections/dto/create-collection.dto.js';
import { FriendCollectionQueryDto } from './dto/friend-collection-query.dto.js';
import { FriendRequestDto } from './dto/friend-request.dto.js';
import { SearchUsersDto } from './dto/search-users.dto.js';
import { FriendsService } from './friends.service.js';

const TEST_CARD_PREFIX = 'test-friends-';
const TEST_CARD_ID = `${TEST_CARD_PREFIX}primary`;
const TEST_CARD_2_ID = `${TEST_CARD_PREFIX}secondary`;

// Mismo patrón que share.service.spec.ts: los specs comparten la DB y borran
// los `@test.local` en su beforeEach.
const TEST_EMAIL_A = 'friends-user-a@test.local';
const TEST_EMAIL_B = 'friends-user-b@test.local';
const TEST_EMAIL_C = 'friends-user-c@test.local';

const searchDto = (dto: Partial<SearchUsersDto> = {}): SearchUsersDto =>
  Object.assign(new SearchUsersDto(), dto);

const requestDto = (username: string): FriendRequestDto =>
  Object.assign(new FriendRequestDto(), { username });

const collectionQuery = (
  dto: Partial<FriendCollectionQueryDto> = {},
): FriendCollectionQueryDto => Object.assign(new FriendCollectionQueryDto(), dto);

const addItem = (cardId: string, dto: Partial<AddItemDto> = {}): AddItemDto =>
  Object.assign(new AddItemDto(), { cardId }, dto);

describe('FriendsService', () => {
  const prismaClient = new PrismaClient();
  let moduleRef: TestingModule;
  let service: FriendsService;
  let collections: CollectionsService;
  let userA: string;
  let userB: string;
  let userC: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        FriendsService,
        CollectionsService,
        { provide: PrismaService, useValue: prismaClient },
        // Sin Redis en los tests: el service tiene que degradar a "sin caché".
        {
          provide: RedisService,
          useValue: {
            isAvailable: () => false,
            get: async () => null,
            getNumber: async () => null,
            getJson: async () => null,
            set: async () => undefined,
            setJson: async () => undefined,
            del: async () => undefined,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(FriendsService);
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

    userA = (await createUser(TEST_EMAIL_A, 'friendalpha', 'Ada Lovelace')).id;
    userB = (await createUser(TEST_EMAIL_B, 'friendbravo', 'Bob Marley')).id;
    userC = (await createUser(TEST_EMAIL_C, 'friendcharlie', 'Carla Rios')).id;

    const set = await prismaClient.cardSet.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    expect(set).not.toBeNull();
    const setId = set!.id;

    await prismaClient.card.create({
      data: {
        id: TEST_CARD_ID,
        name: 'Pikachu Friends',
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
        name: 'Bulbasaur Friends',
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
        market: new Prisma.Decimal('25.00'),
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
    return collections.create(userId, Object.assign(new CreateCollectionDto(), { name }));
  }

  async function makeFriends(requesterId: string, addresseeId: string): Promise<void> {
    const byUsername = await prismaClient.user.findUniqueOrThrow({
      where: { id: addresseeId },
      select: { username: true },
    });
    await service.sendRequest(requesterId, requestDto(byUsername.username));
    await service.respond(addresseeId, requesterId, true);
  }

  // ─── searchUsers ───

  it('searchUsers excluye al propio usuario y NO devuelve email ni passwordHash', async () => {
    const result = await service.searchUsers(userA, searchDto({ q: 'friend' }));

    const ids = result.data.map((u) => u.id);
    expect(ids).toContain(userB);
    expect(ids).toContain(userC);
    expect(ids).not.toContain(userA);

    // El select es explícito: ni email ni passwordHash pueden colarse.
    for (const user of result.data) {
      expect(Object.keys(user).sort()).toEqual([
        'avatarUrl',
        'displayName',
        'id',
        'relationship',
        'username',
      ]);
      expect(JSON.stringify(user)).not.toContain(TEST_EMAIL_A);
      expect(JSON.stringify(user)).not.toContain('@test.local');
      expect(JSON.stringify(user)).not.toContain('passwordHash');
    }
  });

  it('searchUsers matchea por username o displayName, case-insensitive, y pagina', async () => {
    const byDisplay = await service.searchUsers(userA, searchDto({ q: 'MARLEY' }));
    expect(byDisplay.data.map((u) => u.id)).toEqual([userB]);

    const byUsername = await service.searchUsers(userA, searchDto({ q: 'FRIENDCH' }));
    expect(byUsername.data.map((u) => u.id)).toEqual([userC]);

    const page1 = await service.searchUsers(userA, searchDto({ q: 'friend', pageSize: 1 }));
    expect(page1.data).toHaveLength(1);
    expect(page1.total).toBe(2);
    expect(page1.totalPages).toBe(2);

    const page2 = await service.searchUsers(
      userA,
      searchDto({ q: 'friend', pageSize: 1, page: 2 }),
    );
    expect(page2.data).toHaveLength(1);
    expect(page2.data[0]!.id).not.toBe(page1.data[0]!.id);
  });

  it('searchUsers exige mínimo 2 caracteres para no permitir enumerar usuarios', async () => {
    await expect(
      service.searchUsers(userA, searchDto({ q: 'a' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.searchUsers(userA, searchDto({ q: '' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.searchUsers(userA, searchDto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('searchUsers refleja el estado de la relación en `relationship`', async () => {
    const none = await service.searchUsers(userA, searchDto({ q: 'bravo' }));
    expect(none.data[0]!.relationship).toBe('none');

    await service.sendRequest(userA, requestDto('friendbravo'));
    const sent = await service.searchUsers(userA, searchDto({ q: 'bravo' }));
    expect(sent.data[0]!.relationship).toBe('pending_sent');

    // Desde la otra punta se ve la misma fila como "recibida".
    const received = await service.searchUsers(userB, searchDto({ q: 'alpha' }));
    expect(received.data[0]!.relationship).toBe('pending_received');

    await service.respond(userB, userA, true);
    const friends = await service.searchUsers(userA, searchDto({ q: 'bravo' }));
    expect(friends.data[0]!.relationship).toBe('friends');

    await service.block(userB, userA);
    const blocked = await service.searchUsers(userA, searchDto({ q: 'bravo' }));
    expect(blocked.data[0]!.relationship).toBe('blocked');
  });

  // ─── sendRequest ───

  it('sendRequest crea la solicitud en pending', async () => {
    const result = await service.sendRequest(userA, requestDto('friendbravo'));

    expect(result.status).toBe('pending');
    expect(result.requester.id).toBe(userA);
    expect(result.addressee.id).toBe(userB);
    expect(result.respondedAt).toBeNull();

    const row = await prismaClient.friendship.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(row.requesterId).toBe(userA);
    expect(row.addresseeId).toBe(userB);
    expect(row.status).toBe('pending');
  });

  it('sendRequest da 404 si el usuario no existe y 400 si es uno mismo', async () => {
    await expect(
      service.sendRequest(userA, requestDto('nosoejisto')),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.sendRequest(userA, requestDto('friendalpha')),
    ).rejects.toBeInstanceOf(BadRequestException);

    const count = await prismaClient.friendship.count();
    expect(count).toBe(0);
  });

  it('sendRequest da 409 si ya hay relación, y es idempotente si ya son amigos', async () => {
    await service.sendRequest(userA, requestDto('friendbravo'));
    await expect(
      service.sendRequest(userA, requestDto('friendbravo')),
    ).rejects.toBeInstanceOf(ConflictException);

    await service.respond(userB, userA, true);
    // Ya son amigos → devuelve la relación, no 409.
    const again = await service.sendRequest(userA, requestDto('friendbravo'));
    expect(again.status).toBe('accepted');

    // Y al revés tampoco duplica la fila.
    const reverse = await service.sendRequest(userB, requestDto('friendalpha'));
    expect(reverse.id).toBe(again.id);
    expect(await prismaClient.friendship.count()).toBe(1);
  });

  it('respond solo lo puede hacer el addressee', async () => {
    await service.sendRequest(userA, requestDto('friendbravo'));

    // El requester no puede responder su propia solicitud.
    await expect(service.respond(userA, userA, true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Un tercero que no es el addressee tampoco.
    await expect(service.respond(userC, userA, true)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    // Sigue pendiente: nadie la respondió.
    const row = await prismaClient.friendship.findFirstOrThrow({
      where: { requesterId: userA, addresseeId: userB },
    });
    expect(row.status).toBe('pending');

    const accepted = await service.respond(userB, userA, true);
    expect(accepted.status).toBe('accepted');
    expect(accepted.respondedAt).not.toBeNull();
  });

  it('respond con accept=false rechaza y deja el par sin amistad', async () => {
    await service.sendRequest(userA, requestDto('friendbravo'));
    const rejected = await service.respond(userB, userA, false);

    expect(rejected.status).toBe('rejected');
    expect(rejected.respondedAt).not.toBeNull();

    // No se puede volver a responder una solicitud ya respondida.
    await expect(service.respond(userB, userA, true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ─── Visibilidad de la colección ───

  it('no podés ver la colección si no son amigos', async () => {
    const collection = await createCollection(userB, 'Binder de Bob');
    await collections.addItem(userB, collection.id, addItem(TEST_CARD_ID));

    // Sin ninguna relación → 404.
    await expect(
      service.getFriendCollection(userA, userB),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Con solicitud pendiente → 403.
    await service.sendRequest(userA, requestDto('friendbravo'));
    await expect(
      service.getFriendCollection(userA, userB),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Tras aceptar, se puede.
    await service.respond(userB, userA, true);
    await expect(service.getFriendCollection(userA, userB)).resolves.toBeDefined();
  });

  it('no podés ver tu propia colección por la ruta de amigo', async () => {
    await expect(service.getFriendCollection(userA, userA)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('flujo completo: A pide → B acepta → A ve la colección de B', async () => {
    const collection = await createCollection(userB, 'Mi binder');
    await collections.addItem(
      userB,
      collection.id,
      addItem(TEST_CARD_ID, { quantity: 2 }),
    );
    await collections.addItem(userB, collection.id, addItem(TEST_CARD_2_ID));

    await service.sendRequest(userA, requestDto('friendbravo'));

    // B ve la solicitud pendiente en su lista.
    const pendingList = await service.list(userB);
    expect(pendingList.requestsReceived.map((r) => r.id)).toEqual([userA]);
    expect(pendingList.friends).toHaveLength(0);

    await service.respond(userB, userA, true);

    const visible = await service.getFriendCollection(userA, userB);

    // Mismo shape que el share público.
    expect(visible.ownerDisplayName).toBe('Bob Marley');
    expect(visible.collectionName).toBe('Mi binder');
    expect(visible.collectionId).toBe(collection.id);
    expect(visible.friend.id).toBe(userB);
    expect(visible.items).toHaveLength(2);
    expect(visible.truncated).toBe(false);

    const pikachu = visible.items.find((i) => i.card.id === TEST_CARD_ID)!;
    expect(pikachu.card.name).toBe('Pikachu Friends');
    expect(pikachu.quantity).toBe(2);
    expect(pikachu.price?.market).toBe(25);

    expect(visible.stats.totalCards).toBe(3);
    expect(visible.stats.uniqueCards).toBe(2);
    expect(visible.stats.duplicateCards).toBe(1);
    expect(visible.stats.totalValueUsd).toBeCloseTo(50, 2);
    expect(visible.stats.totalValueArs).toBeNull();
    expect(visible.stats.cardsMissingPrice).toBe(1);

    // No se filtran datos privados del amigo. El username SÍ va: a diferencia
    // del share público (anónimo), acá el cliente ya es un amigo accepted.
    const serialized = JSON.stringify(visible);
    expect(serialized).not.toContain(TEST_EMAIL_B);
    expect(serialized).not.toContain('passwordHash');
    expect(visible.friend.username).toBe('friendbravo');
  });

  it('getFriendCollection acepta collectionId y valida que sea del amigo', async () => {
    const first = await createCollection(userB, 'Primera');
    const second = await createCollection(userB, 'Segunda');
    await collections.addItem(userB, first.id, addItem(TEST_CARD_ID));
    await collections.addItem(userB, second.id, addItem(TEST_CARD_2_ID));
    await makeFriends(userA, userB);

    const scoped = await service.getFriendCollection(
      userA,
      userB,
      collectionQuery({ collectionId: second.id }),
    );
    expect(scoped.collectionName).toBe('Segunda');
    expect(scoped.items.map((i) => i.card.id)).toEqual([TEST_CARD_2_ID]);

    // Sin collectionId → la default (la primera creada).
    const fallback = await service.getFriendCollection(userA, userB);
    expect(fallback.collectionName).toBe('Primera');

    // Una colección de un tercero no se puede leer aunque seas amigos.
    const foreign = await createCollection(userC, 'De Carla');
    await expect(
      service.getFriendCollection(userA, userB, collectionQuery({ collectionId: foreign.id })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── list ───

  it('list devuelve amigos con friendsSince y resumen de colección, sin datos privados', async () => {
    const collection = await createCollection(userB, 'Colección de Bob');
    await collections.addItem(
      userB,
      collection.id,
      addItem(TEST_CARD_ID, { quantity: 3 }),
    );
    await makeFriends(userA, userB);

    const list = await service.list(userA);

    expect(list.requestsReceived).toHaveLength(0);
    expect(list.friends).toHaveLength(1);

    const friend = list.friends[0]!;
    expect(friend.id).toBe(userB);
    expect(friend.username).toBe('friendbravo');
    expect(friend.displayName).toBe('Bob Marley');
    expect(Date.parse(friend.friendsSince)).not.toBeNaN();

    // Resumen por agregación SQL: 3 copias a 25 USD.
    expect(friend.collectionSummary).toEqual({
      totalCards: 3,
      uniqueCards: 1,
      duplicateCards: 1,
      totalValueUsd: 75,
    });

    const serialized = JSON.stringify(list);
    expect(serialized).not.toContain(TEST_EMAIL_B);
    expect(serialized).not.toContain('passwordHash');
    expect(Object.keys(friend).sort()).toEqual([
      'avatarUrl',
      'collectionSummary',
      'displayName',
      'friendsSince',
      'id',
      'username',
    ]);
  });

  it('list funciona en ambos sentidos de la amistad', async () => {
    await makeFriends(userA, userB);

    const fromA = await service.list(userA);
    const fromB = await service.list(userB);
    expect(fromA.friends.map((f) => f.id)).toEqual([userB]);
    expect(fromB.friends.map((f) => f.id)).toEqual([userA]);
  });

  // ─── remove ───

  it('remove deja de ser amigo y la colección queda inaccesible', async () => {
    const collection = await createCollection(userB, 'Privada');
    await collections.addItem(userB, collection.id, addItem(TEST_CARD_ID));
    await makeFriends(userA, userB);

    await expect(service.getFriendCollection(userA, userB)).resolves.toBeDefined();

    await service.remove(userA, userB);

    expect((await service.list(userA)).friends).toHaveLength(0);
    await expect(service.getFriendCollection(userA, userB)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // Simétrico.
    await expect(service.getFriendCollection(userB, userA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('remove es idempotente y cancela solicitudes pendientes', async () => {
    await service.remove(userA, userB); // sin relación: no falla
    await expect(service.remove(userA, userB)).resolves.toBeUndefined();

    await service.sendRequest(userA, requestDto('friendbravo'));
    await service.remove(userA, userB);

    const row = await prismaClient.friendship.findFirstOrThrow({
      where: { requesterId: userA, addresseeId: userB },
    });
    expect(row.status).toBe('rejected');
    expect(row.respondedAt).not.toBeNull();

    // Un tercero no puede "cancelar" la solicitud de otro: la fila no es suya.
    await expect(service.remove(userC, userA)).resolves.toBeUndefined();
    expect(
      await prismaClient.friendship.findUnique({ where: { id: row.id } }),
    ).not.toBeNull();
  });

  // ─── block ───

  it('block impide que el bloqueado vuelva a solicitar y corta la amistad', async () => {
    await makeFriends(userA, userB);
    await service.getFriendCollection(userA, userB);

    await service.block(userB, userA);

    // B bloqueó a A → A ya no ve la colección.
    await expect(service.getFriendCollection(userA, userB)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect((await service.list(userA)).friends).toHaveLength(0);

    // A no puede volver a solicitarle a B: 404, no revela nada.
    await expect(
      service.sendRequest(userA, requestDto('friendbravo')),
    ).rejects.toBeInstanceOf(NotFoundException);

    // La búsqueda de B sí muestra el estado `blocked`.
    const search = await service.searchUsers(userB, searchDto({ q: 'alpha' }));
    expect(search.data[0]!.relationship).toBe('blocked');
  });

  it('block sin relación previa crea la fila y no podés bloquearte a vos mismo', async () => {
    await expect(service.block(userA, userA)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await service.block(userA, userC);

    const row = await prismaClient.friendship.findFirstOrThrow({
      where: { requesterId: userA, addresseeId: userC },
    });
    expect(row.status).toBe('blocked');

    // Ni A ni C pueden ya solicitarse.
    await expect(
      service.sendRequest(userC, requestDto('friendalpha')),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.sendRequest(userA, requestDto('friendcharlie')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
