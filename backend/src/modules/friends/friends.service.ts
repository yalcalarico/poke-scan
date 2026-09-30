import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { latestMarketPriceJoin } from '../../common/sql/latest-price.js';
import { PrismaService } from '../../prisma/index.js';
import { RedisService } from '../../redis/index.js';
import { PRICE_PROVIDER, type PriceProvider } from '../providers/card-provider.interface.js';
import type {
  CardDto,
  CollectionItemDto,
  CollectionStatsDto,
  PriceDto,
  SetDto,
} from '../collections/collections.service.js';
import { FriendCollectionQueryDto } from './dto/friend-collection-query.dto.js';
import { FriendRequestDto } from './dto/friend-request.dto.js';
import { SearchUsersDto } from './dto/search-users.dto.js';

// ─── Estados de la relación ───

export const PENDING = 'pending';
export const ACCEPTED = 'accepted';
export const REJECTED = 'rejected';
export const BLOCKED = 'blocked';

/**
 * `relationship` tal como lo ve quien|ga buscando.
 * `blocked` se colapsa en un solo valor: si un usuario bloqueó al otro, el par
 * no puede volver a solicitarse, así que alcanza con saber que está bloqueado.
 */
export type RelationshipState =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'friends'
  | 'blocked';

const ALL_COLLECTIONS_LABEL = 'Todas las colecciones';

// Búsqueda: 2 chars es el piso del DTO; se vuelve a aplicar acá para que el
// service sea seguro aunque se llame desde otro lado (tests, otro controller).
const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_RESULTS = 50;
const DEFAULT_PAGE_SIZE = 20;

// 5 min: un addition del amigo no se ve al instante, y la cache es siempre
// posterior al chequeo de autorización, así que nunca sirve datos a un
// ex-amigo (ver `assertFriendship`).
const FRIEND_CACHE_TTL_SECONDS = 5 * 60;
const MAX_FRIEND_ITEMS = 500;

const ITEM_INCLUDE = Prisma.validator<Prisma.CollectionItemInclude>()({
  card: { include: { set: true } },
});

type ItemWithCard = Prisma.CollectionItemGetPayload<{
  include: { card: { include: { set: true } } };
}>;

/**
 * Proyección pública de un usuario ajeno.
 *
 * No reutiliza `publicUserSelect` de UsersService a propósito: ese include
 * `email`, `preferredCurrency` y `preferredRateType`, que son datos de la
 * CUENTA, no de la identidad pública. Un email nunca debe salir por una
 * búsqueda de usuarios. `passwordHash` no aparece en ningún select del service.
 */
const FRIEND_PUBLIC_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const REQUEST_INCLUDE = {
  requester: { select: FRIEND_PUBLIC_SELECT },
  addressee: { select: FRIEND_PUBLIC_SELECT },
} satisfies Prisma.FriendshipInclude;

type FriendshipWithRefs = Prisma.FriendshipGetPayload<{
  include: typeof REQUEST_INCLUDE;
}>;

export interface UserSearchResultDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  relationship: RelationshipState;
}

