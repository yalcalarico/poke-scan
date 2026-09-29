import type { ShareLinkDto, SharedCollectionDto } from '@/types/api';
import { apiFetch } from './api-client';

/** `GET /share` y `POST /share` devuelven más campos que `ShareLinkDto`. */
export interface ShareLink extends ShareLinkDto {
  collectionName: string | null;
  viewCount: number;
  expiresAt: string | null;
}

/** `GET /s/:slug` agrega `truncated` y `sharedAt` a `SharedCollectionDto`. */
export interface PublicSharedCollection extends SharedCollectionDto {
  truncated: boolean;
  sharedAt: string;
}

export interface CreateShareLinkPayload {
  /** Sin valor (o vacío) se comparten todas las colecciones del usuario. */
  collectionId?: string | null;
  expiresInDays?: number;
}

export interface UpdateShareLinkPayload {
  isActive?: boolean;
  expiresInDays?: number;
}

export function listShareLinks(): Promise<ShareLink[]> {
  return apiFetch<ShareLink[]>('/share');
}

export function createShareLink(
  payload: CreateShareLinkPayload = {},
): Promise<ShareLink> {
  return apiFetch<ShareLink>('/share', { method: 'POST', body: payload });
}

export function updateShareLink(
  id: string,
  payload: UpdateShareLinkPayload,
): Promise<ShareLink> {
  return apiFetch<ShareLink>(`/share/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function revokeShareLink(id: string): Promise<void> {
  return apiFetch<void>(`/share/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Ruta pública: no requiere sesión, así que no se adjunta el token. */
export function getPublicCollection(slug: string): Promise<PublicSharedCollection> {
  return apiFetch<PublicSharedCollection>(`/s/${encodeURIComponent(slug)}`, {
    skipAuth: true,
  });
}
