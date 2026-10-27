import type {
  CardCondition,
  CardSort,
  CardVariant,
  CardLocationDto,
  CollectionDto,
  CollectionItemDto,
  CollectionStatsDto,
  Paginated,
  PortfolioDto,
} from '@/types/api';
import { hasValidPriceMetadata, toCollectionDto, toCollectionStatsDto, toPortfolioDto } from './schema';
import { ApiError, apiFetch, buildQueryString } from './api-client';

export type { CardSort } from '@/types/api';

export interface CollectionStatsResponse extends CollectionStatsDto {
  cardsMissingPrice?: number;
}

export interface ListItemsParams {
  page?: number;
  pageSize?: number;
  duplicatesOnly?: boolean;
  /** Solo items con `isForTrade`. Compone con `duplicatesOnly`. */
  forTradeOnly?: boolean;
  setId?: string;
  search?: string;
  /**
   * Orden del listado, **server-side**.
   *
   * Los cuatro valores son los de `CardSort` (`/cards/search?sort=`) para que el
   * selector de orden de la app sea uno solo y no dos listas que se desincronicen,
   * pero acá cada uno ordena **ítems**:
   *
   * | `sort` | Ordena por |
   * |---|---|
   * | `name` | `card.name` |
   * | `rarity` | `card.rarity`, las cartas sin rareza al final |
   * | `number` | la parte **numérica** de `card.number`: 4 antes que 10 antes que 4a |
   * | `price` | el valor del ítem (`quantity × market`), **siempre de más a menos** |
   *
   * `undefined` = el orden por defecto del backend (`addedAt DESC`), que es el
   * que la app muestra por defecto. **No** se manda un valor para pedir "el
   * default": mandar `'addedAt'` no está en la lista y el `ValidationPipe` lo
   * rechazaría con un 400.
   *
   * No hay parámetro de sentido: `price` es siempre descendente porque la
   * pregunta que responde es "¿cuál de mis cartas vale más?", y esa no tiene
   * respuesta ascendente.
   */
  sort?: CardSort;
}

export interface CreateCollectionPayload {
  name: string;
  isDefault?: boolean;
}

export interface UpdateCollectionPayload {
  name?: string;
  isDefault?: boolean;
}

export interface AddItemPayload {
  cardId: string;
  variant?: CardVariant;
  condition?: CardCondition;
  quantity?: number;
  notes?: string;
  /**
   * El checkbox del alta. Estaba en el formulario y **no se mandaba**: el
   * backend no tenía el campo, `whitelist: true` lo descartaba en silencio, y la
   * carta entraba sin la marca. Ahora viaja como el resto del payload.
   */
  isForTrade?: boolean;
}

export interface UpdateItemPayload {
  quantity?: number;
  isForTrade?: boolean;
  notes?: string | null;
  variant?: CardVariant;
  condition?: CardCondition;
}

export async function listCollections(): Promise<CollectionDto[]> {
  const raw = await apiFetch<unknown>('/collections', { cache: 'no-store' });
  if (!Array.isArray(raw)) throw new ApiError(502, 'No pudimos leer tus colecciones');
  return raw.map((entry) => requireParsed(toCollectionDto(entry)));
}

function requireParsed<T>(result: T | null): T {
  if (result === null) throw new ApiError(502, 'No pudimos leer la valoración recibida');
  return result;
}

export async function getPortfolio(signal?: AbortSignal): Promise<PortfolioDto> {
  return requireParsed(toPortfolioDto(await apiFetch<unknown>('/portfolio', { signal, cache: 'no-store' })));
}

export async function getCollection(id: string): Promise<CollectionDto> {
  return requireParsed(toCollectionDto(await apiFetch<unknown>(`/collections/${encodeURIComponent(id)}`, { cache: 'no-store' })));
}

export async function createCollection(payload: CreateCollectionPayload): Promise<CollectionDto> {
  return requireParsed(toCollectionDto(await apiFetch<unknown>('/collections', { method: 'POST', body: payload })));
}

