import { CollectionComparisonService } from '../../jobs/collection-comparison.service.js';
import { CollectionPriceRefreshService } from './collection-price-refresh.service.js';
import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { latestMarketPriceJoin } from '../../common/sql/latest-price.js';
import { priceMetadata, valuationFromCounts, type PriceMetadataDto, type ValueAggregateDto } from '../../common/price-metadata.js';
import { NUMERIC_CARD_NUMBER } from '../../common/sql/numeric-number.js';
import { SyncPricesService } from '../../jobs/sync-prices.service.js';
import { PriceSyncRegistryService } from '../../jobs/price-sync-registry.service.js';
import { PrismaService } from '../../prisma/index.js';
import { PRICE_PROVIDER, type PriceProvider } from '../providers/card-provider.interface.js';
import { type CardSortField } from '../cards/dto/search-cards.dto.js';
import { AddItemDto } from './dto/add-item.dto.js';
import { CreateCollectionDto } from './dto/create-collection.dto.js';
import { ListItemsDto } from './dto/list-items.dto.js';
import { UpdateCollectionDto } from './dto/update-collection.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';

const DEFAULT_COLLECTION_NAME = 'Mi colección';
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const ADD_OPERATION_REPLAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cuántas cartas entran en el mosaic de portada. 4 porque el collage del
 * cliente es una grilla de 2×2.
 */
const COVER_SIZE = 4;

/**
 * Proyección del `CollectionItemDto`, no `include: { card: { include: { set: true } } }`.
 * Ese include también traía `cards.rawJson` y `card_sets.rawJson` por cada fila;
 * no se serializan en el DTO y en una página repetían kilobytes de JSON histórico
 * que no hace falta leer para dibujar una carta.
 */
const ITEM_SELECT = Prisma.validator<Prisma.CollectionItemSelect>()({
  id: true,
  collectionId: true,
  cardId: true,
  variant: true,
  condition: true,
  quantity: true,
  isForTrade: true,
  notes: true,
  addedAt: true,
  card: {
    select: {
      id: true,
      name: true,
      supertype: true,
      subtypes: true,
      hp: true,
      types: true,
      number: true,
      rarity: true,
      artist: true,
      setId: true,
      imageSmall: true,
      imageLarge: true,
      set: {
        select: {
          id: true,
          name: true,
          series: true,
          printedTotal: true,
          total: true,
          releaseDate: true,
          logoUrl: true,
          symbolUrl: true,
        },
      },
    },
  },
});

type ItemWithCard = Prisma.CollectionItemGetPayload<{ select: typeof ITEM_SELECT }>;

export interface SetDto {
  id: string;
  name: string;
  series: string | null;
  printedTotal: number | null;
  total: number | null;
  releaseDate: string | null;
  logoUrl: string | null;
  symbolUrl: string | null;
}

export interface CardDto {
  id: string;
  name: string;
  supertype: string;
  subtypes: string[];
  hp: string | null;
  types: string[];
  number: string;
  rarity: string | null;
  artist: string | null;
  setId: string;
  set?: SetDto;
  imageSmall: string;
  imageLarge: string;
}

export interface PriceDto {
  cardId: string;
  variant: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  provider: string | null;
  currency: string;
  source: string;
  fetchedAt: string;
  evaluatedAt?: string;
  freshness?: PriceMetadataDto['freshness'];
  upstreamUpdatedAt?: string | null;
  upstreamFreshness?: PriceMetadataDto['upstreamFreshness'];
}

/** Una miniatura del mosaic de portada de `CollectionDto`. */
export interface CollectionCoverItem {
  cardId: string;
  imageSmall: string;
}

export interface CollectionDto {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  itemCount: number;
  uniqueCount: number;
  duplicateCount: number;
  totalValueUsd: number;
  valuation: ValueAggregateDto;
  totalValueArs: number | null;
  /**
   * Hasta `COVER_SIZE` cartas para el collage de portada. **Nunca `undefined`**:
   * el cliente pinta una superficie de marca cuando el array viene vacío, así
   * que un endpoint que se olvide del campo no rompe la grilla, pero sí la
   * deja sin mosaico. Siempre es `[]` en una colección sin items.
   */
  cover: CollectionCoverItem[];
  createdAt: string;
}

export interface CollectionItemDto {
  id: string;
  collectionId: string;
  card: CardDto;
  variant: string;
  condition: string;
  quantity: number;
  isForTrade: boolean;
  notes: string | null;
  addedAt: string;
  price: PriceDto | null;
}

export interface CollectionStatsDto {
  totalCards: number;
  uniqueCards: number;
  duplicateCards: number;
  setsCount: number;
  totalValueUsd: number;
  totalValueArs: number | null;
  cardsMissingPrice: number;
  valuation?: ValueAggregateDto;
}

/**
 * `GET /cards/:id/location`: **dónde** está esta carta del usuario.
 *
 * Es `null` (no 404) cuando el usuario no la tiene en ninguna colección: la carta
 * existe en el catálogo y el usuario simplemente no la posee, que son dos hechos
 * distintos y el cliente los dibuja distinto. El 404 queda reservado para un
 * `cardId` que no existe.
 */
export interface CardLocationDto {
  collectionId: string;
  collectionName: string;
  itemId: string;
  quantity: number;
  variant: string;
  condition: string;
}

/**
 * Una fila de `GET /collections/:id/set-progress` (B7).
 *
 * Sin `SetDto`: el nombre, el símbolo y el logo los junta el cliente con el
 * `GET /sets` que ya existe (176 sets, una request), así que este endpoint es
 * un único `$queryRaw` de números y no un cuarto lugar donde vive el metadata
 * de un set.
 */