export interface PaginatedUserSearch {
  data: UserSearchResultDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FriendIdentityDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface FriendRequestResultDto {
  id: string;
  requester: FriendIdentityDto;
  addressee: FriendIdentityDto;
  status: string;
  createdAt: string;
  respondedAt: string | null;
}

/** Resumen de la colección de un amigo, calculado con agregación SQL. */
export interface FriendCollectionSummaryDto {
  totalCards: number;
  uniqueCards: number;
  duplicateCards: number;
  totalValueUsd: number;
}

export interface FriendListItemDto extends FriendIdentityDto {
  friendsSince: string;
  collectionSummary: FriendCollectionSummaryDto;
}

export interface FriendsListDto {
  friends: FriendListItemDto[];
  requestsReceived: FriendIdentityDto[];
}

/**
 * Mismo shape que `GET /s/:slug` (SharedCollectionDto) para que el frontend
 * renderice la vista de amigo con el mismo componente que la pública.
 */
export interface FriendCollectionDto {
  friend: FriendIdentityDto;
  ownerDisplayName: string;
  collectionId: string | null;
  collectionName: string;
  items: CollectionItemDto[];
  stats: CollectionStatsDto;
  truncated: boolean;
  sharedAt: string;
}

interface LatestPriceRow {
  cardId: string;
  variant: string;
  low: Prisma.Decimal | null;
  mid: Prisma.Decimal | null;
  high: Prisma.Decimal | null;
  market: Prisma.Decimal | null;
  provider: string | null;
  currency: string;
  source: string;
  fetchedAt: Date;
}

interface SummaryRow {
  userId: string;
  totalCards: number;
  uniqueCards: number;
  duplicateCards: number;
  totalValueUsd: number;
}

interface PairRow {
  requesterId: string;
  addresseeId: string;
  status: string;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const numeric = Number(value as { toString(): string });
  return Number.isFinite(numeric) ? numeric : null;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function priceKey(cardId: string, variant: string): string {
  return `${cardId}::${variant}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(PRICE_PROVIDER) private readonly priceProvider: PriceProvider,
  ) {}

  // ─── Búsqueda de usuarios ───

  /**
   * Búsqueda parcial e insensible a mayúsculas sobre username y displayName,
   * apoyada en los índices trigram `users_username_trgm_idx` y
   * `users_display_name_trgm_idx`. Nunca incluye al solicitante ni ningún dato
   * privado: el select es explícito y no toca email ni passwordHash.
   */
  async searchUsers(
    requesterId: string,
    dto: SearchUsersDto,
  ): Promise<PaginatedUserSearch> {
    const q = (dto.q ?? '').trim();

    // Piso de 2 caracteres: sin esto, `?q=` sería un endpoint para enumerar
    // toda la base de usuarios.
    if (q.length < MIN_SEARCH_LENGTH) {
      throw new BadRequestException(
        `El término de búsqueda debe tener al menos ${MIN_SEARCH_LENGTH} caracteres`,
      );
    }

    const pageSize = Math.min(dto.pageSize ?? DEFAULT_PAGE_SIZE, MAX_SEARCH_RESULTS);
    const page = Math.max(dto.page ?? 1, 1);

    // `contains` + `insensitive` se traduce a ILIKE '%q%', que es lo que
    // aprovechan los índices GIN de pg_trgm.
    const where: Prisma.UserWhereInput = {
      id: { not: requesterId },
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: FRIEND_PUBLIC_SELECT,
        orderBy: [{ username: 'asc' }, { id: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    const relationships = await this.relationshipsFor(
      requesterId,
      rows.map((row) => row.id),
    );

    return {
      data: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
        relationship: relationships.get(row.id) ?? 'none',
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ─── Solicitudes ───

  /**
   * Envía una solicitud por username exacto.
   *
   * - 404 si el usuario no existe.
   * - 400 si el solicitante se busca a sí mismo.
   * - 409 si ya hay una relación en cualquier sentido y estado. La excepción
   *   es `accepted`: ahí se devuelve la relación tal cual (idempotente), porque
   *   "reenviarle a tu amigo" no es un error para el cliente.
   * - 404 (no 403) si el destinatario tiene bloqueado al solicitante: no se le
   *   revela la existencia del usuario a quien está bloqueado.
   */
  async sendRequest(
    requesterId: string,
    dto: FriendRequestDto,
  ): Promise<FriendRequestResultDto> {
    const addressee = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });

    if (!addressee) {
      throw new NotFoundException(`Usuario no encontrado: ${dto.username}`);
    }

    if (addressee.id === requesterId) {
      throw new BadRequestException('No podés enviarte una solicitud a vos mismo');
    }

    const existing = await this.findPair(requesterId, addressee.id);

    if (existing) {
      if (existing.status === ACCEPTED) {
        // Ya son amigos: devolver la relación es más útil que un 409.
        return this.toRequestResult(existing);
      }
      if (existing.status === BLOCKED) {
        throw new NotFoundException(`Usuario no encontrado: ${dto.username}`);
      }
      throw new ConflictException('Ya existe una relación con ese usuario');
    }

    return this.toRequestResult(await this.createPending(requesterId, addressee.id));
  }

  /**
   * Acepta o rechaza una solicitud pendiente. Solo el addressee puede
   * responder; el requester recibe 404 (no 403) para no confirmar que esa
   * solicitud existe.
   */
  async respond(
    userId: string,
    requesterId: string,
    accept: boolean,
  ): Promise<FriendRequestResultDto> {
    if (userId === requesterId) {
      throw new BadRequestException('No podés responder tu propia solicitud');
    }

    const pending = await this.prisma.friendship.findFirst({
      where: { requesterId, addresseeId: userId, status: PENDING },
      include: REQUEST_INCLUDE,
    });

    if (!pending) {
      throw new NotFoundException('No hay ninguna solicitud pendiente para responder');
    }

    const updated = await this.prisma.friendship.update({
      where: { id: pending.id },
      data: {
        status: accept ? ACCEPTED : REJECTED,
        respondedAt: new Date(),
      },
      include: REQUEST_INCLUDE,
    });

    // Aceptar habilita el endpoint de colección: lo que se haya cacheado del
    // otro lado ya no aplica.
    if (accept) {
      await this.invalidateFriendCaches(userId, requesterId);
    }

    return this.toRequestResult(updated);
  }

  // ─── Listado ───

  /**
   * `friends`: relaciones aceptadas en cualquier sentido.
   * `requestsReceived`: pendientes dirigidas a mí.
   *
   * `friendsSince` es `respondedAt` de la fila aceptada (cuándo se confirmó la
   * amistad). El resumen de colección sale de UNA agregación SQL agrupada por
   * `userId`, cacheada 5 min por amigo: no se consulta el provider de precios
   * ni se hace N+1.
   */
  async list(userId: string): Promise<FriendsListDto> {
    const [accepted, received] = await Promise.all([
      this.prisma.friendship.findMany({
        where: {
          status: ACCEPTED,
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
        include: REQUEST_INCLUDE,
        orderBy: [{ respondedAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.friendship.findMany({
        where: { addresseeId: userId, status: PENDING },
        include: REQUEST_INCLUDE,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const friends = accepted.map((row) => {
      const other = row.requesterId === userId ? row.addressee : row.requester;
      return {
        ...this.toIdentity(other),
        friendsSince: toIso(row.respondedAt ?? row.updatedAt ?? row.createdAt),
      };
    });

    const summaries = await this.summariesFor(friends.map((f) => f.id));

    return {
      friends: friends.map((friend) => ({
        ...friend,
        collectionSummary: summaries.get(friend.id) ?? {
          totalCards: 0,
          uniqueCards: 0,
          duplicateCards: 0,
          totalValueUsd: 0,
        },
      })),
      requestsReceived: received.map((row) => this.toIdentity(row.requester)),
    };
  }

  // ─── Colección de un amigo ───

  /**
   * Colección de un amigo, con el mismo shape que el share público. Solo
   * accesible si la relación está `accepted` en alguno de los dos sentidos; en
   * cualquier otro caso 403 (la relación existe pero no está aceptada) o 404
   * (no hay ninguna relación, así que no se confirma nada sobre el otro
   * usuario).
   *
   * El chequeo de amistad ocurre ANTES de leer la caché: por eso una amistad
   * dada de baja no puede quedar sirviendo datos por TTL.
   */
  async getFriendCollection(
    userId: string,
    friendId: string,
    dto: FriendCollectionQueryDto = {},
  ): Promise<FriendCollectionDto> {
    if (userId === friendId) {
      throw new BadRequestException('No podés ver tu propia colección por esta ruta');
    }

    const friend = await this.assertFriendship(userId, friendId);
    const collection = await this.resolveCollection(friend.id, dto.collectionId);
    const cacheKey = this.collectionCacheKey(userId, friend.id, collection?.id);

    const cached = await this.redis.getJson<FriendCollectionDto>(cacheKey);
    if (cached) return cached;

    const items = await this.loadFriendItems(friend.id, collection?.id);
    const prices = await this.fetchLatestPrices(
      items.map((item) => item.cardId),
      items.map((item) => item.variant),
    );
    const dtos = this.toItemDtos(items, prices);

    const payload: FriendCollectionDto = {
      friend,
      ownerDisplayName: friend.displayName,
      collectionId: collection?.id ?? null,
      collectionName: collection?.name ?? ALL_COLLECTIONS_LABEL,
      items: dtos,
      stats: this.aggregateStats(dtos),
      truncated: items.length > MAX_FRIEND_ITEMS,
      sharedAt: toIso(new Date()),
    };

    await this.redis.setJson(cacheKey, payload, FRIEND_CACHE_TTL_SECONDS);

    return payload;
  }

  // ─── Baja y bloqueo ───

  /**
   * Elimina la amistad. Si lo que existía era una solicitud pendiente, la pasa
   * a `rejected` en vez de borrarla, para que el par quede en un estado
   * terminal auditable. Es idempotente: si no hay relación, no falla.
   */
  async remove(userId: string, friendId: string): Promise<void> {
    if (userId === friendId) return;

    const existing = await this.findPair(userId, friendId);
    if (!existing) return;

    if (existing.status === PENDING) {
      await this.prisma.friendship.update({
        where: { id: existing.id },
        data: { status: REJECTED, respondedAt: new Date() },
      });
    } else {
      await this.prisma.friendship.delete({ where: { id: existing.id } });
    }

    await this.invalidateFriendCaches(userId, friendId);
  }

  /**
   * Bloquea a otro usuario.
   *
   * Semántica: `blocked` significa que ESE PAR no puede volver a solicitarse
   * hasta que uno de los dos lo desbloquee. Por eso el estado vive en la fila
   * del par (la que ya existe o se crea) en vez de una tabla aparte de blocks:
   * alcanza con que `findPair` lo encuentre en cualquiera de los dos sentidos.
   *
   * Si ya son amigos, bloquear termina la amistad y la colección deja de ser
   * visible. Si había una pendiente, se marca bloqueada.
   */
  async block(userId: string, otherId: string): Promise<void> {
    if (userId === otherId) {
      throw new BadRequestException('No podés bloquearte a vos mismo');
    }

    const existing = await this.findPair(userId, otherId);

    if (existing) {
      await this.prisma.friendship.update({
        where: { id: existing.id },
        data: { status: BLOCKED, respondedAt: new Date() },
      });
    } else {
      // La fila se crea con el bloqueador como requester para no violar el
      // @@unique(requesterId, addresseeId) duplicando el par invertido.
      await this.prisma.friendship.create({
        data: {
          requesterId: userId,
          addresseeId: otherId,
          status: BLOCKED,
          respondedAt: new Date(),
        },
      });
    }

    await this.invalidateFriendCaches(userId, otherId);
  }

  // ─── Internos ───

  /**
   * Estado de la relación `requesterId` → cada uno de `otherIds`, en una sola
   * query. La fila puede estar en cualquiera de los dos sentidos, así que se
   * consulta el par completo y se decide qué estado vale para el solicitante.
   */
  private async relationshipsFor(
    requesterId: string,
    otherIds: string[],
  ): Promise<Map<string, RelationshipState>> {
    const result = new Map<string, RelationshipState>();
    if (otherIds.length === 0) return result;

    const rows = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId, addresseeId: { in: otherIds } },
          { addresseeId: requesterId, requesterId: { in: otherIds } },
        ],
      },
      select: { requesterId: true, addresseeId: true, status: true },
    });

    for (const id of otherIds) {
      result.set(id, this.stateFor(requesterId, id, rows));
    }
    return result;
  }

  private stateFor(
    requesterId: string,
    otherId: string,
    rows: PairRow[],
  ): RelationshipState {
    const row = rows.find(
      (r) =>
        (r.requesterId === requesterId && r.addresseeId === otherId) ||
        (r.addresseeId === requesterId && r.requesterId === otherId),
    );

    if (!row) return 'none';
    if (row.status === BLOCKED) return 'blocked';
    if (row.status === ACCEPTED) return 'friends';
    if (row.status === PENDING) {
      return row.requesterId === requesterId ? 'pending_sent' : 'pending_received';
    }
    // rejected: el par puede volver a solicitarse, así que se ve como "none".
    return 'none';
  }

  /**
   * Busca la fila del par en ambos sentidos. El service mantiene una sola fila
   * por par, así que la que exista es la relación vigente.
   */
  private async findPair(
    userId: string,
    otherId: string,
  ): Promise<FriendshipWithRefs | null> {
    return this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: userId },
        ],
      },
      include: REQUEST_INCLUDE,
    });
  }

  private async createPending(
    requesterId: string,
    addresseeId: string,
  ): Promise<FriendshipWithRefs> {
    try {
      return await this.prisma.friendship.create({
        data: { requesterId, addresseeId, status: PENDING },
        include: REQUEST_INCLUDE,
      });
    } catch (error) {
      // Dos requests simultáneos al mismo usuario: el @@unique gana para uno.
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.findPair(requesterId, addresseeId);
      if (!winner) throw error;
      if (winner.status === BLOCKED) {
        throw new NotFoundException('Usuario no encontrado');
      }
      return winner;
    }
  }

  /**
   * 404 si no hay relación entre los dos, o si el par está bloqueado (un
   * bloqueo no debe dejar rastro: el bloqueado no puede ni confirmar que el
   * otro existe). 403 si la relación existe pero todavía no está aceptada
   * (solicitud pendiente o rechazada), para que el cliente pueda mostrar
   * "esperando respuesta" en vez de un error genérico.
   */
  private async assertFriendship(
    userId: string,
    friendId: string,
  ): Promise<FriendIdentityDto> {
    const friendship = await this.findPair(userId, friendId);

    if (!friendship || friendship.status === BLOCKED) {
      throw new NotFoundException('No sos amigo de ese usuario');
    }

    if (friendship.status !== ACCEPTED) {
      throw new ForbiddenException(
        'Necesitás ser amigo de ese usuario para ver su colección',
      );
    }

    return friendship.requesterId === userId
      ? this.toIdentity(friendship.addressee)
      : this.toIdentity(friendship.requester);
  }

  /**
   * Colección concreta del amigo, validando que le pertenezca. Sin
   * `collectionId`: la default, o la primera por orden de creación.
   */
  private async resolveCollection(
    friendId: string,
    collectionId?: string,
  ): Promise<{ id: string; name: string } | null> {
    if (collectionId) {
      const owned = await this.prisma.collection.findFirst({
        where: { id: collectionId, userId: friendId },
        select: { id: true, name: true },
      });
      if (!owned) {
        throw new NotFoundException('Colección no encontrada');
      }
      return owned;
    }

    return this.prisma.collection.findFirst({
      where: { userId: friendId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
  }

  private async loadFriendItems(
    friendId: string,
    collectionId?: string | null,
  ): Promise<ItemWithCard[]> {
    return this.prisma.collectionItem.findMany({
      where: collectionId ? { collectionId } : { collection: { userId: friendId } },
      include: ITEM_INCLUDE,
      orderBy: [{ addedAt: 'desc' }, { id: 'asc' }],
      // Un item de más para poder informar `truncated` sin contar todo.
      take: MAX_FRIEND_ITEMS + 1,
    });
  }

  /**
   * Resúmenes de varios amigos en UNA agregación, con cache de 5 min por
   * usuario. Usa **el mismo** join de precio que `CollectionsService`
   * (`latestMarketPriceJoin`): precio más reciente por variante, sin llamar al
   * provider de precios. Que sea literalmente el mismo fragmento es lo que
   * garantiza que el `totalValueUsd` de un amigo y el de su colección en
   * `/collections` no se separen cuando `card_prices` crece.
   */
  private async summariesFor(
    userIds: string[],
  ): Promise<Map<string, FriendCollectionSummaryDto>> {
    const result = new Map<string, FriendCollectionSummaryDto>();
    if (userIds.length === 0) return result;

    const misses: string[] = [];
    for (const id of userIds) {
      const cached = await this.redis.getJson<FriendCollectionSummaryDto>(
        `friends:summary:${this.priceProvider.id}:${id}`,
      );
      if (cached) {
        result.set(id, cached);
      } else {
        misses.push(id);
      }
    }

    if (misses.length === 0) return result;

    const rows = await this.prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
      SELECT
        col."userId" AS "userId",
        COALESCE(SUM(i.quantity), 0)::int AS "totalCards",
        COUNT(i.id)::int AS "uniqueCards",
        COUNT(i.id) FILTER (WHERE i.quantity > 1)::int AS "duplicateCards",
        COALESCE(SUM(i.quantity * lp.market), 0)::float8 AS "totalValueUsd"
      FROM collections col
      LEFT JOIN collection_items i ON i."collectionId" = col.id
      ${latestMarketPriceJoin(this.priceProvider)}
      WHERE col."userId" = ANY(${misses}::text[])
      GROUP BY col."userId"
    `);

