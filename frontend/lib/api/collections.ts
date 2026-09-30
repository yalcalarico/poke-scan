import type {
  CardCondition,
  CardSort,
  CardVariant,
  CardLocationDto,
  CollectionDto,
  CollectionItemDto,
  CollectionStatsDto,
  Paginated,
} from '@/types/api';
import { apiFetch, buildQueryString } from './api-client';

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
}

export interface UpdateItemPayload {
  quantity?: number;
  isForTrade?: boolean;
  notes?: string | null;
  variant?: CardVariant;
  condition?: CardCondition;
}

export function listCollections(): Promise<CollectionDto[]> {
  return apiFetch<CollectionDto[]>('/collections');
}

export function getCollection(id: string): Promise<CollectionDto> {
  return apiFetch<CollectionDto>(`/collections/${encodeURIComponent(id)}`);
}

export function createCollection(payload: CreateCollectionPayload): Promise<CollectionDto> {
  return apiFetch<CollectionDto>('/collections', { method: 'POST', body: payload });
}

export function updateCollection(
  id: string,
  payload: UpdateCollectionPayload,
): Promise<CollectionDto> {
  return apiFetch<CollectionDto>(`/collections/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function deleteCollection(id: string): Promise<void> {
  return apiFetch<void>(`/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function listItems(
  collectionId: string,
  params: ListItemsParams = {},
  signal?: AbortSignal,
): Promise<Paginated<CollectionItemDto>> {
  return apiFetch<Paginated<CollectionItemDto>>(
    `/collections/${encodeURIComponent(collectionId)}/items${buildQueryString(params)}`,
    { signal },
  );
}

export function addItem(
  collectionId: string,
  payload: AddItemPayload,
): Promise<CollectionItemDto> {
  return apiFetch<CollectionItemDto>(
    `/collections/${encodeURIComponent(collectionId)}/items`,
    { method: 'POST', body: payload },
  );
}

export function getDuplicates(collectionId: string): Promise<CollectionItemDto[]> {
  return apiFetch<CollectionItemDto[]>(
    `/collections/${encodeURIComponent(collectionId)}/duplicates`,
  );
}

export function getStats(collectionId: string): Promise<CollectionStatsResponse> {
  return apiFetch<CollectionStatsResponse>(
    `/collections/${encodeURIComponent(collectionId)}/stats`,
  );
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

export function updateItem(
  itemId: string,
  payload: UpdateItemPayload,
): Promise<CollectionItemDto> {
  return apiFetch<CollectionItemDto>(`/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function deleteItem(itemId: string): Promise<void> {
  return apiFetch<void>(`/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}
