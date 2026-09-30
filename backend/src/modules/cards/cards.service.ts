import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NUMERIC_CARD_NUMBER } from '../../common/sql/numeric-number.js';
import { SyncPricesService, PRICE_MAX_AGE_MS } from '../../jobs/sync-prices.service.js';
import { PrismaService } from '../../prisma/index.js';
import { CurrencyService, type RateView } from '../currency/currency.service.js';
import type { RateType } from '../currency/currency.constants.js';
import { CardPricesQueryDto } from './dto/card-prices-query.dto.js';
import {
  PRICE_HISTORY_DEFAULT_DAYS,
  PRICE_HISTORY_MAX_DAYS,
  PRICE_HISTORY_MIN_DAYS,
  PriceHistoryQueryDto,
} from './dto/price-history-query.dto.js';
import { type CardSearchField, SearchCardsDto } from './dto/search-cards.dto.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const TRIGRAM_MIN_LENGTH = 3;
const TRIGRAM_THRESHOLD = '0.2';
const PREFIX_SCORE = 1;
const SUBSTRING_SCORE = 0.8;

/**
 * Ventana del delta de precio, en días. Es la que muestra el diseño ("en los
 * últimos 30 días") y la que pide la ficha de carta.
 */
const CHANGE_WINDOW_DAYS = 30;
/**
 * Cuánto puede tener el precio de referencia para que el delta se muestre.
 *
 * Sin tope, una carta cuyo último dato es de hace 8 meses devuelve un delta
 * "de 30 días" que en realidad mide medio año. Como la UI lo rotula con la
 * ventana, un número tan viejo sería falso: preferimos no mostrar nada.
 */
const CHANGE_MAX_REFERENCE_AGE_DAYS = 90;

/**
 * Rótulo de la ventana del delta. Lo manda el backend y el cliente lo muestra al
 * lado de la píldora: si la ventana cambia, el texto cambia con ella y no queda
 * un `"últimos 30 días"` hardcodeado en dos lugares.
 */
const CHANGE_WINDOW_LABEL = `últimos ${CHANGE_WINDOW_DAYS} días`;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Alias local: el literal vive en `common/sql/numeric-number.ts`. */
const NUMERIC_NUMBER = NUMERIC_CARD_NUMBER;

/**
 * Una cotización actual por carta para `sort=price`, desde el histórico.
 *
 * El orden público pone primero las cartas con precio y deja las que no tienen
 * cotización al final, alfabéticamente. Materializamos el conjunto **sparse** de
 * cartas con precio y consultamos aparte el tramo sin precio: unirlo como LEFT
 * JOIN a `cards` obligaba a leer los 20k registros (incluido su `rawJson`) para
 * devolver la primera página. La página habitual ahora hace heap lookup solo de
 * las cartas cotizadas; el fallback recorre el índice de nombre únicamente al
 * llegar a la parte sin precio.
 *
 * El `MAX` colapsa las variantes al mejor precio disponible, igual que el orden
 * anterior. El resultado es determinista y no elige una variante fija que dejaría
 * sin cotización a cartas que solo tienen reverse holo/first edition.
 *
 * Va como CTE `MATERIALIZED` porque la usan dos subconsultas del mismo statement
 * (`searchByCurrentPrice`): sin materializar, Postgres evalúa la pirámide del
 * `DISTINCT ON` dos veces. Con ~60 cartas cotizadas sobre 20.670 del catálogo,
 * esa diferencia es la que separa dos round-trips de cuatro.
 */
const CURRENT_CARD_MARKET_PRICES = Prisma.sql`
  SELECT latest."cardId", MAX(latest.market) AS price
  FROM (
    SELECT DISTINCT ON (p."cardId", p.variant)
      p."cardId", p.variant, p.market
    FROM card_prices p
    ORDER BY p."cardId", p.variant, p."fetchedAt" DESC
  ) latest
  WHERE latest.market IS NOT NULL
  GROUP BY latest."cardId"
`;

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

export interface CardPriceDto {
  cardId: string;
  variant: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  currency: string;
  source: string;
  fetchedAt: string;
  /** Solo con `?currency=ARS`. `null` si no hay rate cacheado. */
  priceArs?: PriceArsDto | null;
  /**
   * Variación contra la ventana de 30 días. **Opcional**: solo lo calculan los
   * endpoints que aceptan el costo extra de leer el histórico
   * (`GET /cards/:id/prices`); los demás lo omiten y el cliente cae a la fecha
   * de actualización. Ver `priceChange()` para las reglas de cuándo es `null`.
   */
  change?: PriceChangeDto | null;
  /**
   * Los tres campos que consume la píldora de variación del cliente
   * (`PriceDelta`), con los nombres que espera. Son **la misma** cuenta que
   * `change`, no un segundo cálculo: el endpoint de histórico los manda
   * aparte porque son de primer nivel y no anidados.
   *
   * Los tres van **siempre juntos o nunca**: si no hay nada honesto que decir,
   * los tres vienen `null` (no `0`, no `undefined`). Un `0 %` afirma que el
   * precio no se movió, que es un dato; un `null` dice que no se puede saber.
   */
  changeUsd?: number | null;
  changePercent?: number | null;
  /** "últimos 30 días". `null` cuando no hay delta. */
  windowLabel?: string | null;
}

/**
 * Cuánto cambió el precio de referencia en la ventana.
 *
 * `usd` va **con signo** (`-2839.31` es una caída) y en USD: la conversión a
 * ARS la hace el cliente, igual que con todos los demás precios.
 *
 * `windowDays` es la ventana **pedida** (30). `from` es la verdad: el `fetchedAt`
 * de la fila que se usó de referencia, que puede ser más viejo que la ventana.
 * El cliente puede mostrar `from` para no mentir cuando no había dato exacto.
 */
