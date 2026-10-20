export type PriceFreshness = 'fresh' | 'stale' | 'unknown';
export type AggregateFreshness = PriceFreshness | 'mixed';

export interface PriceMetadataDto {
  evaluatedAt: string;
  freshness: PriceFreshness;
  upstreamUpdatedAt: string | null;
  upstreamFreshness: PriceFreshness;
}

export interface CopyCoverageDto {
  totalCopies: number;
  pricedCopies: number;
  unpricedCopies: number;
  coverageRatio: number | null;
}

export interface PriceRecencyDto {
  freshness: AggregateFreshness;
  freshCopies: number;
  staleCopies: number;
  unknownFreshnessCopies: number;
  upstreamFreshness: AggregateFreshness;
  oldestFetchedAt: string | null;
  newestFetchedAt: string | null;
}

export interface ValueAggregateDto {
  amount: number | null;
  currency: 'USD';
  evaluatedAt: string | null;
  coverage: CopyCoverageDto;
  recency: PriceRecencyDto | null;
}

export const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function validDate(value: Date | string | null | undefined, evaluatedAt: Date): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (typeof value === 'string' && Number.isFinite(date.getTime()) && date.toISOString() !== (value.includes('.') ? value : value.replace('Z', '.000Z'))) return null;
  return Number.isFinite(date.getTime()) && date.getTime() <= evaluatedAt.getTime() ? date : null;
}

export function freshnessAt(value: Date | string | null | undefined, evaluatedAt: Date, active = true): PriceFreshness {
  const date = validDate(value, evaluatedAt);
  if (!date) return 'unknown';
  if (!active || evaluatedAt.getTime() - date.getTime() >= PRICE_MAX_AGE_MS) return 'stale';
  return 'fresh';
}

export function priceMetadata(fetchedAt: Date | string | null | undefined, provider: string | null, activeProvider: string, evaluatedAt: Date): PriceMetadataDto {
  return {
    evaluatedAt: evaluatedAt.toISOString(),
    freshness: freshnessAt(fetchedAt, evaluatedAt, provider === activeProvider),
    upstreamUpdatedAt: null,
    upstreamFreshness: 'unknown',
  };
}

export function aggregateFreshness(states: readonly PriceFreshness[]): AggregateFreshness {
  if (states.length === 0) return 'unknown';
  const unique = new Set(states);
  if (unique.size !== 1) return 'mixed';
  return states[0] ?? 'unknown';
}

export interface ValuationInput {
  totalCopies: number;
  pricedCopies: number;
  amount: number;
  freshness: readonly { state: PriceFreshness; upstream: PriceFreshness; copies: number; fetchedAt: Date | string | null }[];
  evaluatedAt: Date;
}

export function valuation(input: ValuationInput): ValueAggregateDto {
  const totalCopies = Math.max(0, input.totalCopies);
  const pricedCopies = Math.max(0, Math.min(totalCopies, input.pricedCopies));
  const unpricedCopies = totalCopies - pricedCopies;
  const contributing = input.freshness.filter((entry) => entry.copies > 0);
  const states = contributing.map((entry) => entry.state);
  const upstreamStates = contributing.map((entry) => entry.upstream);
  const copiesFor = (state: PriceFreshness): number => contributing.reduce((sum, entry) => sum + (entry.state === state ? entry.copies : 0), 0);
  const fetched = contributing.map((entry) => validDate(entry.fetchedAt, input.evaluatedAt)).filter((date): date is Date => date !== null).sort((a, b) => a.getTime() - b.getTime());
  const amount = totalCopies === 0 ? 0 : pricedCopies === 0 ? null : Math.round(input.amount * 100) / 100;
  return {
    amount,
    currency: 'USD',
    evaluatedAt: input.evaluatedAt.toISOString(),
    coverage: { totalCopies, pricedCopies, unpricedCopies, coverageRatio: totalCopies === 0 ? null : pricedCopies / totalCopies },
    recency: {
      freshness: aggregateFreshness(states), freshCopies: copiesFor('fresh'),
      staleCopies: copiesFor('stale'), unknownFreshnessCopies: copiesFor('unknown'),
      upstreamFreshness: aggregateFreshness(upstreamStates),
      oldestFetchedAt: fetched[0]?.toISOString() ?? null, newestFetchedAt: fetched.at(-1)?.toISOString() ?? null,
    },
  };
}

export function snapshotValuation(totalCopies: number, unpricedCopies: number, amount: number | null): ValueAggregateDto {
  const total = Math.max(0, totalCopies);
  const unpriced = Math.max(0, Math.min(total, unpricedCopies));
  const priced = total - unpriced;
  return {
    amount: total === 0 ? 0 : priced === 0 ? null : amount,
    currency: 'USD', evaluatedAt: null,
    coverage: { totalCopies: total, pricedCopies: priced, unpricedCopies: unpriced, coverageRatio: total === 0 ? null : priced / total },
    recency: null,
  };
}

export function valuationFromCounts(input: {
  totalCopies: number; pricedCopies: number; amount: number; evaluatedAt: Date;
  freshCopies: number; staleCopies: number; unknownFreshnessCopies: number;
  oldestFetchedAt: Date | null; newestFetchedAt: Date | null;
}): ValueAggregateDto {
  const totalCopies = Math.max(0, input.totalCopies);
  const pricedCopies = Math.max(0, Math.min(totalCopies, input.pricedCopies));
  const unpricedCopies = totalCopies - pricedCopies;
  const amount = totalCopies === 0 ? 0 : pricedCopies === 0 ? null : Math.round(input.amount * 100) / 100;
  const freshness: PriceFreshness[] = [
    input.freshCopies > 0 ? 'fresh' : null,
    input.staleCopies > 0 ? 'stale' : null,
    input.unknownFreshnessCopies > 0 ? 'unknown' : null,
  ].filter((state): state is PriceFreshness => state !== null);
  const oldest = validDate(input.oldestFetchedAt, input.evaluatedAt);
  const newest = validDate(input.newestFetchedAt, input.evaluatedAt);
  return {
    amount, currency: 'USD', evaluatedAt: input.evaluatedAt.toISOString(),
    coverage: { totalCopies, pricedCopies, unpricedCopies, coverageRatio: totalCopies === 0 ? null : pricedCopies / totalCopies },
    recency: {
      freshness: aggregateFreshness(freshness), freshCopies: input.freshCopies, staleCopies: input.staleCopies,
      unknownFreshnessCopies: input.unknownFreshnessCopies, upstreamFreshness: 'unknown',
      oldestFetchedAt: oldest?.toISOString() ?? null, newestFetchedAt: newest?.toISOString() ?? null,
    },
  };
}