export async function updateCollection(
  id: string,
  payload: UpdateCollectionPayload,
): Promise<CollectionDto> {
  return requireParsed(toCollectionDto(await apiFetch<unknown>(`/collections/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: payload,
  })));
}

export function deleteCollection(id: string): Promise<void> {
  return apiFetch<void>(`/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function refreshCollectionPrices(id: string, signal?: AbortSignal): Promise<{ queued: number }> {
  const result = await apiFetch<{ queued: number }>(`/collections/${encodeURIComponent(id)}/refresh-prices`, { method: 'POST', signal });
  if (!result || !Number.isInteger(result.queued) || result.queued < 0) throw new ApiError(502, 'No pudimos confirmar la actualización de precios');
  return result;
}

function validateItemPrice(item: CollectionItemDto): CollectionItemDto {
  if (item && !hasValidPriceMetadata(item.price)) throw new ApiError(502, 'No pudimos leer la referencia de precio');
  return item;
}

export async function listItems(
  collectionId: string,
  params: ListItemsParams = {},
  signal?: AbortSignal,
): Promise<Paginated<CollectionItemDto>> {
  const result = await apiFetch<Paginated<CollectionItemDto>>(
    `/collections/${encodeURIComponent(collectionId)}/items${buildQueryString(params)}`,
    { signal, cache: 'no-store' },
  );
  result.data.forEach(validateItemPrice);
  return result;
}

/**
 * Para recuperar un resultado incierto, reenviá la misma clave y payload.
 * Una clave nueva significa otra alta; quantity en la respuesta es el total
 * actual y no demuestra cuánto sumó este intento. Conservá el intento ante
 * errores de red/5xx/409. Un 410 bloquea el reenvío y no autoriza sumar otra vez.
 */
export async function addItem(
  collectionId: string,
  payload: AddItemPayload,
  idempotencyKey?: string,
): Promise<CollectionItemDto> {
  return validateItemPrice(await apiFetch<CollectionItemDto>(
    `/collections/${encodeURIComponent(collectionId)}/items`,
    {
      method: 'POST',
      body: payload,
      ...(idempotencyKey !== undefined ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
    },
  ));
}

export async function getDuplicates(collectionId: string): Promise<CollectionItemDto[]> {
  const result = await apiFetch<CollectionItemDto[]>(
    `/collections/${encodeURIComponent(collectionId)}/duplicates`,
  );
  return result.map(validateItemPrice);
}

export async function getStats(collectionId: string): Promise<CollectionStatsResponse> {
  return requireParsed(toCollectionStatsDto(await apiFetch<unknown>(
    `/collections/${encodeURIComponent(collectionId)}/stats`, { cache: 'no-store' },
  )));
}

/**
 * Dónde está la carta en las colecciones del usuario
 * (`GET /api/cards/:id/location`).
 *
 * **Autenticada**: sin sesión, `apiFetch` leería el 401 como un token vencido,
 * intentaría un refresh y haría un `window.location.assign('/login')` que
 * recarga la pantalla entera. Por eso la llama solo el `CardActions`, que ya
 * sabe si hay sesión (mismo criterio que el `overview` de `/colecciones/[id]`).
 *
 * `null` significa "la carta existe y no la tenés", que **no** es un error. El
 * backend lo hace explícito con `@Res({ passthrough: true })` + `res.json(null)`:
 * un `return null` de Nest termina la respuesta **sin cuerpo**, y el cliente no
 * podría distinguir eso de un 404. El 404 sí se propaga como `ApiError`, y solo
 * significa "la carta no existe".
 */
export function getCardLocation(cardId: string): Promise<CardLocationDto | null> {
  return apiFetch<CardLocationDto | null>(`/cards/${encodeURIComponent(cardId)}/location`);
}

export async function updateItem(
  itemId: string,
  payload: UpdateItemPayload,
): Promise<CollectionItemDto> {
  return validateItemPrice(await apiFetch<CollectionItemDto>(`/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: payload,
  }));
}

export function deleteItem(itemId: string): Promise<void> {
  return apiFetch<void>(`/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}