export interface PriceChangeDto {
  usd: number;
  percent: number;
  windowDays: number;
  from: string;
}

/** Espejo en pesos de un precio USD. */
export interface PriceArsDto {
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
}

/**
 * Un punto de la serie de `GET /cards/:id/prices/history`.
 *
 * Un punto por **día**, no por fila: `card_prices` es append-only y una carta
 * refrescada seis veces el mismo día tiene seis filas, que para un gráfico son
 * el mismo punto con ruido.
 */
export interface PriceHistoryPointDto {
  /** El día en UTC, `YYYY-MM-DD`. Es la etiqueta del eje. */
  date: string;
  /** `fetchedAt` real de la fila que se eligió para ese día. */
  fetchedAt: string;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
}

/** El delta agregado de la ventana, o `null` si no hay nada honesto que decir. */
export interface PriceWindowChangeDto {
  /** Con signo: `-2.5` es una caída. Siempre USD. */
  changeUsd: number;
  /** Cero decimales, redondeo simétrico (misma regla que `priceChange`). */
  changePercent: number;
}

/**
 * `GET /cards/:id/prices/history`: la serie de precios de una carta.
 *
 * Sale de la tabla `card_prices` que **ya existe** y que ya está indexada por
 * `(cardId, variant, fetchedAt)`. No hay tabla nueva, ni columna nueva, ni
 * snapshot diario: el histórico se arma en el momento con un `DISTINCT ON` sobre
 * el día. Agregar una tabla de snapshots obligaría a backfillear y a mantenerla
 * en cada refresco, para terminar guardando lo mismo con un día de atraso.
 */
export interface PriceHistoryDto {
  cardId: string;
  /** La variante de la serie, o `null` si es "la mejor disponible por día". */
  variant: string | null;
  /** Siempre `USD`: la conversión a ARS la hace el cliente. */
  currency: 'USD';
  /** La ventana efectiva, ya recortada a 7..365. */
  windowDays: number;
  /** Fecha del primer punto con `market`, o `null` si la serie está vacía. */
  from: string | null;
  /** Fecha del último punto con `market`, o `null` si la serie está vacía. */
  to: string | null;
  /** Un punto por día, en orden cronológico ascendente. */
  points: PriceHistoryPointDto[];
  change: PriceWindowChangeDto | null;
}

export interface ConversionMeta {
  rate: number;
  rateType: RateType;
  fetchedAt: string;
  stale: boolean;
}

export interface CardWithPricesDto {
  card: CardDto;
  prices: CardPriceDto[];
  /** Metadata del rate usado, para que el cliente muestre "≈" si está viejo. */
  conversion?: ConversionMeta | null;
}

/**
 * `GET /sets/:id/cards` (B8): la lista completa de un set.
 *
 * El binder la necesita entera para poder dibujar los slots vacíos. Sin esto
 * hay que paginar `/cards/search?setId=` de a 100 y el set más grande del
 * catálogo (`swshp`, 304 cartas) son 3 requests encadenados. Sin paginación a
 * propósito: la alternativa (un `/cards/:id` por carta) sería el N+1 que
 * `AGENTS.md` §7 prohíbe.
 *
 * Cada carta sale de `toCardDto`, o sea que **trae su `set` embebido** igual
 * que en `/cards/search`. Para `swshp` eso son 181 kB, de los cuales 79 kB son
 * el mismo `SetDto` repetido 304 veces. Es el precio de que una carta sea
 * auto-descriptiva como en el resto de la API; si llegara a molestar, el
 * arreglo es dejar de seleccionar las columnas `s.*` de la fila (el `LEFT JOIN`
 * entero) y `toCardDto` las omite solo cuando `setIdSet` viene `null`.
 */
