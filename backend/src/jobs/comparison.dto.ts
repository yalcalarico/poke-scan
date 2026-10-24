import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CARD_VARIANTS, type CardVariant } from '../modules/collections/dto/card-variant.js';
import type { PriceFreshness } from '../common/price-metadata.js';

export class ComparisonQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Los días deben ser un número entero' })
  @Min(7, { message: 'Pedí al menos 7 días' })
  @Max(365, { message: 'Pedí hasta 365 días' })
  days: number = 30;
}

export class CardComparisonQueryDto extends ComparisonQueryDto {
  @IsOptional()
  @IsIn(CARD_VARIANTS, { message: 'La variante de carta no es válida' })
  variant: CardVariant = 'normal';
}

export const COMPARISON_PROVIDERS = ['tcgdex', 'tcgcsv'] as const;
export type ComparisonProvider = (typeof COMPARISON_PROVIDERS)[number];
export function historyProviders(active: string): readonly ComparisonProvider[] {
  return active === 'tcgcsv' ? ['tcgcsv'] : COMPARISON_PROVIDERS;
}
export const COMPARISON_POLICY = 'exact-variant-market-usd-v1';

export interface ComparisonPriceDto {
  date: string;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  fetchedAt: string;
  feedPublishedAt: string | null;
  upstreamUpdatedAt: null;
  freshness: PriceFreshness;
}

export interface CardComparisonDto {
  cardId: string;
  variant: string;
  currency: 'USD';
  windowDays: number;
  activeProvider: string;
  evaluatedAt: string;
  tcgcsv: {
    enabled: boolean;
    state: 'disabled' | 'unsupported' | 'pending' | 'ready' | 'failed';
    groupId: number | null;
    nextAttemptAt: string | null;
  };
  series: {
    provider: ComparisonProvider;
    source: 'tcgplayer';
    currency: 'USD';
    current: ComparisonPriceDto | null;
    points: ComparisonPriceDto[];
  }[];
}

export interface CollectionComparisonPointDto {
  date: string;
  valueUsd: number | null;
  totalCopies: number;
  pricedCopies: number;
  unpricedCopies: number;
  freshCopies: number;
  staleCopies: number;
  unknownFreshnessCopies: number;
  oldestFetchedAt: string | null;
  newestFetchedAt: string | null;
  feedPublishedAt: string | null;
  compositionFingerprint: string;
  compositionChanged: boolean;
  provisional: boolean;
  evaluatedAt: string;
  cutAt: string;
}

export interface CollectionComparisonDto {
  collectionId: string | null;
  activeProvider: string;
  currency: 'USD';
  windowDays: number;
  evaluatedAt: string;
  series: {
    provider: ComparisonProvider;
    policy: string;
    current: CollectionComparisonPointDto;
    points: CollectionComparisonPointDto[];
  }[];
}
