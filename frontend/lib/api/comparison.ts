import type { CardComparisonDto, CardVariant, CollectionComparisonDto, CollectionComparisonPointDto, ComparisonPriceDto } from '@/types/api';
import { ApiError, apiFetch, buildQueryString } from './api-client';

const PROVIDERS = ['tcgdex', 'tcgcsv'] as const;
const VARIANTS: readonly CardVariant[] = ['normal', 'holofoil', 'reverseHolofoil', 'firstEditionNormal', 'firstEditionHolofoil', 'firstEdition', 'unlimited', 'unlimitedHolofoil'];
const STATES = ['disabled', 'unsupported', 'pending', 'ready', 'failed'] as const;
const FRESHNESS = ['fresh', 'stale', 'unknown'] as const;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const isInstant = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;
const nullableNumber = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
const nullableInstant = (v: unknown): v is string | null => v === null || isInstant(v);

function parsePrice(v: unknown): ComparisonPriceDto | null {
  if (!isRecord(v) || !isDate(v.date) || !nullableNumber(v.market) || !nullableNumber(v.low) || !nullableNumber(v.mid) || !nullableNumber(v.high) ||
      !isInstant(v.fetchedAt) || new Date(v.fetchedAt).toISOString().slice(0, 10) !== v.date || !nullableInstant(v.feedPublishedAt) || v.upstreamUpdatedAt !== null || !FRESHNESS.includes(v.freshness as never)) return null;
  return v as unknown as ComparisonPriceDto;
}
function integer(v: unknown): v is number { return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0; }
function parsePoint(v: unknown): CollectionComparisonPointDto | null {
  if (!isRecord(v) || !isDate(v.date) || !nullableNumber(v.valueUsd) || !integer(v.totalCopies) || !integer(v.pricedCopies) ||
      !integer(v.unpricedCopies) || !integer(v.freshCopies) || !integer(v.staleCopies) || !integer(v.unknownFreshnessCopies) ||
      v.totalCopies !== v.pricedCopies + v.unpricedCopies || !nullableInstant(v.oldestFetchedAt) || !nullableInstant(v.newestFetchedAt) ||
      v.freshCopies + v.staleCopies + v.unknownFreshnessCopies !== v.pricedCopies ||
      (v.totalCopies > 0 && v.pricedCopies === 0 && v.valueUsd !== null) ||
      (v.totalCopies === 0 && v.valueUsd !== 0) || (v.pricedCopies > 0 && v.valueUsd === null) ||
      !nullableInstant(v.feedPublishedAt) || typeof v.compositionFingerprint !== 'string' || typeof v.compositionChanged !== 'boolean' ||
      typeof v.provisional !== 'boolean' || !isInstant(v.evaluatedAt) || !isInstant(v.cutAt)) return null;
  return v as unknown as CollectionComparisonPointDto;
}
export function toCardComparison(v: unknown): CardComparisonDto | null {
  if (!isRecord(v) || typeof v.cardId !== 'string' || !VARIANTS.includes(v.variant as CardVariant) || v.currency !== 'USD' ||
      !integer(v.windowDays) || v.windowDays < 7 || v.windowDays > 365 || typeof v.activeProvider !== 'string' || !isInstant(v.evaluatedAt) || !isRecord(v.tcgcsv) ||
      typeof v.tcgcsv.enabled !== 'boolean' || !STATES.includes(v.tcgcsv.state as never) ||
      !(v.tcgcsv.groupId === null || integer(v.tcgcsv.groupId)) || !nullableInstant(v.tcgcsv.nextAttemptAt) || !Array.isArray(v.series)) return null;
  const seen = new Set<string>();
  for (const s of v.series) {
    if (!isRecord(s) || !PROVIDERS.includes(s.provider as never) || seen.has(String(s.provider)) || s.source !== 'tcgplayer' || s.currency !== 'USD' || !Array.isArray(s.points)) return null;
    seen.add(String(s.provider));
    if (s.current !== null && !parsePrice(s.current)) return null;
    if (!s.points.every((p) => parsePrice(p) !== null) || new Set(s.points.map((p) => isRecord(p) ? p.date : '')).size !== s.points.length) return null;
  }
  if (v.activeProvider === 'tcgcsv' ? seen.size !== 1 || !seen.has('tcgcsv') : seen.size !== 2) return null;
  return v as unknown as CardComparisonDto;
}
export function toCollectionComparison(v: unknown): CollectionComparisonDto | null {
  if (!isRecord(v) || !(typeof v.collectionId === 'string' || v.collectionId === null) || typeof v.activeProvider !== 'string' || v.currency !== 'USD' ||
      !integer(v.windowDays) || v.windowDays < 7 || v.windowDays > 365 || !isInstant(v.evaluatedAt) || !Array.isArray(v.series)) return null;
  const seen = new Set<string>();
  for (const s of v.series) {
    if (!isRecord(s) || !PROVIDERS.includes(s.provider as never) || seen.has(String(s.provider)) || s.policy !== 'exact-variant-market-usd-v1' || !isRecord(s.current) || !Array.isArray(s.points)) return null;
    seen.add(String(s.provider));
    if (!parsePoint(s.current) || !s.points.every((p) => parsePoint(p) !== null) || new Set(s.points.map((p) => isRecord(p) ? p.date : '')).size !== s.points.length) return null;
  }
  if (v.activeProvider === 'tcgcsv' ? seen.size !== 1 || !seen.has('tcgcsv') : seen.size !== 2) return null;
  return v as unknown as CollectionComparisonDto;
}
function required<T>(value: T | null): T { if (value === null) throw new ApiError(502, 'No pudimos leer la comparación recibida.'); return value; }
export async function getCardComparison(id: string, variant: CardVariant, days: number, signal: AbortSignal): Promise<CardComparisonDto> {
  const parsed = required(toCardComparison(await apiFetch<unknown>(`/cards/${encodeURIComponent(id)}/comparison${buildQueryString({ variant, days })}`, { signal, skipAuth: true, cache: 'no-store' })));
  if (parsed.cardId !== id || parsed.variant !== variant || parsed.windowDays !== days) throw new ApiError(502, 'La comparación recibida no corresponde a la carta solicitada.');
  return parsed;
}
export async function getCollectionComparison(id: string | null, days: number, signal: AbortSignal): Promise<CollectionComparisonDto> {
  const path = id === null ? '/portfolio/comparison' : `/collections/${encodeURIComponent(id)}/comparison`;
  const parsed = required(toCollectionComparison(await apiFetch<unknown>(`${path}${buildQueryString({ days })}`, { signal, cache: 'no-store' })));
  if (parsed.collectionId !== id || parsed.windowDays !== days) throw new ApiError(502, 'La comparación recibida no corresponde a la colección solicitada.');
  return parsed;
}