export interface SetCardsResponseDto {
  set: SetDto;
  cards: CardDto[];
  /**
   * El conteo **real** de filas en `cards` para ese set, que puede diferir de
   * `SetDto.total` (el que declara la fuente). El binder cuenta slots con este
   * número, no con el de la fuente.
   */
  total: number;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface CardSearchRow {
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
  imageSmall: string;
  imageLarge: string;
  setIdSet: string | null;
  setName: string | null;
  setSeries: string | null;
  setPrintedTotal: number | null;
  setTotal: number | null;
  setReleaseDate: Date | null;
  setLogoUrl: string | null;
  setSymbolUrl: string | null;
}

/** Campos del DTO de catálogo; el orden por precio los usa en sus dos tramos. */
const CARD_SEARCH_COLUMNS = Prisma.sql`
  c.id,
  c.name,
  c.supertype,
  c.subtypes,
  c.hp,
  c.types,
  c.number,
  c.rarity,
  c.artist,
  c."setId" AS "setId",
  c."imageSmall" AS "imageSmall",
  c."imageLarge" AS "imageLarge",
  s.id AS "setIdSet",
  s.name AS "setName",
  s.series AS "setSeries",
  s."printedTotal" AS "setPrintedTotal",
  s.total AS "setTotal",
  s."releaseDate" AS "setReleaseDate",
  s."logoUrl" AS "setLogoUrl",
  s."symbolUrl" AS "setSymbolUrl"
`;

/**
 * Una fila de `getSetCards`. `cardCount` es el `COUNT(*) OVER ()`: el total real
 * del set sin pagar una segunda query de conteo.
 */
interface SetCardRow extends CardSearchRow {
  cardCount: number;
}

/**
 * Una fila de `referencePrices`: la última cotización **anterior** a la ventana,
 * de esa variante.
 */
interface ReferencePriceRow {
  variant: string;
  market: Prisma.Decimal | null;
  mid: Prisma.Decimal | null;
  fetchedAt: Date;
}

/** Una fila de `priceHistory`: un día, con la cotización elegida de ese día. */
interface PriceHistoryRow {
  date: string;
  market: Prisma.Decimal | null;
  low: Prisma.Decimal | null;
  mid: Prisma.Decimal | null;
  high: Prisma.Decimal | null;
  fetchedAt: Date;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function toIso(value: Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const numeric = Number(value as { toString(): string });
  return Number.isFinite(numeric) ? numeric : null;
}

function toArs(usd: number | null, rate: number): number | null {
  if (usd === null) return null;
  return Math.round(usd * rate * 100) / 100;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * El precio de referencia de una fila: `market` y, si no hay, `mid`.
 *
 * Es la **misma** precedencia que usa el cliente para elegir la cifra del hero
 * (`heroPriceUsd` en `components/v2/prices/card-price-section.tsx`): el número
 * que se muestra arriba es el `market` de la primera variante que lo tenga, y
 * el `mid` es el respaldo. Comparar otra cosa que no sea el número en pantalla
 * haría que la píldora "-73 %" y la cifra no se puedan discutir entre sí.
 */
function referenceValue(price: {
  market: number | null;
  mid: number | null;
}): { field: 'market' | 'mid'; value: number } | null {
  if (price.market !== null && Number.isFinite(price.market)) {
    return { field: 'market', value: price.market };
  }
  if (price.mid !== null && Number.isFinite(price.mid)) {
    return { field: 'mid', value: price.mid };
  }
  return null;
}

/**
 * El delta de la ventana, o `null` cuando no hay nada honesto que decir.
 *
 * ## Las reglas, una por una
 *
 * 1. **Misma columna en los dos extremos.** El extremo "ahora" se resuelve con
 *    `market ?? mid`; el de referencia tiene que ser **el mismo campo** de la
 *    fila vieja. Comparar el `market` de hoy contra el `mid` de hace 30 días
 *    mide un cambio de método de valuación, no de precio.
 * 2. **La referencia es la última fila anterior a la ventana**, no una
 *    interpolación. Si no hay ninguna, no hay delta.
 * 3. **Referencia demasiado vieja → `null`.** Una carta cuyo último dato es de
 *    hace 8 meses no tiene un delta "de 30 días" que mostrar.
 * 4. **Precio actual viejo → `null`.** El cliente marca como viejo lo que pasa
 *    de 24 h (`PRICE_MAX_AGE_MS`) y muestra un aviso; acompañar ese aviso con
 *    una variación precisa de 30 días sería decir dos cosas distintas sobre el
 *    mismo número en la misma pantalla.
 * 5. **División por cero → `null`**, no `0`. Un `0 %` afirma que el precio no se
 *    movió, que es un dato; un `null` dice que no se puede saber.
 *
 * El `percent` sale con **cero decimales** (lo que muestra la referencia) y con
 * redondeo simétrico: `Math.round(-72.5)` da `-72` en JS, y "cayó 73 %" con un
 * -72.5 exacto debería decir -73.
 */
function priceChange(
  current: CardPriceDto,
  reference: ReferencePriceRow | null,
): PriceChangeDto | null {
  const now = referenceValue(current);
  if (now === null || reference === null) return null;

  const fetchedAt = current.fetchedAt ? Date.parse(current.fetchedAt) : Number.NaN;
  if (!Number.isFinite(fetchedAt)) return null;
  if (Date.now() - fetchedAt > PRICE_MAX_AGE_MS) return null;

  const referenceDate = new Date(reference.fetchedAt).getTime();
  if (!Number.isFinite(referenceDate)) return null;
  if (Date.now() - referenceDate > CHANGE_MAX_REFERENCE_AGE_DAYS * 24 * 60 * 60 * 1000) {
    return null;
  }

  const previous = toNumber(
    now.field === 'market' ? reference.market : reference.mid,
  );
  if (previous === null || previous === 0) return null;

  const usd = now.value - previous;
  const percent = (usd / previous) * 100;

  return {
    usd: round2(usd),
    percent: percent < 0 ? -Math.round(-percent) : Math.round(percent),
    windowDays: CHANGE_WINDOW_DAYS,
    from: new Date(referenceDate).toISOString(),
  };
}

/**
 * La ventana efectiva de la serie, recortada a 7..365 días.
 *
 * Se **recorta** en vez de fallar: `?days=5000` es alguien que quiere todo lo que
 * haya, y un 400 lo obliga a adivinar el tope. Abajo de una semana la "serie"
 * son un par de puntos sueltos, que no es un histórico; arriba de un año el
 * payload crece sin que el gráfico cambie (una fila por día, y el refresco
 * diario es el techo real de cuántos puntos hay).
 */
function resolveHistoryWindow(days: number | undefined): number {
  if (days === undefined) return PRICE_HISTORY_DEFAULT_DAYS;
  return Math.min(Math.max(days, PRICE_HISTORY_MIN_DAYS), PRICE_HISTORY_MAX_DAYS);
}

/**
 * El delta agregado de una serie, o `null` cuando no hay nada honesto que decir.
 *
 * Se compara **el primer punto con `market` contra el último**, no contra el
 * precio actual ni contra una interpolación:
 *
 * - **Sin puntos con `market`, o con uno solo → `null`.** Un delta necesita dos
 *   extremos: con un punto el "cambio" sería `0 %`, que afirma que el precio no
 *   se movió. Con la historia de `card_prices` de hoy (unos días) este es el caso
 *   más común, y por eso la respuesta tiene que poder decir "no sé" en vez de
 *   mentir con un cero.
 * - **El primero en `0` → `null`**, por división por cero.
 * - **Dos extremos iguales → `{ 0, 0 }`**: ahí sí sabemos que no se movió, y un
 *   `null` lo escondería.
 *
 * Solo se usa `market`, la misma columna que suma el `totalValueUsd` de una
 * colección: una serie en la que un día el número es `mid` y al día siguiente
 * `market` mide un cambio de método de valuación, no de precio.
 */
function windowChange(
  points: PriceHistoryPointDto[],
): PriceWindowChangeDto | null {
  const withMarket = points.filter(
    (point): point is PriceHistoryPointDto & { market: number } => point.market !== null,
  );
  if (withMarket.length < 2) return null;

  const first = withMarket[0]!;
  const last = withMarket[withMarket.length - 1]!;
  if (first.market === 0) return null;

  const changeUsd = last.market - first.market;
  const changePercent = (changeUsd / first.market) * 100;

  return {
    changeUsd: round2(changeUsd),
    // Redondeo simétrico: `Math.round(-72.5)` da -72, y "cayó 73 %" con un -72.5
    // exacto debería decir -73. Misma regla que `priceChange`.
    changePercent: changePercent < 0 ? -Math.round(-changePercent) : Math.round(changePercent),
  };
}

function toSetDto(row: {
  id: string;
  name: string;
  series: string | null;
  printedTotal: number | null;
  total: number | null;
  releaseDate: Date | null;
  logoUrl: string | null;
  symbolUrl: string | null;
}): SetDto {
  return {
    id: row.id,
    name: row.name,
    series: row.series,
    printedTotal: row.printedTotal,
    total: row.total,
    releaseDate: toIso(row.releaseDate),
    logoUrl: row.logoUrl,
    symbolUrl: row.symbolUrl,
  };
}

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncPrices: SyncPricesService,
    private readonly currency: CurrencyService,
  ) {}