    for (const row of rows) {
      const summary: FriendCollectionSummaryDto = {
        totalCards: Number(row.totalCards),
        uniqueCards: Number(row.uniqueCards),
        duplicateCards: Number(row.duplicateCards),
        totalValueUsd: round2(Number(row.totalValueUsd)),
      };
      result.set(row.userId, summary);
      await this.redis.setJson(
        `friends:summary:${this.priceProvider.id}:${row.userId}`,
        summary,
        FRIEND_CACHE_TTL_SECONDS,
      );
    }

    return result;
  }

  private collectionCacheKey(
    viewerId: string,
    friendId: string,
    collectionId?: string,
  ): string {
    return `friends:collection:${this.priceProvider.id}:${viewerId}:${friendId}:${collectionId ?? 'all'}`;
  }

  /**
   * Invalida lo que un cambio de relación dejó obsoleto. Las claves de
   * colección por `collectionId` concreto no se pueden enumerar con la API de
   * RedisService (no expone SCAN), así que se borran las de "todas" y el resto
   * vence solo a los 5 min. No es una fuga: la autorización se revalida en cada
   * request, antes de tocar la caché.
   */
  private async invalidateFriendCaches(
    userId: string,
    otherId: string,
  ): Promise<void> {
    await this.redis.del(
      `friends:summary:${userId}`,
      `friends:summary:${otherId}`,
      this.collectionCacheKey(userId, otherId),
      this.collectionCacheKey(otherId, userId),
    );
  }

