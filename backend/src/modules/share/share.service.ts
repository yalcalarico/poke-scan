import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/index.js';
import { RedisService } from '../../redis/index.js';
import type {
  CardDto,
  CollectionItemDto,
  CollectionStatsDto,
  PriceDto,
  SetDto,
} from '../collections/collections.service.js';
import { CreateShareDto } from './dto/create-share.dto.js';
import { UpdateShareDto } from './dto/update-share.dto.js';

const LOG_TAG = 'ShareService';

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LENGTH = 10;
const SLUG_MAX_ATTEMPTS = 5;

const SHARE_CACHE_TTL_SECONDS = 5 * 60;
const MAX_PUBLIC_ITEMS = 500;

const ALL_COLLECTIONS_LABEL = 'Todas las colecciones';

const ITEM_INCLUDE = Prisma.validator<Prisma.CollectionItemInclude>()({
  card: { include: { set: true } },
});

const SHARE_INCLUDE = Prisma.validator<Prisma.ShareLinkInclude>()({
  user: { select: { displayName: true } },
  collection: { select: { name: true } },
});

type ItemWithCard = Prisma.CollectionItemGetPayload<{
  include: { card: { include: { set: true } } };
}>;

type ShareWithRefs = Prisma.ShareLinkGetPayload<{
  include: { user: { select: { displayName: true } }; collection: { select: { name: true } } };
}>;

interface LatestPriceRow {
  cardId: string;
  variant: string;
  low: Prisma.Decimal | null;
  mid: Prisma.Decimal | null;
  high: Prisma.Decimal | null;
  market: Prisma.Decimal | null;
  currency: string;
  source: string;
  fetchedAt: Date;
}

export interface ShareLinkDto {
  id: string;
  slug: string;
  url: string;
  collectionId: string | null;
  collectionName: string | null;
  isActive: boolean;
  viewCount: number;
  createdAt: string;
  expiresAt: string | null;
}

export interface SharedCollectionDto {
  ownerDisplayName: string;
  collectionName: string;
  items: CollectionItemDto[];
  stats: CollectionStatsDto;
  /** true si había más de MAX_PUBLIC_ITEMS items y se cortó la lista. */
  truncated: boolean;
  sharedAt: string;
}

export interface ShareViewStatsDto {
  id: string;
  slug: string;
  url: string;
  collectionId: string | null;
  collectionName: string | null;
  isActive: boolean;
  viewCount: number;
  createdAt: string;
  expiresAt: string | null;
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

function generateSlug(): string {
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    slug += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  }
  return slug;
}

function baseUrl(): string {
  const configured =
    process.env.SHARE_BASE_URL ??
    `http://localhost:${process.env.PORT ?? 3001}/api/s`;
  return configured.replace(/\/+$/, '');
}

function buildUrl(slug: string): string {
  return `${baseUrl()}/${slug}`;
}

function isExpired(expiresAt: Date | null): boolean {
  return expiresAt !== null && expiresAt.getTime() <= Date.now();
}

@Injectable()
export class ShareService {
  private readonly logger = new Logger(LOG_TAG);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ───-links privados ───