  async search(dto: SearchCardsDto): Promise<Paginated<CardDto>> {
    const page = dto.page ?? DEFAULT_PAGE;
    const pageSize = dto.pageSize ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const query = dto.q?.trim() ? dto.q.trim() : undefined;
    const searchBy = dto.searchBy ?? 'name';
    // El modo `number` no usa trigram: matchea por igualdad (ver
    // `buildNumberCondition`), y un `set_config` en una transacción que no lo
    // necesita es solo overhead.
    const useTrigram = searchBy !== 'number' && query !== undefined && query.length >= TRIGRAM_MIN_LENGTH;
    const byPrice = this.wantsPriceOrder(dto, query !== undefined);

    const conditions = this.buildFilters(dto);
    if (query) conditions.unshift(this.buildTextCondition(query, useTrigram, searchBy));
    const where =
      conditions.length > 0
        ? Prisma.sql` WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const run = async (client: Prisma.TransactionClient, parallel: boolean) => {
      const selectRows = () =>
        client.$queryRaw<CardSearchRow[]>(Prisma.sql`
          SELECT
            ${CARD_SEARCH_COLUMNS}
            ${query ? Prisma.sql`, ${this.buildScore(query, useTrigram, searchBy)} AS score` : Prisma.empty}
          FROM cards c
          LEFT JOIN card_sets s ON s.id = c."setId"
          ${where}
          ORDER BY ${this.buildOrderBy(dto, query !== undefined, searchBy)}
          LIMIT ${pageSize} OFFSET ${offset}
        `);
      const countRows = () =>
        client.$queryRaw<{ count: number }[]>(Prisma.sql`
          SELECT COUNT(*)::int AS count
          FROM cards c
          ${where}
        `);

      // `parallel` solo vale afuera de una transacción. La interactiva de
      // Prisma (el `set_config` de trigram) usa **una** conexión: las dos
      // consultas comparten el mismo `pg_backend_pid()` y el motor las encola,
      // así que el `Promise.all` no paraleliza nada, sólo esconde que el orden
      // de ejecución es el mismo que el de las líneas. Verificado, no supuesto.
      const [rows, counts] = parallel
        ? await Promise.all([selectRows(), countRows()])
        : [await selectRows(), await countRows()];

      return { rows, total: counts[0]?.count ?? 0 };
    };

    const { rows, total } = byPrice
      ? await this.searchByCurrentPrice(dto, conditions, pageSize, offset)
      : useTrigram
        ? await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw(
              Prisma.sql`SELECT set_config('pg_trgm.similarity_threshold', ${TRIGRAM_THRESHOLD}, true)`,
            );
            return run(tx, false);
          })
        : await run(this.prisma, true);

    return {
      data: rows.map((row) => this.toCardDto(row)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * `sort=price` sobre el catálogo entero, partido en dos tramos.
   *
   * El orden público pone primero las cartas con precio y las que no tienen
   * cotización al final, alfabéticas. Casi ninguna carta del catálogo tiene
   * precio actual (60 de 20.670), así que un `LEFT JOIN` + `ORDER BY` global
   * gastaba un seq scan de la tabla ancha y un sort de 20k filas para devolver
   * 24. Acá se consulta primero el conjunto chico de cotizadas y sólo, si la
   * página llega al final de ese tramo, se entra al de las sin precio.
   *
   * ## Dos round-trips en la página habitual, tres en el cruce
   *
   * 1. El `SELECT` del tramo cotizado.
   * 2. En paralelo, un statement con los dos conteos (`total` y cuántas
   *    cotizadas hay): son dos subescalares del mismo `SELECT`, así que salen
   *    en una sola ida y vuelta, y el `MATERIALIZED` evita repetir el
   *    `DISTINCT ON` de `card_prices`.
   * 3. Sólo si el tramo cotizado no llenó la página, el `SELECT` del tramo sin
   *    precio, con el offset corrido por las cotizadas que ya se devolvieron.
   *
   * ## Por qué el desempate no necesita dirección
   *
   * `NULLS LAST` explícito en el `ORDER BY` viejo era necesario porque el
   * `LEFT JOIN` metía las ~20.600 cartas sin precio en el mismo sort: en `DESC`
   * el default de Postgres (`NULLS FIRST`) las hubiera puesto arriba. Acá cada
   * tramo se ordena solo, así que el precio nunca es `NULL` dentro del primero
   * y `NULLS LAST` no tiene a qué aplicarse. Las dos direcciones comparten
   * entonces el mismo criterio de desempate: `name ASC, id ASC`, que es
   * exactamente lo que aplicaba el `ORDER BY` viejo.
   */
  private async searchByCurrentPrice(
    dto: SearchCardsDto,
    conditions: Prisma.Sql[],
    pageSize: number,
    offset: number,
  ): Promise<{ rows: CardSearchRow[]; total: number }> {
    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;
    const direction: Prisma.Sql =
      dto.direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    const [counts, priced] = await Promise.all([
      this.prisma.$queryRaw<{ total: number; priced: number }[]>(Prisma.sql`
        WITH current_prices AS MATERIALIZED (${CURRENT_CARD_MARKET_PRICES})
        SELECT
          (SELECT COUNT(*)::int FROM cards c ${where}) AS total,
          (
            SELECT COUNT(*)::int
            FROM current_prices cp
            JOIN cards c ON c.id = cp."cardId"
            ${where}
          ) AS priced
      `),
      this.prisma.$queryRaw<CardSearchRow[]>(Prisma.sql`
        WITH current_prices AS MATERIALIZED (${CURRENT_CARD_MARKET_PRICES})
        SELECT ${CARD_SEARCH_COLUMNS}
        FROM current_prices cp
        JOIN cards c ON c.id = cp."cardId"
        LEFT JOIN card_sets s ON s.id = c."setId"
        ${where}
        ORDER BY cp.price ${direction}, c.name ASC, c.id ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
    ]);