  private async fetchLatestPrices(
    cardIds: string[],
    variants: string[],
  ): Promise<Map<string, PriceDto>> {
    const uniqueCardIds = [...new Set(cardIds)];
    if (uniqueCardIds.length === 0) return new Map();

    const variantSet = new Set(variants);
    const rows = await this.prisma.$queryRaw<LatestPriceRow[]>(Prisma.sql`
      SELECT DISTINCT ON (p."cardId", p.variant)
        p."cardId" AS "cardId",
        p.variant AS "variant",
        p.low,
        p.mid,
        p.high,
        p.market,
        p.provider,
        p.currency,
        p.source,
        p."fetchedAt" AS "fetchedAt"
      FROM card_prices p
      WHERE p."cardId" = ANY(${uniqueCardIds}::text[])
        AND p.provider = ${this.priceProvider.id}
        AND p.source = ${this.priceProvider.defaultSource}
        AND p.currency = ${this.priceProvider.defaultCurrency}
      ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
    `);

    const prices = new Map<string, PriceDto>();
    for (const row of rows) {
      if (variantSet.size > 0 && !variantSet.has(row.variant)) continue;
      prices.set(priceKey(row.cardId, row.variant), {
        cardId: row.cardId,
        variant: row.variant,
        low: toNumber(row.low),
        mid: toNumber(row.mid),
        high: toNumber(row.high),
        market: toNumber(row.market),
        provider: row.provider,
        currency: row.currency,
        source: row.source,
        fetchedAt: toIso(row.fetchedAt),
      });
    }
    return prices;
  }

