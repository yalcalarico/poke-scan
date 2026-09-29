import type {
  CardCondition,
  CardVariant,
  CollectionDto,
  CollectionItemDto,
  CollectionStatsDto,
  Paginated,
} from '@/types/api';
import { apiFetch, buildQueryString } from './api-client';

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
): Promise<Paginated<CollectionItemDto>> {
  return apiFetch<Paginated<CollectionItemDto>>(
    `/collections/${encodeURIComponent(collectionId)}/items${buildQueryString(params)}`,
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