    const total = counts[0]?.total ?? 0;
    const pricedCount = counts[0]?.priced ?? 0;

    if (priced.length >= pageSize) {
      return { rows: priced, total };
    }

    // La página cruzó el límite entre los dos tramos (o cayó entera en el
    // segundo). `offset - pricedCount` saltea las cotizadas que ya salieron
    // arriba: sin ese corrimiento, la página 4 repetiría el comienzo de la sin
    // precio y la paginación mostraría repetidos.
    const unpricedOffset = Math.max(0, offset - pricedCount);
    const unpricedWhere =
      conditions.length > 0
        ? Prisma.sql`${where} AND NOT EXISTS (SELECT 1 FROM current_prices cp WHERE cp."cardId" = c.id)`
        : Prisma.sql`WHERE NOT EXISTS (SELECT 1 FROM current_prices cp WHERE cp."cardId" = c.id)`;
    const unpriced = await this.prisma.$queryRaw<CardSearchRow[]>(Prisma.sql`
      WITH current_prices AS MATERIALIZED (${CURRENT_CARD_MARKET_PRICES})
      SELECT ${CARD_SEARCH_COLUMNS}
      FROM cards c
      LEFT JOIN card_sets s ON s.id = c."setId"
      ${unpricedWhere}
      ORDER BY c.name ASC, c.id ASC
      LIMIT ${pageSize - priced.length} OFFSET ${unpricedOffset}
    `);

