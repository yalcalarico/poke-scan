import type { PriceDto, RecognizedCard } from '@/types/api';

function hasValue(price: PriceDto): boolean {
  return [price.market, price.mid, price.low, price.high].some((value) => typeof value === 'number' && Number.isFinite(value));
}

/** La variante elegida coincide con la primera referencia que la cámara puede mostrar. */
export function shownPriceReference(candidate: RecognizedCard): PriceDto | null {
  const prices = candidate.prices ?? [];
  return prices.find(hasValue) ?? (candidate.price && hasValue(candidate.price) ? candidate.price : prices[0] ?? candidate.price ?? null);
}

export function shownPriceValue(price: PriceDto): number | null {
  return [price.market, price.mid, price.low, price.high].find((value) => typeof value === 'number' && Number.isFinite(value)) ?? null;
}
