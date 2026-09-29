import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { latestMarketPriceJoin } from '../../common/sql/latest-price.js';
import { SyncPricesService } from '../../jobs/sync-prices.service.js';
import { PrismaService } from '../../prisma/index.js';
import { AddItemDto } from './dto/add-item.dto.js';
import { CreateCollectionDto } from './dto/create-collection.dto.js';
import { ListItemsDto } from './dto/list-items.dto.js';
import { UpdateCollectionDto } from './dto/update-collection.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';

const DEFAULT_COLLECTION_NAME = 'Mi colección';
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;

/**
 * Cuántas cartas entran en el mosaic de portada. 4 porque el collage del
 * cliente es una grilla de 2×2.
 */
const COVER_SIZE = 4;

const ITEM_INCLUDE = Prisma.validator<Prisma.CollectionItemInclude>()({
  card: { include: { set: true } },
});

type ItemWithCard = Prisma.CollectionItemGetPayload<{
  include: { card: { include: { set: true } } };
}>;

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
  currency: string;
  source: string;
  fetchedAt: string;
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
}

interface StatsRow {
  totalCards: number;
  uniqueCards: number;
  duplicateCards: number;
  setsCount: number;
  totalValueUsd: number;
  cardsMissingPrice: number;
}

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

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    /** Opcional: los tests unitarios lo construyen sin el job de precios. */
    @Optional() private readonly syncPrices?: SyncPricesService,
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
    return this.prisma.$transaction(async (tx) => {
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
  }

  async list(userId: string): Promise<CollectionDto[]> {
    await this.ensureDefaultCollection(userId);
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

    const where: Prisma.CollectionItemWhereInput = {
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

    const [items, total] = await Promise.all([
      this.prisma.collectionItem.findMany({
        where,
        include: ITEM_INCLUDE,
        orderBy: [{ addedAt: 'desc' }, { id: 'asc' }],
        take: pageSize,
        skip: offset,
      }),
      this.prisma.collectionItem.count({ where }),
    ]);

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
  ): Promise<CollectionItemDto> {
    const variant = dto.variant ?? 'normal';
    const condition = dto.condition ?? 'NM';
    const quantity = dto.quantity ?? 1;

    const item = await this.prisma.$transaction(async (tx) => {
      const collection = await tx.collection.findFirst({
        where: { id: collectionId, userId },
        select: { id: true },
      });
      if (!collection) {
        throw new NotFoundException(`Colección no encontrada: ${collectionId}`);
      }

      const card = await tx.card.findUnique({
        where: { id: dto.cardId },
        select: { id: true },
      });
      if (!card) {
        throw new NotFoundException(`Carta no encontrada: ${dto.cardId}`);
      }

      const uniqueWhere = {
        collectionId_cardId_variant_condition: {
          collectionId,
          cardId: dto.cardId,
          variant,
          condition,
        },
      };

      // Semántica: agregar N copias más de una combinación ya presente.
      const existing = await tx.collectionItem.findUnique({
        where: uniqueWhere,
        select: { id: true },
      });

      if (existing) {
        return tx.collectionItem.update({
          where: { id: existing.id },
          data: { quantity: { increment: quantity } },
          include: ITEM_INCLUDE,
        });
      }

      try {
        return await tx.collectionItem.create({
          data: {
            collectionId,
            cardId: dto.cardId,
            variant,
            condition,
            quantity,
            ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          },
          include: ITEM_INCLUDE,
        });
      } catch (error) {
        // Carrera entre dos requests idénticos: el unique ya lo creó el otro.
        if (!isUniqueViolation(error)) throw error;
        const winner = await tx.collectionItem.findUnique({
          where: uniqueWhere,
          select: { id: true },
        });
        if (!winner) throw error;
        return tx.collectionItem.update({
          where: { id: winner.id },
          data: { quantity: { increment: quantity } },
          include: ITEM_INCLUDE,
        });
      }
    });

    // El precio se consulta bajo demanda, así que una carta recién agregada no
    // lo tenía: el total de la colección valía $0 hasta que el usuario abría el
    // detalle. Se pide en background (no bloquea la respuesta) y la cola
    // respeta el rate limit de la API.
    this.syncPrices?.enqueueRefresh(item.cardId);

    return this.toItemDto(
      item,
      await this.fetchLatestPrices(
        this.prisma,
        [item.cardId],
        [item.variant],
      ).then((prices) => prices.get(priceKey(item.cardId, item.variant)) ?? null),
    );
  }

  /**
   * Encola el refresco de precio de todas las cartas de una colección, para las
   * que aún no tengan precio guardado. Devuelve cuántas quedaron encoladas.
   */
  async enqueueMissingPrices(userId: string, collectionId: string): Promise<number> {
    await this.assertOwned(userId, collectionId);
    const items = await this.prisma.collectionItem.findMany({
      where: { collection: { id: collectionId, userId } },
      select: { cardId: true, card: { select: { prices: { select: { id: true }, take: 1 } } } },
      distinct: ['cardId'],
    });

    let queued = 0;
    for (const item of items) {
      if (item.card.prices.length === 0) {
        this.syncPrices?.enqueueRefresh(item.cardId);
        queued += 1;
      }
    }
    return queued;
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
        include: ITEM_INCLUDE,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe un item con esa misma variante y condición en la colección',
        );
      }
      throw error;
    }

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
  }

  async getDuplicates(
    userId: string,
    collectionId: string,
  ): Promise<CollectionItemDto[]> {
    await this.assertCollectionOwnership(userId, collectionId);

    const items = await this.prisma.collectionItem.findMany({
      where: { collectionId, quantity: { gt: 1 } },
      include: ITEM_INCLUDE,
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

    const rows = await this.prisma.$queryRaw<StatsRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(i.quantity), 0)::int AS "totalCards",
        COUNT(i.id)::int AS "uniqueCards",
        COUNT(i.id) FILTER (WHERE i.quantity > 1)::int AS "duplicateCards",
        COUNT(DISTINCT c."setId")::int AS "setsCount",
        COALESCE(SUM(i.quantity * lp.market), 0)::float8 AS "totalValueUsd",
        COUNT(DISTINCT i."cardId") FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM card_prices cp WHERE cp."cardId" = i."cardId"
          )
        )::int AS "cardsMissingPrice"
      FROM collection_items i
      JOIN collections col ON col.id = i."collectionId"
      JOIN cards c ON c.id = i."cardId"
      ${this.latestPriceJoin()}
      WHERE col.id = ${collectionId} AND col."userId" = ${userId}
    `);

    const row = rows[0];

    return {
      totalCards: row?.totalCards ?? 0,
      uniqueCards: row?.uniqueCards ?? 0,
      duplicateCards: row?.duplicateCards ?? 0,
      setsCount: row?.setsCount ?? 0,
      totalValueUsd: round2(row?.totalValueUsd ?? 0),
      totalValueArs: null,
      cardsMissingPrice: row?.cardsMissingPrice ?? 0,
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
    return latestMarketPriceJoin();
  }

  private async aggregateQuery(
    filter: Prisma.Sql,
  ): Promise<CollectionAggregateRow[]> {
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
        COALESCE(SUM(i.quantity * lp.market), 0)::float8 AS "totalValueUsd"
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

  private toCollectionDto(
    collection: { id: string; userId: string; name: string; isDefault: boolean; createdAt: Date },
    totals: {
      itemCount: number;
      uniqueCount: number;
      duplicateCount: number;
      totalValueUsd: number;
    },
    cover: CollectionCoverItem[],
  ): CollectionDto {
    return {
      id: collection.id,
      userId: collection.userId,
      name: collection.name,
      isDefault: collection.isDefault,
      itemCount: Number(totals.itemCount),
      uniqueCount: Number(totals.uniqueCount),
      duplicateCount: Number(totals.duplicateCount),
      totalValueUsd: round2(Number(totals.totalValueUsd)),
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
