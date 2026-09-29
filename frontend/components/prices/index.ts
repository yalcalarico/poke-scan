/**
 * Superficie pública del sistema de precios. `/carta/[id]`, el perfil y
 * el escáner importan de acá y no de los archivos sueltos: cambiar dónde vive
 * `PriceHero` no debería obligar a tocar tres pantallas.
 */
export {
  CardPriceSection,
  heroPriceUsd,
  type CardPriceSectionProps,
} from './card-price-section';
export {
  freshestFetchedAt,
  isPriceStale,
  PRICE_FRESHNESS_SLACK_MS,
  PRICE_MAX_AGE_MS,
  priceAgeMs,
  PriceDelta,
  type PriceDeltaProps,
  type PriceDeltaTone,
} from './price-delta';
export { NO_PRICE_COPY, PriceHero, type PriceHeroProps } from './price-hero';
export {
  countPricelessVariants,
  isPricelessVariant,
  PriceTable,
  sortPricesByVariant,
  type PriceTableProps,
} from './price-table';