  async create(userId: string, dto: CreateShareDto): Promise<ShareLinkDto> {
    const collectionId = dto.collectionId?.trim() || undefined;

    if (collectionId) {
      const collection = await this.prisma.collection.findFirst({
        where: { id: collectionId, userId },
        select: { id: true },
      });
      if (!collection) {
        throw new NotFoundException(`Colección no encontrada: ${collectionId}`);
      }
    }

    const slug = await this.generateUniqueSlug();
    const expiresAt = this.expiresAtFromDays(dto.expiresInDays);

    const link = await this.prisma.shareLink.create({
      data: {
        userId,
        slug,
        ...(collectionId ? { collectionId } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      },
      include: SHARE_INCLUDE,
    });

    return this.toShareLinkDto(link);
  }

  async listMine(userId: string): Promise<ShareLinkDto[]> {
    const links = await this.prisma.shareLink.findMany({
      where: { userId },
      include: SHARE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return links.map((link) => this.toShareLinkDto(link));
  }

  async revoke(userId: string, id: string): Promise<void> {
    const link = await this.assertOwnership(userId, id);

    // Idempotente: revocar dos veces no falla ni cambia nada observable.
    await this.prisma.shareLink.updateMany({
      where: { id: link.id, isActive: true },
      data: { isActive: false },
    });
    await this.invalidateCache(link.slug);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateShareDto,
  ): Promise<ShareLinkDto> {
    const link = await this.assertOwnership(userId, id);

    const data: Prisma.ShareLinkUpdateInput = {};
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (dto.expiresInDays !== undefined) {
      data.expiresAt = this.expiresAtFromDays(dto.expiresInDays);
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.shareLink.update({ where: { id: link.id }, data });
      // isActive/expiresAt cambian qué se ve por la ruta pública.
      await this.invalidateCache(link.slug);
    }

    return this.toShareLinkDto(
      await this.prisma.shareLink.findUniqueOrThrow({
        where: { id: link.id },
        include: SHARE_INCLUDE,
      }),
    );
  }

  async stats(userId: string): Promise<ShareViewStatsDto[]> {
    const links = await this.prisma.shareLink.findMany({
      where: { userId },
      include: SHARE_INCLUDE,
      orderBy: [{ viewCount: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    return links.map((link) => this.toShareLinkDto(link));
  }

  // ─── Ruta pública ───

  async getPublic(slug: string): Promise<SharedCollectionDto> {
    const cacheKey = `share:${slug}`;

    const cached = await this.redis.getJson<SharedCollectionDto>(cacheKey);
    if (cached) {
      this.trackView(slug);
      return cached;
    }

    const link = await this.prisma.shareLink.findUnique({
      where: { slug },
      include: SHARE_INCLUDE,
    });

    if (!link || !link.isActive || isExpired(link.expiresAt)) {
      throw new NotFoundException('Este enlace no está disponible');
    }

    const items = await this.loadPublicItems(link);
    const prices = await this.fetchLatestPrices(
      items.map((item) => item.cardId),
      items.map((item) => item.variant),
    );
    const dtos = this.toItemDtos(items, prices);

    const payload: SharedCollectionDto = {
      ownerDisplayName: link.user.displayName,
      collectionName: link.collection?.name ?? ALL_COLLECTIONS_LABEL,
      items: dtos,
      stats: this.aggregateStats(dtos),
      truncated: items.length > MAX_PUBLIC_ITEMS,
      sharedAt: toIso(link.createdAt),
    };

    await this.redis.setJson(cacheKey, payload, SHARE_CACHE_TTL_SECONDS);
    this.trackView(slug);

    return payload;
  }

  // ─── Internos ───

  private async assertOwnership(
    userId: string,
    id: string,
  ): Promise<ShareWithRefs> {
    const link = await this.prisma.shareLink.findFirst({
      where: { id, userId },
      include: SHARE_INCLUDE,
    });
    if (!link) {
      throw new NotFoundException(`Enlace no encontrado: ${id}`);
    }
    return link;
  }

  private async generateUniqueSlug(): Promise<string> {
    for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt += 1) {
      const slug = generateSlug();
      const existing = await this.prisma.shareLink.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!existing) return slug;
      this.logger.warn(`Colisión de slug (intento ${attempt}), reintentando`);
    }
    // El unique de BD sigue protegiendo: esto solo evita el 500 en el caso límite.
    throw new NotFoundException(
      'No se pudo generar un enlace único, intentá de nuevo',
    );
  }

  private expiresAtFromDays(days?: number): Date | null {
    if (days === undefined) return null;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async invalidateCache(slug: string): Promise<void> {
    await this.redis.del(`share:${slug}`);
  }

  private trackView(slug: string): void {
    // No bloquea la respuesta ni carga la fila: updateMany atómico.
    void this.prisma.shareLink
      .updateMany({ where: { slug }, data: { viewCount: { increment: 1 } } })
      .catch((error: unknown) => {
        this.logger.warn(
          `No se pudo incrementar viewCount de ${slug}: ${(error as Error).message}`,
        );
      });
  }

  private async loadPublicItems(link: ShareWithRefs): Promise<ItemWithCard[]> {
    const where: Prisma.CollectionItemWhereInput = link.collectionId
      ? { collectionId: link.collectionId }
      : { collection: { userId: link.userId } };

    return this.prisma.collectionItem.findMany({
      where,
      include: ITEM_INCLUDE,
      orderBy: [{ addedAt: 'desc' }, { id: 'asc' }],
      // Un item de más para poder informar `truncated` sin contar todo.
      take: MAX_PUBLIC_ITEMS + 1,
    });
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
        p.currency,
        p.source,
        p."fetchedAt" AS "fetchedAt"
      FROM card_prices p
      WHERE p."cardId" = ANY(${uniqueCardIds}::text[])
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

  private toShareLinkDto(link: ShareWithRefs): ShareLinkDto {
    return {
      id: link.id,
      slug: link.slug,
      url: buildUrl(link.slug),
      collectionId: link.collectionId,
      collectionName: link.collection?.name ?? null,
      isActive: link.isActive,
      viewCount: link.viewCount,
      createdAt: toIso(link.createdAt),
      expiresAt: link.expiresAt ? toIso(link.expiresAt) : null,
    };
  }

  private toItemDtos(
    items: ItemWithCard[],
    prices: Map<string, PriceDto>,
  ): CollectionItemDto[] {
    return items
      .slice(0, MAX_PUBLIC_ITEMS)
      .map((item) => ({
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