    return { rows: [...priced, ...unpriced], total };
  }

  async getById(id: string): Promise<CardDto> {
    // La ficha solo usa estos campos: `include: { set: true }` también leía los
    // rawJson completos de carta y set, aunque se descartaban al armar el DTO.
    const card = await this.prisma.card.findUnique({
      where: { id },
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
    });

    if (!card) {
      throw new NotFoundException(`Carta no encontrada: ${id}`);
    }

    return {
      id: card.id,
      name: card.name,
      supertype: card.supertype,
      subtypes: card.subtypes,
      hp: card.hp,
      types: card.types,
      number: card.number,
      rarity: card.rarity,
      artist: card.artist,
      setId: card.setId,
      set: toSetDto(card.set),
      imageSmall: card.imageSmall,
      imageLarge: card.imageLarge,
    };
  }

  /**
   * `GET /cards/:id/prices`.
   *
   * Si viene `?currency=ARS`, agrega `priceArs` a cada precio usando el rate
   * que ya está en Redis (`getCachedRate`, que JAMÁS llama a DolarApi). Es
   * público y sin usuario, así que pegarle a la API externa por request
   * multiplicaría la latencia sin necesidad: la conversión normal la hace el
   * cliente con el rate de `GET /currency/usd-ars`.
   */
  async getCardWithPrices(
    id: string,
    query: CardPricesQueryDto = {},
  ): Promise<CardWithPricesDto> {
    const card = await this.getById(id);
    // El histórico y los precios actuales son independientes: el primero solo
    // lee `card_prices` y el segundo puede pegarle a tcgdex. Van en paralelo
    // para que el delta no sume una ida y vuelta a la latencia.
    const [prices, reference] = await Promise.all([
      this.syncPrices.getPricesForCard(id),
      this.referencePrices(id),
    ]);

    const rate = await this.resolveRate(query);
    const view = prices.map((price) => {
      const dto: CardPriceDto = {
        cardId: price.cardId,
        variant: price.variant,
        low: toNumber(price.low),
        mid: toNumber(price.mid),
        high: toNumber(price.high),
        market: toNumber(price.market),
        currency: price.currency,
        source: price.source,
        fetchedAt: toIso(price.fetchedAt) ?? new Date(0).toISOString(),
      };

      dto.change = priceChange(dto, reference.get(price.variant) ?? null);
      // Los campos planos son el **mismo** delta con los nombres que consume la
      // píldora del cliente (`PriceDelta`). Se derivan, no se recalculan: dos
      // cálculos del mismo número divergen apenas una regla cambia.
      dto.changeUsd = dto.change?.usd ?? null;
      dto.changePercent = dto.change?.percent ?? null;
      dto.windowLabel = dto.change === null ? null : CHANGE_WINDOW_LABEL;

      // Espejo de los campos USD: un precio tiene 4 valores, no 1.
      if (rate) {
        dto.priceArs = {
          low: toArs(dto.low, rate.rate),
          mid: toArs(dto.mid, rate.rate),
          high: toArs(dto.high, rate.rate),
          market: toArs(dto.market, rate.rate),
        };
      }

      return dto;
    });

    const result: CardWithPricesDto = { card, prices: view };
    if (rate) {
      result.conversion = {
        rate: rate.rate,
        rateType: rate.rateType,
        fetchedAt: rate.fetchedAt,
        stale: rate.stale,
      };
    }

    return result;
  }

  /**
   * `GET /cards/:id/prices/history`: la serie de precios, **una fila por día**.
   *
   * ## No hay tabla nueva, y por qué
   *
   * `card_prices` ya es append-only con `@@index([cardId, variant, fetchedAt])`:
   * una carta refrescada seis veces el mismo día tiene seis filas y la historia
   * ya está guardada. El histórico se arma **en el momento**, con un `DISTINCT ON`
   * sobre el día. Una tabla de snapshots diarios obligaría a backfillear lo que
   * ya está, a escribirla en cada refresco y a conservarla para siempre: mismo
   * dato, un día de atraso y un job más.
   *
   * ## No llama a nadie externo
   *
   * Es la única parte del sistema de precios que **no** toca tcgdex ni pokemontcg.io
   * (`AGENTS.md` §3.1): lee Postgres y nada más. Por eso puede ser pública y
   * estar en el camino caliente de la ficha de carta.
   *
   * La carta va en paralelo con la serie: `getById` es un index lookup por PK que
   * además tira el 404 si el id no está en el catálogo, así que consultarlo no
   * cuesta un round-trip extra.
   */
  async getPriceHistory(
    id: string,
    query: PriceHistoryQueryDto = {},
  ): Promise<PriceHistoryDto> {
    const windowDays = resolveHistoryWindow(query.days);
    const from = new Date(Date.now() - windowDays * DAY_MS);

    const [card, rows] = await Promise.all([
      this.getById(id),
      this.priceHistoryRows(id, query.variant ?? null, from),
    ]);

    const points: PriceHistoryPointDto[] = rows.map((row) => ({
      date: row.date,
      fetchedAt: toIso(row.fetchedAt) ?? row.date,
      market: toNumber(row.market),
      low: toNumber(row.low),
      mid: toNumber(row.mid),
      high: toNumber(row.high),
    }));

    const withMarket = points.filter(
      (point): point is PriceHistoryPointDto & { market: number } => point.market !== null,
    );

    return {
      cardId: card.id,
      variant: query.variant ?? null,
      currency: 'USD',
      windowDays,
      from: withMarket[0]?.date ?? null,
      to: withMarket[withMarket.length - 1]?.date ?? null,
      points,
      change: windowChange(points),
    };
  }

  /**
   * Un punto por día de la serie.
   *
   * El `DISTINCT ON (day)` es el que colapsa las N filas del día a una, y el
   * `ORDER BY` de adentro **empieza por `day`** porque si no Postgres agrupa por
   * otra cosa y devuelve una serie silenciosamente distinta (gotcha 16). El
   * `ORDER BY` de afuera vuelve a subir: el `DISTINCT ON` trabaja al revés
   * (`fetchedAt DESC` para ganar con la última del día) y la respuesta tiene que
   * ser cronológica.
   *
   * Sin `variant`, el criterio del día es `market DESC`: la **mejor** cotización
   * disponible de la carta ese día, el mismo "mejor precio disponible" que usa
   * `sort=price` del catálogo. Es lo que evita que una carta que solo tiene
   * `reverseHolofoil` devuelva una serie vacía.
   *
   * El `AND "fetchedAt" >= from` no es una optimización: es lo que acota la
   * respuesta a `windowDays` filas (una por día) y lo que deja al índice
   * `card_prices(cardId, variant, fetchedAt)` recortar la ventana en vez de
   * recorrer el histórico entero de la carta.
   */
  private async priceHistoryRows(
    cardId: string,
    variant: string | null,
    from: Date,
  ): Promise<PriceHistoryRow[]> {
    const variantFilter =
      variant === null ? Prisma.empty : Prisma.sql`AND p.variant = ${variant}`;
    const pickOfTheDay =
      variant === null
        ? Prisma.sql`s.market DESC NULLS LAST, s."fetchedAt" DESC`
        : Prisma.sql`s."fetchedAt" DESC`;

    return this.prisma.$queryRaw<PriceHistoryRow[]>(Prisma.sql`
      SELECT
        latest.day::text AS "date",
        latest.market AS "market",
        latest.low AS "low",
        latest.mid AS "mid",
        latest.high AS "high",
        latest."fetchedAt" AS "fetchedAt"
      FROM (
        SELECT DISTINCT ON (day)
          day, s.market, s.low, s.mid, s.high, s."fetchedAt"
        FROM (
          SELECT
            (p."fetchedAt" AT TIME ZONE 'UTC')::date AS day,
            p.market AS market,
            p.low AS low,
            p.mid AS mid,
            p.high AS high,
            p."fetchedAt" AS "fetchedAt"
          FROM card_prices p
          WHERE p."cardId" = ${cardId}
            AND p."fetchedAt" >= ${from}
            ${variantFilter}
        ) s
        ORDER BY day, ${pickOfTheDay}
      ) latest
      ORDER BY latest.day ASC
    `);
  }

  /**
   * El precio de referencia de la ventana, por variante: **la fila más reciente
   * que ya era más vieja que la ventana**.
   *
   * No se interpola ni se usa la fila actual: si la carta solo tiene precios
   * de esta semana, no hay referencia y el delta es `null`. Devolver el precio
   * actual como si fuera el de hace 30 días convertiría "cayó 73 %" en "cayó
   * 0 %" sin que nadie entienda por qué.
   *
   * El filtro por `fetchedAt < cutoff` es lo que garantiza que la fila elegida
   * sea **otra** fila y no la actual, y de paso es lo que le permite al índice
   * `card_prices(cardId, variant, fetchedAt)` cortar por la ventana en vez de
   * recorrer todo el histórico de la variante.
   */
  private async referencePrices(
    cardId: string,
  ): Promise<Map<string, ReferencePriceRow>> {
    const cutoff = new Date(
      Date.now() - CHANGE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const rows = await this.prisma.$queryRaw<ReferencePriceRow[]>(Prisma.sql`
      SELECT DISTINCT ON (p.variant)
        p.variant AS "variant",
        p.market AS "market",
        p.mid AS "mid",
        p."fetchedAt" AS "fetchedAt"
      FROM card_prices p
      WHERE p."cardId" = ${cardId}
        AND p."fetchedAt" < ${cutoff}
      ORDER BY p.variant, p."fetchedAt" DESC
    `);

    const result = new Map<string, ReferencePriceRow>();
    for (const row of rows) result.set(row.variant, row);
    return result;
  }

  /** Rate desde Redis, o `null` si ARS está deshabilitado / no está cacheado. */
  private async resolveRate(query: CardPricesQueryDto): Promise<RateView | null> {
    if (query.currency !== 'ARS') return null;
    return this.currency.getCachedRate(query.rateType ?? 'blue');
  }

  async findAllSets(): Promise<SetDto[]> {
    const sets = await this.prisma.cardSet.findMany({
      orderBy: [{ releaseDate: 'desc' }, { name: 'asc' }],
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
    });

    return sets.map(toSetDto);
  }

  /**
   * `GET /sets/:id/cards` (B8), público como `GET /sets`.
   *
   * El catálogo ya está expuesto por `/cards/search?setId=`, así que no agrega
   * superficie pública nueva: solo deja de obligar al binder a paginar de a 100.
   *
   * El orden es el mismo `NUMERIC_NUMBER` que usa `sort: 'number'` en la
   * búsqueda, para que los slots salgan en el orden impreso en vez de por
   * nombre. Va `NULLS LAST` porque los números no numéricos (`TM01`) no se
   * pueden ordenar numéricamente, y `c.name` desempata los que empatan.
   *
   * El set y las cartas van en paralelo: el set es una lectura por PK y las
   * cartas usan el índice de `cards."setId"`, así que las dos se resuelven en
   * una ida y vuelta.
   */
  async getSetCards(setId: string): Promise<SetCardsResponseDto> {
    const [set, rows] = await Promise.all([
      this.prisma.cardSet.findUnique({ where: { id: setId } }),
      this.prisma.$queryRaw<SetCardRow[]>(Prisma.sql`
        SELECT
          c.id,
          c.name,
          c.supertype,
          c.subtypes,
          c.hp,
          c.types,
          c.number,
          c.rarity,
          c.artist,
          c."setId" AS "setId",
          c."imageSmall" AS "imageSmall",
          c."imageLarge" AS "imageLarge",
          s.id AS "setIdSet",
          s.name AS "setName",
          s.series AS "setSeries",
          s."printedTotal" AS "setPrintedTotal",
          s.total AS "setTotal",
          s."releaseDate" AS "setReleaseDate",
          s."logoUrl" AS "setLogoUrl",
          s."symbolUrl" AS "setSymbolUrl",
          COUNT(*) OVER ()::int AS "cardCount"
        FROM cards c
        LEFT JOIN card_sets s ON s.id = c."setId"
        WHERE c."setId" = ${setId}
        ORDER BY ${NUMERIC_NUMBER} ASC NULLS LAST, c.name ASC
      `),
    ]);

    if (!set) {
      throw new NotFoundException(`Set no encontrado: ${setId}`);
    }

    return {
      set: toSetDto(set),
      cards: rows.map((row) => this.toCardDto(row)),
      total: rows[0]?.cardCount ?? 0,
    };
  }

  private toCardDto(row: CardSearchRow): CardDto {
    const card: CardDto = {
      id: row.id,
      name: row.name,
      supertype: row.supertype,
      subtypes: row.subtypes ?? [],
      hp: row.hp,
      types: row.types ?? [],
      number: row.number,
      rarity: row.rarity,
      artist: row.artist,
      setId: row.setId,
      imageSmall: row.imageSmall,
      imageLarge: row.imageLarge,
    };

    if (row.setIdSet !== null && row.setName !== null) {
      card.set = toSetDto({
        id: row.setIdSet,
        name: row.setName,
        series: row.setSeries,
        printedTotal: row.setPrintedTotal,
        total: row.setTotal,
        releaseDate: row.setReleaseDate,
        logoUrl: row.setLogoUrl,
        symbolUrl: row.setSymbolUrl,
      });
    }

    return card;
  }

  private buildFilters(dto: SearchCardsDto): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [];

    if (dto.setId) {
      conditions.push(Prisma.sql`c."setId" = ${dto.setId}`);
    }
    if (dto.rarity) {
      conditions.push(Prisma.sql`c.rarity ILIKE ${dto.rarity}`);
    }
    if (dto.supertype) {
      conditions.push(Prisma.sql`c.supertype ILIKE ${dto.supertype}`);
    }
    if (dto.type) {
      conditions.push(Prisma.sql`c.types @> ARRAY[${dto.type}]::text[]`);
    }

    return conditions;
  }

  private buildTextCondition(
    query: string,
    useTrigram: boolean,
    searchBy: CardSearchField,
  ): Prisma.Sql {
    if (searchBy === 'number') {
      return this.buildNumberCondition(query);
    }

    const column = searchBy === 'artist' ? Prisma.sql`c.artist` : Prisma.sql`c.name`;
    const contains = Prisma.sql`${column} ILIKE ${`%${escapeLike(query)}%`} ESCAPE '\\'`;

    if (!useTrigram) {
      return contains;
    }

    return Prisma.sql`(${contains} OR ${column} % ${query})`;
  }

  /**
   * Modo `number`: **igualdad** sobre el token entero, no substring.
   *
   * `cards.number` es un token corto y repetido (`"4"` aparece en 163 sets), no
   * un texto. Un `ILIKE '%4%'` devolvería el 4, el 40, el 104 y el 4a, que es
   * exactamente lo que el usuario no pidió; y `similarity('4','40')` es altísimo,
   * así que el trigram tampoco ayuda. La igualdad también es la única forma de
   * que el `total` del resultado signifique algo ("cuántas cartas se llaman 4").
   *
   * Se normaliza el input (trim y `#` inicial, que la gente escribe) y se
   * compara con `ILIKE` sin comodines, o sea igualdad case-insensitive: así
   * `"tg02"` encuentra `"TG02"` y `"4A"` encuentra `"4a"`. El `@@index([number])`
   * del schema lo resuelve con un Bitmap Index Scan (2 ms sobre 20.670 cartas),
   * así que no hace falta un índice trigram acá.
   */
  private buildNumberCondition(query: string): Prisma.Sql {
    const token = query.trim().replace(/^#/, '').trim();
    return Prisma.sql`c.number ILIKE ${token}`;
  }

  private buildScore(
    query: string,
    useTrigram: boolean,
    searchBy: CardSearchField,
  ): Prisma.Sql {
    // Todos los resultados de `number` son matcheos exactos: no hay nada que
    // rankear y un score derivado del nombre sería ruido.
    if (searchBy === 'number') {
      return Prisma.sql`1::float8`;
    }

    const column = searchBy === 'artist' ? Prisma.sql`c.artist` : Prisma.sql`c.name`;
    const prefix = `${escapeLike(query)}%`;
    const contains = `%${escapeLike(query)}%`;

    return Prisma.sql`GREATEST(
      CASE WHEN ${column} ILIKE ${prefix} ESCAPE '\\' THEN ${PREFIX_SCORE}::float8 ELSE 0 END,
      CASE WHEN ${column} ILIKE ${contains} ESCAPE '\\' THEN ${SUBSTRING_SCORE}::float8 ELSE 0 END,
      ${useTrigram ? Prisma.sql`similarity(${column}, ${query})` : Prisma.sql`0::float8`}
    )`;
  }

  /** `sort=price` solo aplica sin texto: con `q` manda el score de relevancia. */
  private wantsPriceOrder(dto: SearchCardsDto, hasQuery: boolean): boolean {
    return !hasQuery && dto.sort === 'price';
  }

  private buildOrderBy(
    dto: SearchCardsDto,
    hasQuery: boolean,
    searchBy: CardSearchField,
  ): Prisma.Sql {
    if (hasQuery) {
      // Buscar por número no es rankear: todas las filas matchean igual, así que
      // el score es constante y lo útil es agrupar por set y ordenar por número
      // (Base 4, Jungle 4, Fossil 4...) en vez de alfabética por nombre.
      if (searchBy === 'number') {
        return Prisma.sql`s.name ASC, ${NUMERIC_NUMBER} ASC NULLS LAST, c.id ASC`;
      }
      return Prisma.sql`score DESC, c.name ASC, c.id ASC`;
    }

    const dir: Prisma.Sql = dto.direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    switch (dto.sort) {
      case 'rarity':
        return Prisma.sql`c.rarity ${dir} NULLS LAST, c.name ASC`;
      case 'number':
        return Prisma.sql`${NUMERIC_NUMBER} ${dir} NULLS LAST, c.name ASC`;
      case 'price':
        // `NULLS LAST` explícito en las dos direcciones: sin precio son ~20.600
        // cartas y en `DESC` el default de Postgres (NULLS FIRST) las pondría
        // arriba, que es lo opuesto de "más caras primero". Al final siempre:
        // la lista ordena por un criterio, no muestra quién no tiene dato.
        return Prisma.sql`cp."price" ${dir} NULLS LAST, c.name ASC, c.id ASC`;
      case 'name':
      default:
        return Prisma.sql`c.name ${dir}, c.id ASC`;
    }
  }
}