export interface SetProgressDto {
  setId: string;
  /** Cartas **únicas** (`COUNT(DISTINCT cardId)`), no `SUM(quantity)`. */
  owned: number;
  /** `card_sets.total ?? card_sets.printedTotal ?? 0`. */
  total: number;
  /** `SUM(quantity × market)` con el precio de la variante de cada item. */
  valueUsd: number;
  /** Siempre `null`, igual que `CollectionStatsDto.totalValueArs`. */
  valueArs: number | null;
  /** `GREATEST(total - owned, 0)`, ya calculado en SQL. */
  missingCount: number;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CollectionAggregateRow {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  itemCount: number;
  uniqueCount: number;
  duplicateCount: number;
  totalValueUsd: number;
  pricedCopies: number;
  freshCopies: number;
  staleCopies: number;
  unknownFreshnessCopies: number;
  oldestFetchedAt: Date | null;
  newestFetchedAt: Date | null;
  evaluatedAt: Date;
}

interface StatsRow {
  totalCards: number;
  uniqueCards: number;
  duplicateCards: number;
  setsCount: number;
  totalValueUsd: number;
  cardsMissingPrice: number;
  pricedCopies: number;
  freshCopies: number;
  staleCopies: number;
  unknownFreshnessCopies: number;
  oldestFetchedAt: Date | null;
  newestFetchedAt: Date | null;
  evaluatedAt: Date;
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

interface CoverRow {
  collectionId: string;
  cardId: string;
  imageSmall: string;
}

interface SetProgressRow {
  setId: string;
  owned: number;
  total: number;
  valueUsd: number;
  missingCount: number;
}

/** Una fila de `orderedItemIds`: el id del item ya en su posición final. */
interface ItemOrderRow {
  id: string;
}

/** Una fila de `findCardLocation`. */
interface CardLocationRow {
  collectionId: string;
  collectionName: string;
  itemId: string;
  quantity: number;
  variant: string;
  condition: string;
}

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

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
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Escapa los comodines de un `LIKE`/`ILIKE` para que un `%` en el texto busque
 * un `%` y no matchee todo. Es la misma regla que usa `escapeLike` en
 * `cards.service.ts`.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRICE_PROVIDER) private readonly priceProvider: PriceProvider,
    /** Opcional: los tests unitarios lo construyen sin el job de precios. */
    @Optional() private readonly syncPrices?: SyncPricesService,
    @Optional() private readonly comparisonSnapshots?: CollectionComparisonService,
    @Optional() private readonly priceRefresh?: CollectionPriceRefreshService,
    @Optional() private readonly priceSyncRegistry?: PriceSyncRegistryService,
  ) {}

  /** Verifica ownership y devuelve la colección, o 404. */
  private async assertOwned(userId: string, collectionId: string): Promise<void> {
    const found = await this.prisma.collection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(`Colección no encontrada: ${collectionId}`);
  }

  // ─── Colecciones ───

  async create(userId: string, dto: CreateCollectionDto): Promise<CollectionDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.collection.count({ where: { userId } });
      const isFirst = existing === 0;
      // La primera colección del usuario siempre es la default.
      const isDefault = isFirst || dto.isDefault === true;

      if (isDefault) {
        await tx.collection.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.collection.create({
        data: { userId, name: dto.name.trim(), isDefault },
      });

      return this.toCollectionDto(
        created,
        {
          itemCount: 0,
          uniqueCount: 0,
          duplicateCount: 0,
          totalValueUsd: 0,
        },
        // Recién creada: no hay items, no hay mosaico. Encender una query acá
        // para devolver `[]` sería trabajo gratis todos los días.
        [],
      );
    });
    await this.captureComparison(userId);
    return result;
  }

  async list(userId: string): Promise<CollectionDto[]> {
    await this.ensureDefaultCollection(userId);
    await this.priceRefresh?.enqueueOnRead(userId);
    const filter = Prisma.sql`WHERE col."userId" = ${userId}`;
    // Dos queries fijas (agregados + portada), no una por colección: el número
    // de consultas no depende de cuántas colecciones tenga el usuario.
    const [rows, covers] = await Promise.all([
      this.aggregateQuery(filter),
      this.loadCovers(this.prisma, filter),
    ]);
    return rows.map((row) => this.toCollectionDto(row, row, covers.get(row.id) ?? []));
  }

  async findOne(userId: string, id: string): Promise<CollectionDto> {
    const existing = await this.prisma.collection.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Colección no encontrada: ${id}`);
    }

    await this.priceRefresh?.enqueueOnRead(userId, id);

    const filter = Prisma.sql`WHERE col."userId" = ${userId} AND col.id = ${id}`;
    const [rows, covers] = await Promise.all([
      this.aggregateQuery(filter),
      this.loadCovers(this.prisma, filter),
    ]);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Colección no encontrada: ${id}`);
    }
    return this.toCollectionDto(row, row, covers.get(row.id) ?? []);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCollectionDto,
  ): Promise<CollectionDto> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.collection.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException(`Colección no encontrada: ${id}`);
      }

      if (dto.isDefault === true) {
        await tx.collection.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }

      const data: Prisma.CollectionUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;

      if (Object.keys(data).length > 0) {
        await tx.collection.update({ where: { id }, data });
      }
    });

    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.collection.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Colección no encontrada: ${id}`);
    }
    await this.prisma.collection.delete({ where: { id } });
    await this.captureComparison(userId);
  }

  // ─── Items ───

  async listItems(
    userId: string,
    collectionId: string,
    dto: ListItemsDto,
  ): Promise<Paginated<CollectionItemDto>> {
    await this.assertCollectionOwnership(userId, collectionId);

    const page = dto.page ?? DEFAULT_PAGE;
    const pageSize = dto.pageSize ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const { items, total } = await this.itemsForPage(collectionId, dto, pageSize, offset);

    const prices = await this.fetchLatestPrices(
      this.prisma,
      items.map((item) => item.cardId),
      items.map((item) => item.variant),
    );

    return {
      data: this.toItemDtos(items, prices),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async addItem(
    userId: string,
    collectionId: string,
    dto: AddItemDto,
    idempotencyKey?: string,
  ): Promise<CollectionItemDto> {
    if (idempotencyKey !== undefined) {
      return this.addItemIdempotently(
        userId,
        collectionId,
        dto,
        idempotencyKey.toLowerCase(),
      );
    }
    const item = await this.prisma.$transaction(async (tx) => {
      await this.assertAddTarget(tx, userId, collectionId, dto.cardId);
      return this.incrementItem(tx, collectionId, dto);
    });
    await this.captureComparison(userId);
    return this.confirmAddedItem(item);
  }

  private async assertAddTarget(
    tx: Prisma.TransactionClient,
    userId: string,
    collectionId: string,
    cardId: string,
  ): Promise<void> {
    const collection = await tx.collection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!collection)
      throw new NotFoundException(`Colección no encontrada: ${collectionId}`);
    const card = await tx.card.findUnique({
      where: { id: cardId },
      select: { id: true },
    });
    if (!card) throw new NotFoundException(`Carta no encontrada: ${cardId}`);
  }

  private async incrementItem(
    tx: Prisma.TransactionClient,
    collectionId: string,
    dto: AddItemDto,
  ): Promise<ItemWithCard> {
    // Un P2002 aborta la transacción PostgreSQL. ON CONFLICT resuelve la carrera
    // sin consultas posteriores a una transacción fallida ni incrementos perdidos.
    const [saved] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO collection_items
        (id, "collectionId", "cardId", variant, condition, quantity,
         "isForTrade", notes, "addedAt", "updatedAt")
      VALUES (${randomUUID()}, ${collectionId}, ${dto.cardId},
              ${dto.variant ?? 'normal'}, ${dto.condition ?? 'NM'}, ${dto.quantity ?? 1},
              ${dto.isForTrade ?? false}, ${dto.notes ?? null}, NOW(), NOW())
      ON CONFLICT ("collectionId", "cardId", variant, condition)
      DO UPDATE SET quantity = collection_items.quantity + EXCLUDED.quantity,
                    "isForTrade" = collection_items."isForTrade" OR EXCLUDED."isForTrade",
                    "updatedAt" = NOW()
      RETURNING id
    `;
    return tx.collectionItem.findUniqueOrThrow({
      where: { id: saved.id },
      select: ITEM_SELECT,
    });
  }

  private async confirmAddedItem(
    item: ItemWithCard,
  ): Promise<CollectionItemDto> {
    try {
      await this.priceSyncRegistry?.enableForCollection(item.card.setId);
    } catch {
      this.logger.warn('No se pudo registrar la demanda diaria del set; se recuperará en la reconciliación');
    }
    // La escritura ya está confirmada: un precio opcional no puede convertirla
    // en error ni obligar al cliente antiguo a sumar otra vez para reintentarlo.
    try {
      this.syncPrices?.enqueueRefresh(item.cardId);
    } catch {
      this.logger.warn('No se pudo encolar el precio del ítem confirmado');
    }
    try {
      const prices = await this.fetchLatestPrices(
        this.prisma,
        [item.cardId],
        [item.variant],
      );
      return this.toItemDto(
        item,
        prices.get(priceKey(item.cardId, item.variant)) ?? null,
      );
    } catch {
      this.logger.warn('No se pudo consultar el precio del ítem confirmado');
      return this.toItemDto(item, null);
    }
  }

  private async addItemIdempotently(
    userId: string,
    collectionId: string,
    dto: AddItemDto,
    key: string,
  ): Promise<CollectionItemDto> {
    const variant = dto.variant ?? 'normal';
    const condition = dto.condition ?? 'NM';
    const quantity = dto.quantity ?? 1;
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          collectionId,
          cardId: dto.cardId,
          variant,
          condition,
          quantity,
          notes: dto.notes ?? null,
          isForTrade: dto.isForTrade ?? null,
        }),
      )
      .digest('hex');

    const replay = async (): Promise<ItemWithCard> => {
      const operation = await this.prisma.collectionItemAddOperation.findUnique(
        {
          where: { userId_key: { userId, key } },
        },
      );
      if (!operation)
        throw new ConflictException(
          'La operación está en curso; repetí la misma solicitud',
        );
      if (operation.payloadHash !== payloadHash) {
        throw new ConflictException('La clave ya se usó con otros datos');
      }
      if (operation.expiresAt <= new Date()) {
        await this.prisma.collectionItemAddOperation.update({
          where: { userId_key: { userId, key } },
          data: { resultItemId: null },
        });
        throw new GoneException(
          'Venció el período de reintento seguro; no se volvió a sumar la carta',
        );
      }
      if (!operation.resultItemId) {
        throw new ConflictException(
          'La operación todavía no tiene una respuesta confirmada',
        );
      }
      const item = await this.prisma.collectionItem.findFirst({
        where: {
          id: operation.resultItemId,
          collection: { id: collectionId, userId },
        },
        select: ITEM_SELECT,
      });
      if (!item) {
        throw new GoneException(
          'La operación se confirmó, pero el ítem ya no está en la colección',
        );
      }
      return item;
    };

    let item: ItemWithCard;
    try {
      item = await this.prisma.$transaction(async (tx) => {
        const collection = await tx.collection.findFirst({
          where: { id: collectionId, userId },
          select: { id: true },
        });
        if (!collection)
          throw new NotFoundException(
            `Colección no encontrada: ${collectionId}`,
          );
        await tx.collectionItemAddOperation.create({
          data: {
            userId,
            key,
            payloadHash,
            expiresAt: new Date(Date.now() + ADD_OPERATION_REPLAY_WINDOW_MS),
          },
        });
        const card = await tx.card.findUnique({
          where: { id: dto.cardId },
          select: { id: true },
        });
        if (!card)
          throw new NotFoundException(`Carta no encontrada: ${dto.cardId}`);
        const saved = await this.incrementItem(tx, collectionId, dto);
        await tx.collectionItemAddOperation.update({
          where: { userId_key: { userId, key } },
          data: { resultItemId: saved.id },
        });
        return saved;
      });
    } catch (error) {
      // La colisión de clave se resuelve fuera de la transacción abortada.
      if (!isUniqueViolation(error)) throw error;
      await this.assertOwned(userId, collectionId);
      item = await replay();
    }
    await this.captureComparison(userId);
    return this.confirmAddedItem(item);
  }

  /**
   * Solicita referencias faltantes o vencidas de las variantes del inventario.
   * Devuelve sólo los trabajos insertados o reactivados de forma durable.
   */
  async enqueueMissingPrices(userId: string, collectionId: string): Promise<number> {
    await this.assertOwned(userId, collectionId);
    return this.priceRefresh?.enqueue(userId, collectionId) ?? 0;
  }

  async updateItem(
    userId: string,
    itemId: string,
    dto: UpdateItemDto,
  ): Promise<CollectionItemDto> {
    const existing = await this.findOwnedItem(userId, itemId);

    const variant = dto.variant ?? existing.variant;
    const condition = dto.condition ?? existing.condition;

    if (variant !== existing.variant || condition !== existing.condition) {
      const conflict = await this.prisma.collectionItem.findFirst({
        where: {
          collectionId: existing.collectionId,
          cardId: existing.cardId,
          variant,
          condition,
          NOT: { id: itemId },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException(
          'Ya existe un item con esa misma variante y condición en la colección',
        );
      }
    }

    const data: Prisma.CollectionItemUpdateInput = {};
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.isForTrade !== undefined) data.isForTrade = dto.isForTrade;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.variant !== undefined) data.variant = dto.variant;
    if (dto.condition !== undefined) data.condition = dto.condition;

    let item: ItemWithCard;
    try {
      item = await this.prisma.collectionItem.update({
        where: { id: itemId },
        data,
        select: ITEM_SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe un item con esa misma variante y condición en la colección',
        );
      }
      throw error;
    }

    await this.captureComparison(userId);
    return this.toItemDto(
      item,
      await this.fetchLatestPrices(
        this.prisma,
        [item.cardId],
        [item.variant],
      ).then((prices) => prices.get(priceKey(item.cardId, item.variant)) ?? null),
    );
  }

  async removeItem(userId: string, itemId: string): Promise<void> {
    await this.findOwnedItem(userId, itemId);
    await this.prisma.collectionItem.delete({ where: { id: itemId } });
    await this.captureComparison(userId);
  }

  private async captureComparison(userId: string): Promise<void> {
    try { await this.comparisonSnapshots?.capture(userId); }
    catch { this.logger.warn('No se pudo actualizar el punto provisional de comparación'); }
  }

  async getDuplicates(
    userId: string,
    collectionId: string,
  ): Promise<CollectionItemDto[]> {
    await this.assertCollectionOwnership(userId, collectionId);

    const items = await this.prisma.collectionItem.findMany({
      where: { collectionId, quantity: { gt: 1 } },
      select: ITEM_SELECT,
    });

    const prices = await this.fetchLatestPrices(
      this.prisma,
      items.map((item) => item.cardId),
      items.map((item) => item.variant),
    );

    return this.toItemDtos(items, prices).sort(
      (a, b) =>
        b.quantity - a.quantity ||
        (b.price?.market ?? -1) - (a.price?.market ?? -1),
    );
  }

  async getStats(
    userId: string,
    collectionId: string,
  ): Promise<CollectionStatsDto> {
    await this.assertCollectionOwnership(userId, collectionId);
    const evaluatedAt = new Date();

    const rows = await this.prisma.$queryRaw<StatsRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(i.quantity), 0)::int AS "totalCards",
        COUNT(i.id)::int AS "uniqueCards",
        COUNT(i.id) FILTER (WHERE i.quantity > 1)::int AS "duplicateCards",
        COUNT(DISTINCT c."setId")::int AS "setsCount",
        COALESCE(SUM(i.quantity * lp.market), 0)::float8 AS "totalValueUsd",
        COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL), 0)::int AS "pricedCopies",
        COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL AND lp.provider = ${this.priceProvider.id} AND lp."fetchedAt" <= ${evaluatedAt} AND lp."fetchedAt" > ${new Date(evaluatedAt.getTime() - 86400000)}), 0)::int AS "freshCopies",
        COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL AND (lp.provider <> ${this.priceProvider.id} OR lp."fetchedAt" <= ${new Date(evaluatedAt.getTime() - 86400000)})), 0)::int AS "staleCopies",
        MIN(lp."fetchedAt") FILTER (WHERE lp.market IS NOT NULL AND lp."fetchedAt" <= ${evaluatedAt}) AS "oldestFetchedAt",
        MAX(lp."fetchedAt") FILTER (WHERE lp.market IS NOT NULL AND lp."fetchedAt" <= ${evaluatedAt}) AS "newestFetchedAt",
        ${evaluatedAt}::timestamptz AS "evaluatedAt",
         COUNT(DISTINCT i."cardId") FILTER (WHERE lp.market IS NULL)::int AS "cardsMissingPrice"
      FROM collection_items i
      JOIN collections col ON col.id = i."collectionId"
      JOIN cards c ON c.id = i."cardId"
      ${this.latestPriceJoin()}
      WHERE col.id = ${collectionId} AND col."userId" = ${userId}
    `);

    const row = rows[0];
    const totalCards = row?.totalCards ?? 0;
    const pricedCopies = row?.pricedCopies ?? 0;
    const freshCopies = row?.freshCopies ?? 0;
    const staleCopies = row?.staleCopies ?? 0;
    const valuationDto = valuationFromCounts({ totalCopies: totalCards, pricedCopies, amount: row?.totalValueUsd ?? 0, evaluatedAt,
      freshCopies, staleCopies, unknownFreshnessCopies: Math.max(0, pricedCopies - freshCopies - staleCopies),
      oldestFetchedAt: row?.oldestFetchedAt ?? null, newestFetchedAt: row?.newestFetchedAt ?? null });

    return {
      totalCards: row?.totalCards ?? 0,
      uniqueCards: row?.uniqueCards ?? 0,
      duplicateCards: row?.duplicateCards ?? 0,
      setsCount: row?.setsCount ?? 0,
      totalValueUsd: round2(row?.totalValueUsd ?? 0),
      totalValueArs: null,
      cardsMissingPrice: row?.cardsMissingPrice ?? 0,
      valuation: valuationDto,
    };
  }

  /**
   * `GET /collections/:id/set-progress` (B7): el agregado por set.
   *
   * ## Por qué un solo `$queryRaw`
   *
   * La pantalla necesita una fila por set **con al menos una carta**, y armar
   * ese grupo en el cliente obligaría a traer todos los items de la colección y
   * agruparlos en JS. Acá es un `GROUP BY c."setId"`.
   *
   * El precio sale del **mismo** `DISTINCT ON` que usa `getStats`, así que el
   * `valueUsd` de una fila y el `totalValueUsd` de `/stats` son el mismo número
   * con la misma regla (última fila de `card_prices` de la variante del item).
   *
   * ## `total` es el de la fuente, no un `COUNT(cards)`
   *
   * `card_sets.total` y `printedTotal` vienen del catálogo espejado. Un
   * `COUNT(cards)` como denominador daría un porcentaje mentiroso en los sets
   * incompletos en la base, así que si la fuente no declara ninguno va `0` y el
   * cliente lo muestra como desconocido en vez de inventar un porcentaje.
   *
   * ## El orden
   *
   * `valueUsd DESC, porcentaje DESC (NULLS LAST), missingCount ASC, setId ASC`.
   * Los sets sin denominador no se pueden ordenar por porcentaje, y el `setId`
   * del final es lo que hace la lista determinista: sin él, dos filas empatadas
   * saltarían de posición entre renders, que se ve como un glitch bajo el dedo.
   */
  async getSetProgress(
    userId: string,
    collectionId: string,
  ): Promise<SetProgressDto[]> {
    await this.assertCollectionOwnership(userId, collectionId);

    const rows = await this.prisma.$queryRaw<SetProgressRow[]>(Prisma.sql`
      SELECT
        c."setId" AS "setId",
        COUNT(DISTINCT i."cardId")::int AS "owned",
        COALESCE(s.total, s."printedTotal", 0)::int AS "total",
        ROUND(COALESCE(SUM(i.quantity * lp.market), 0), 2)::float8 AS "valueUsd",
        GREATEST(
          COALESCE(s.total, s."printedTotal", 0) - COUNT(DISTINCT i."cardId"),
          0
        )::int AS "missingCount"
      FROM collection_items i
      JOIN collections col ON col.id = i."collectionId"
      JOIN cards c ON c.id = i."cardId"
      LEFT JOIN card_sets s ON s.id = c."setId"
      ${this.latestPriceJoin()}
      WHERE col.id = ${collectionId} AND col."userId" = ${userId}
      GROUP BY c."setId", s.total, s."printedTotal"
      ORDER BY
        "valueUsd" DESC,
        (
          CASE
            WHEN COALESCE(s.total, s."printedTotal", 0) > 0
            THEN COUNT(DISTINCT i."cardId")::float8
              / COALESCE(s.total, s."printedTotal", 0)
          END
        ) DESC NULLS LAST,
        "missingCount" ASC,
        "setId" ASC
    `);

    return rows.map((row) => ({
      setId: row.setId,
      owned: Number(row.owned),
      total: Number(row.total),
      valueUsd: round2(Number(row.valueUsd)),
      valueArs: null,
      missingCount: Number(row.missingCount),
    }));
  }

  // ─── Internos ───

  /** El `where` del listado, compartido por los datos y por el `count`. */
  private itemWhere(
    collectionId: string,
    dto: ListItemsDto,
  ): Prisma.CollectionItemWhereInput {
    return {
      collectionId,
      ...(dto.duplicatesOnly ? { quantity: { gt: 1 } } : {}),
      // Los dos filtros trade/duplicados se acumulan en el mismo `where` (no se
      // pisan) y el `count` de más abajo lo reutiliza, así que el `total`
      // siempre corresponde a los datos de la página.
      ...(dto.forTradeOnly ? { isForTrade: true } : {}),
      ...(dto.setId || dto.search
        ? {
            card: {
              ...(dto.setId ? { setId: dto.setId } : {}),
              ...(dto.search
                ? {
                    name: {
                      contains: dto.search,
                      mode: 'insensitive' as const,
                    },
                  }
                : {}),
            },
          }
        : {}),
    };
  }

  /**
   * La página de items del listado, con el orden que pidió el cliente.
   *
   * ## Por qué hay dos caminos
   *
   * `name`, `rarity` y el orden por defecto salen con el `orderBy` de Prisma (que
   * llega a la relación `card`). **`number` y `price` no pueden**: el primero
   * porque la parte numérica de `number` es un `CAST` que el ORM no arma, y el
   * segundo porque el precio vive en otra tabla (`card_prices`) y el `orderBy` de
   * Prisma no llega a una relación que no sea del modelo. Para esos dos hay una
   * query de **ids ya ordenados** y después un `findMany` por esos ids.
   *
   * ## Lo que no cambia
   *
   * - **Cero N+1**: son 3 queries fijas (ids ordenados, `findMany`, `count`) más
   *   el `fetchLatestPrices` que ya existía. No crece con la cantidad de items.
   * - **El `count` sale siempre del `where` de Prisma**, no de la query de ids:
   *   así el `total` es el mismo número con cualquier `sort`, aunque la página
   *   esté vacía (un `COUNT(*) OVER ()` de la query de ids daría 0 en la última
   *   página, que es justo donde el usuario mira si hay más).
   * - `sort=price` **no pide precios a nadie**: lee `card_prices` con el mismo
   *   `latestMarketPriceJoin` que usa el `totalValueUsd` de `/stats`, así que la
   *   lista ordenada y el total mostrado no pueden discrepar
   *   (`AGENTS.md` §3.1).
   */
  private async itemsForPage(
    collectionId: string,
    dto: ListItemsDto,
    pageSize: number,
    offset: number,
  ): Promise<{ items: ItemWithCard[]; total: number }> {
    const where = this.itemWhere(collectionId, dto);

    if (dto.sort !== 'number' && dto.sort !== 'price') {
      const [items, count] = await Promise.all([
        this.prisma.collectionItem.findMany({
          where,
          select: ITEM_SELECT,
          orderBy: this.itemOrderBy(dto.sort),
          take: pageSize,
          skip: offset,
        }),
        this.prisma.collectionItem.count({ where }),
      ]);
      return { items, total: count };
    }

    const [ids, count] = await Promise.all([
      this.orderedItemIds(collectionId, dto, pageSize, offset),
      this.prisma.collectionItem.count({ where }),
    ]);
    if (ids.length === 0) return { items: [], total: count };

    const items = await this.prisma.collectionItem.findMany({
      where: { id: { in: ids } },
      select: ITEM_SELECT,
    });
    // `findMany` no garantiza el orden: el que manda es el de la query de ids.
    const byId = new Map(items.map((item) => [item.id, item]));
    return {
      items: ids.flatMap((id) => {
        const item = byId.get(id);
        return item === undefined ? [] : [item];
      }),
      total: count,
    };
  }

  /** El `orderBy` de Prisma para los órdenes que no llegan a `card_prices`. */
  private itemOrderBy(
    sort: CardSortField | undefined,
  ): Prisma.CollectionItemOrderByWithRelationInput[] {
    switch (sort) {
      case 'name':
        return [{ card: { name: 'asc' } }, { id: 'asc' }];
      case 'rarity':
        // El `rarity ASC` de Postgres ya deja los NULL al final, que es lo que
        // quiere "de la más común a la rara".
        return [{ card: { rarity: 'asc' } }, { card: { name: 'asc' } }, { id: 'asc' }];
      case 'number':
      case 'price':
      default:
        return [{ addedAt: 'desc' }, { id: 'asc' }];
    }
  }

  /**
   * Los ids de la página, en el orden pedido, para los dos `sort` que Prisma no
   * puede resolver.
   *
   * El precio ordena por **el valor del item** (`quantity × market` de su
   * variante), que es la misma expresión que suma `totalValueUsd` en `/stats` y
   * `/set-progress`: mismo número, misma regla. `NULLS LAST` en las dos
   * direcciones porque los items sin precio son la mayoría de una colección
   * recién empezada y "sin precio" no es un criterio de orden, es falta de dato.
   *
   * El desempate termina en `i.id` (la PK): es un **orden total**, así que dos
   * requests seguidos devuelven la misma página y la lista no salta entre
   * renders mientras el usuario scrollea.
   */
  private async orderedItemIds(
    collectionId: string,
    dto: ListItemsDto,
    pageSize: number,
    offset: number,
  ): Promise<string[]> {
    const byPrice = dto.sort === 'price';
    const orderBy = byPrice
      ? Prisma.sql`(i.quantity * lp.market) DESC NULLS LAST, c.name ASC, i.id ASC`
      : Prisma.sql`${NUMERIC_CARD_NUMBER} ASC NULLS LAST, c.name ASC, i.id ASC`;

    const rows = await this.prisma.$queryRaw<ItemOrderRow[]>(Prisma.sql`
      SELECT i.id AS "id"
      FROM collection_items i
      JOIN cards c ON c.id = i."cardId"
      ${byPrice ? this.latestPriceJoin() : Prisma.empty}
      WHERE ${this.itemFilterSql(collectionId, dto)}
      ORDER BY ${orderBy}
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    return rows.map((row) => row.id);
  }

  /**
   * El filtro del listado en SQL, para la query de ids ordenados.
   *
   * Es el **espejo** de `itemWhere` y tiene que seguirlo: si uno acepta un filtro
   * que el otro no, la página mostrada y el `total` dejan de ser el mismo
   * conjunto. Cuando agregues un filtro a `ListItemsDto`, agregalo en los dos.
   */
  private itemFilterSql(collectionId: string, dto: ListItemsDto): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`i."collectionId" = ${collectionId}`,
    ];
    if (dto.duplicatesOnly) conditions.push(Prisma.sql`i.quantity > 1`);
    if (dto.forTradeOnly) conditions.push(Prisma.sql`i."isForTrade" = true`);
    if (dto.setId) conditions.push(Prisma.sql`c."setId" = ${dto.setId}`);
    if (dto.search) {
      conditions.push(
        Prisma.sql`c.name ILIKE ${`%${escapeLike(dto.search)}%`} ESCAPE '\\'`,
      );
    }
    return Prisma.join(conditions, ' AND ');
  }

  /**
   * `GET /cards/:id/location`: en qué colección del usuario está esta carta.
   *
   * ## Por qué el `userId` va en el `WHERE`
   *
   * Es la regla de `AGENTS.md` §7: el ownership se resuelve en la query, no con
   * un check aparte. Con el `col."userId" = $2` adentro, una colección ajena no
   * aparece y el endpoint devuelve `null` — que además es la respuesta correcta
   * para "no la tenés" — en vez de un 403 que confirmaría que ese id existe.
   *
   * ## El orden
   *
   * `isDefault DESC, quantity DESC, addedAt ASC, id ASC`: si la carta está en
   * varias colecciones gana la principal (es la que el cliente va a usar para el
   * `PATCH`), después la que más copias tiene, y el `id` del final vuelve el
   * orden total. Prisma no puede ordenar por un campo de la relación
   * (`isDefault` es de `collections`), así que la fila se arma en SQL.
   */
  async findCardLocation(
    userId: string,
    cardId: string,
  ): Promise<CardLocationDto | null> {
    const rows = await this.prisma.$queryRaw<CardLocationRow[]>(Prisma.sql`
      SELECT
        col.id AS "collectionId",
        col.name AS "collectionName",
        i.id AS "itemId",
        i.quantity::int AS "quantity",
        i.variant AS "variant",
        i.condition AS "condition"
      FROM collection_items i
      JOIN collections col ON col.id = i."collectionId"
      WHERE i."cardId" = ${cardId} AND col."userId" = ${userId}
      ORDER BY col."isDefault" DESC, i.quantity DESC, i."addedAt" ASC, i.id ASC
      LIMIT 1
    `);

    const found = rows[0];
    if (found) {
      return { ...found, quantity: Number(found.quantity) };
    }

    // No hay item: o el usuario no la tiene, o la carta no existe. Solo en este
    // camino se consulta el catálogo, que es el que devuelve `null` o 404.
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { id: true },
    });
    if (!card) {
      throw new NotFoundException(`Carta no encontrada: ${cardId}`);
    }
    return null;
  }

  private async ensureDefaultCollection(userId: string): Promise<void> {
    const existing = await this.prisma.collection.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (existing) return;

    await this.prisma.collection.create({
      data: { userId, name: DEFAULT_COLLECTION_NAME, isDefault: true },
    });
  }

  private async assertCollectionOwnership(
    userId: string,
    collectionId: string,
  ): Promise<void> {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!collection) {
      throw new NotFoundException(`Colección no encontrada: ${collectionId}`);
    }
  }

  private async findOwnedItem(userId: string, itemId: string): Promise<{
    id: string;
    collectionId: string;
    cardId: string;
    variant: string;
    condition: string;
  }> {
    const item = await this.prisma.collectionItem.findFirst({
      where: { id: itemId, collection: { userId } },
      select: {
        id: true,
        collectionId: true,
        cardId: true,
        variant: true,
        condition: true,
      },
    });
    if (!item) {
      throw new NotFoundException(`Item no encontrado: ${itemId}`);
    }
    return item;
  }

  /**
   * El precio de mercado de cada item. Vive en `common/sql/latest-price.ts` y
   * es el mismo join que usa el resumen de collections de `friends`: la regla
   * "última fila de `card_prices` de esa variante" tiene que ser una sola, o el
   * total de un lado y el del otro dejan de cuadrar cuando `card_prices` crece.
   */
  private latestPriceJoin(): Prisma.Sql {
    return latestMarketPriceJoin(this.priceProvider);
  }

  private async aggregateQuery(
    filter: Prisma.Sql,
  ): Promise<CollectionAggregateRow[]> {
    const evaluatedAt = new Date();
    return this.prisma.$queryRaw<CollectionAggregateRow[]>(Prisma.sql`
      SELECT
        col.id,
        col."userId" AS "userId",
        col.name,
        col."isDefault" AS "isDefault",
        col."createdAt" AS "createdAt",
        COALESCE(SUM(i.quantity), 0)::int AS "itemCount",
        COUNT(i.id)::int AS "uniqueCount",
        COUNT(i.id) FILTER (WHERE i.quantity > 1)::int AS "duplicateCount",
        COALESCE(SUM(i.quantity * lp.market), 0)::float8 AS "totalValueUsd",
        COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL), 0)::int AS "pricedCopies",
        COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL AND lp.provider = ${this.priceProvider.id} AND lp."fetchedAt" <= ${evaluatedAt} AND lp."fetchedAt" > ${new Date(evaluatedAt.getTime() - 86400000)}), 0)::int AS "freshCopies",
        COALESCE(SUM(i.quantity) FILTER (WHERE lp.market IS NOT NULL AND (lp.provider <> ${this.priceProvider.id} OR lp."fetchedAt" <= ${new Date(evaluatedAt.getTime() - 86400000)})), 0)::int AS "staleCopies",
        MIN(lp."fetchedAt") FILTER (WHERE lp.market IS NOT NULL AND lp."fetchedAt" <= ${evaluatedAt}) AS "oldestFetchedAt",
        MAX(lp."fetchedAt") FILTER (WHERE lp.market IS NOT NULL AND lp."fetchedAt" <= ${evaluatedAt}) AS "newestFetchedAt",
        ${evaluatedAt}::timestamptz AS "evaluatedAt"
      FROM collections col
      LEFT JOIN collection_items i ON i."collectionId" = col.id
      ${this.latestPriceJoin()}
      ${filter}
      GROUP BY col.id
      ORDER BY col."isDefault" DESC, col."createdAt" ASC, col.id ASC
    `);
  }

  /**
   * El mosaic de portada de **todas** las colecciones del filtro, en **una**
   * sola query.
   *
   * El `CROSS JOIN LATERAL` por colección, no una consulta por colección:
   * el número de round-trips a la base no depende de cuántas colecciones tenga
   * el usuario, que es exactamente lo que `AGENTS.md` ("Cero N+1") pide. La
   * alternativa con `row_number()` **plano** (sin lateral) se midió y es ~7× más
   * cara: la ventana necesita **todas** las filas del usuario para numerarlas, así
   * que su costo crece con los items —604 buffers y 4,6 ms contra 310 y 1,0 ms
   * con 200 items, y 6.033 buffers y 15,9 ms contra 117 y 3,7 ms con 2.000—,
   * mientras que el lateral se detiene en `LIMIT 4` por colección y se apoya en
   * `collection_items(collectionId)`. Ver `docs/gotchas.md` §27.
   *
   * ## Sin `row_number()` adentro
   *
   * El lateral ya sale ordenado por el criterio del collage y el `LIMIT` ya corta
   * en 4, así que numerar las filas es redundante: se pagaba una ventana sobre
   * **todos** los items de la colección para descartar casi todos, que es
   * justamente el antipatrón que hizo descartar la forma con `row_number()`. El
   * orden determinista lo da el `ORDER BY` de afuera, que usa el mismo criterio
   * y termina en `id` (la PK), o sea que es un orden total: dos requests
   * seguidos devuelven el mismo mosaico.
   *
   * El `DISTINCT ON ("cardId")` interno evita que la misma carta aparezca dos
   * veces en el collage: la misma carta puede estar en la colección con dos
   * variantes o dos condiciones, y sin esto la grilla 2×2 muestra la misma
   * imagen repetida.
   *
   * El `JOIN cards` va **por fuera** del lateral, no adentro a propósito. La
   * tupla de `cards` arrastra el `rawJson` (decenas de KB), así que proyectar
   * `imageSmall` antes de descartar los items sobrantes hace 200 accesos al
   * heap de `cards` en vez de 20: medido, 627 buffers contra 84. Del `rawJson`
   * no se lee ni una columna: la proyección es solo `imageSmall`.
   */
  private async loadCovers(
    client: PrismaClientLike,
    filter: Prisma.Sql,
  ): Promise<Map<string, CollectionCoverItem[]>> {
    const rows = await client.$queryRaw<CoverRow[]>(Prisma.sql`
      SELECT
        col.id AS "collectionId",
        cov."cardId" AS "cardId",
        c."imageSmall" AS "imageSmall"
      FROM collections col
      CROSS JOIN LATERAL (
        SELECT dedup."cardId", dedup.quantity, dedup."addedAt", dedup.id
        FROM (
          SELECT DISTINCT ON (i."cardId")
            i."cardId" AS "cardId",
            i.quantity AS quantity,
            i."addedAt" AS "addedAt",
            i.id AS id
          FROM collection_items i
          WHERE i."collectionId" = col.id
          ORDER BY i."cardId", i.quantity DESC, i."addedAt" ASC, i.id ASC
        ) dedup
        ORDER BY dedup.quantity DESC, dedup."addedAt" ASC, dedup.id ASC
        LIMIT ${COVER_SIZE}
      ) cov
      JOIN cards c ON c.id = cov."cardId"
      ${filter}
      ORDER BY cov.quantity DESC, cov."addedAt" ASC, cov.id ASC
    `);

    const covers = new Map<string, CollectionCoverItem[]>();
    for (const row of rows) {
      const list = covers.get(row.collectionId) ?? [];
      list.push({ cardId: row.cardId, imageSmall: row.imageSmall });
      covers.set(row.collectionId, list);
    }
    return covers;
  }

  private async fetchLatestPrices(
    client: PrismaClientLike,
    cardIds: string[],
    variants: string[],
  ): Promise<Map<string, PriceDto>> {
    const uniqueCardIds = [...new Set(cardIds)];
    if (uniqueCardIds.length === 0) return new Map();

    const variantSet = new Set(variants);
    const rows = await client.$queryRaw<LatestPriceRow[]>(Prisma.sql`
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
    const evaluatedAt = new Date();
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
        ...priceMetadata(row.fetchedAt, row.provider, this.priceProvider.id, evaluatedAt),
      });
    }
    return prices;
  }

  private toCollectionDto(
    collection: { id: string; userId: string; name: string; isDefault: boolean; createdAt: Date },
    totals: {
      itemCount: number;
      uniqueCount: number;
      duplicateCount: number;
      totalValueUsd: number;
      pricedCopies?: number;
      freshCopies?: number;
      staleCopies?: number;
      oldestFetchedAt?: Date | null;
      newestFetchedAt?: Date | null;
      evaluatedAt?: Date;
    },
    cover: CollectionCoverItem[],
  ): CollectionDto {
    const evaluatedAt = totals.evaluatedAt ?? new Date();
    const pricedCopies = totals.pricedCopies ?? 0;
    const freshCopies = totals.freshCopies ?? 0;
    const staleCopies = totals.staleCopies ?? 0;
    const valuationDto = valuationFromCounts({ totalCopies: Number(totals.itemCount), pricedCopies, amount: Number(totals.totalValueUsd), evaluatedAt,
      freshCopies, staleCopies, unknownFreshnessCopies: Math.max(0, pricedCopies - freshCopies - staleCopies),
      oldestFetchedAt: totals.oldestFetchedAt ?? null, newestFetchedAt: totals.newestFetchedAt ?? null });
    return {
      id: collection.id,
      userId: collection.userId,
      name: collection.name,
      isDefault: collection.isDefault,
      itemCount: Number(totals.itemCount),
      uniqueCount: Number(totals.uniqueCount),
      duplicateCount: Number(totals.duplicateCount),
      totalValueUsd: round2(Number(totals.totalValueUsd)),
      valuation: valuationDto,
      totalValueArs: null,
      cover,
      createdAt: toIso(collection.createdAt),
    };
  }

  private toItemDtos(
    items: ItemWithCard[],
    prices: Map<string, PriceDto>,
  ): CollectionItemDto[] {
    return items.map((item) =>
      this.toItemDto(
        item,
        prices.get(priceKey(item.cardId, item.variant)) ?? null,
      ),
    );
  }

  private toItemDto(item: ItemWithCard, price: PriceDto | null): CollectionItemDto {
    const set = item.card.set;
    const card: CardDto = {
      id: item.card.id,
      name: item.card.name,
      supertype: item.card.supertype,
      subtypes: item.card.subtypes ?? [],
      hp: item.card.hp,
      types: item.card.types ?? [],
      number: item.card.number,
      rarity: item.card.rarity,
      artist: item.card.artist,
      setId: item.card.setId,
      imageSmall: item.card.imageSmall,
      imageLarge: item.card.imageLarge,
    };

    if (set) {
      card.set = {
        id: set.id,
        name: set.name,
        series: set.series,
        printedTotal: set.printedTotal,
        total: set.total,
        releaseDate: set.releaseDate ? toIso(set.releaseDate) : null,
        logoUrl: set.logoUrl,
        symbolUrl: set.symbolUrl,
      };
    }

    return {
      id: item.id,
      collectionId: item.collectionId,
      card,
      variant: item.variant,
      condition: item.condition,
      quantity: item.quantity,
      isForTrade: item.isForTrade,
      notes: item.notes,
      addedAt: toIso(item.addedAt),
      price,
    };
  }
}