  private aggregateStats(items: CollectionItemDto[]): CollectionStatsDto {
    let totalCards = 0;
    let duplicateCards = 0;
    let totalValueUsd = 0;
    let cardsMissingPrice = 0;
    const setIds = new Set<string>();
    const cardIds = new Set<string>();

    for (const item of items) {
      totalCards += item.quantity;
      if (item.quantity > 1) duplicateCards += 1;
      setIds.add(item.card.setId);
      cardIds.add(item.card.id);
      if (item.price?.market != null) {
        totalValueUsd += item.quantity * item.price.market;
      } else {
        cardsMissingPrice += 1;
      }
    }

    return {
      totalCards,
      uniqueCards: cardIds.size,
      duplicateCards,
      setsCount: setIds.size,
      totalValueUsd: round2(totalValueUsd),
      totalValueArs: null,
      cardsMissingPrice,
    };
  }

  // ─── Mappers ───

  private toIdentity(user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }): FriendIdentityDto {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
  }

  private toRequestResult(row: FriendshipWithRefs): FriendRequestResultDto {
    return {
      id: row.id,
      requester: this.toIdentity(row.requester),
      addressee: this.toIdentity(row.addressee),
      status: row.status,
      createdAt: toIso(row.createdAt),
      respondedAt: row.respondedAt ? toIso(row.respondedAt) : null,
    };
  }

  private toItemDtos(
    items: ItemWithCard[],
    prices: Map<string, PriceDto>,
  ): CollectionItemDto[] {
    return items.slice(0, MAX_FRIEND_ITEMS).map((item) => ({
      id: item.id,
      collectionId: item.collectionId,
      card: this.toCardDto(item),
      variant: item.variant,
      condition: item.condition,
      quantity: item.quantity,
      isForTrade: item.isForTrade,
      notes: item.notes,
      addedAt: toIso(item.addedAt),
      price: prices.get(priceKey(item.cardId, item.variant)) ?? null,
    }));
  }

  private toCardDto(item: ItemWithCard): CardDto {
    const { card } = item;
    const dto: CardDto = {
      id: card.id,
      name: card.name,
      supertype: card.supertype,
      subtypes: card.subtypes ?? [],
      hp: card.hp,
      types: card.types ?? [],
      number: card.number,
      rarity: card.rarity,
      artist: card.artist,
      setId: card.setId,
      imageSmall: card.imageSmall,
      imageLarge: card.imageLarge,
    };

    const set = card.set;
    if (set) {
      const setDto: SetDto = {
        id: set.id,
        name: set.name,
        series: set.series,
        printedTotal: set.printedTotal,
        total: set.total,
        releaseDate: set.releaseDate ? toIso(set.releaseDate) : null,
        logoUrl: set.logoUrl,
        symbolUrl: set.symbolUrl,
      };
      dto.set = setDto;
    }
    return dto;
  }
}
