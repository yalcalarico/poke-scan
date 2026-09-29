export const RATE_TYPES = ['blue', 'oficial'] as const;

export type RateType = (typeof RATE_TYPES)[number];

export const DEFAULT_RATE_TYPE: RateType = 'blue';

export const PREFERRED_CURRENCIES = ['USD', 'ARS'] as const;

export type PreferredCurrency = (typeof PREFERRED_CURRENCIES)[number];

/** Fuente de cotizaciones. Verificada contra la API real: la respuesta usa
 *  `compra` / `venta` / `fechaActualizacion`, no `value` / `timestamp`. */
export const DOLAR_API_BASE_URL = 'https://dolarapi.com';

/** DolarApi puede tardar o dejar de responder: nunca colgamos el backend. */
export const UPSTREAM_TIMEOUT_MS = 5_000;

/** Caché "fresca" de la cotización: 1 hora. */
export const RATE_CACHE_TTL_SECONDS = 60 * 60;

/** Si la cotización de DolarApi es más vieja que esto, se marca `stale`. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/** Guarda la última cotización conocida sin TTL, para seguir respondiendo
 *  cuando DolarApi se cae. Es la "persistencia" pedida sin tocar Prisma. */
export const LAST_KNOWN_SUFFIX = ':last';

export const RATE_CACHE_PREFIX = 'currency:usd:';
export const BOTH_CACHE_KEY = 'currency:usd:both';

/** Desactivado solo con `CURRENCY_ARS_ENABLED=false` explícito, para no
 *  romper el desarrollo local si la variable no está definida. */
export const FEATURE_FLAG_ENV = 'CURRENCY_ARS_ENABLED';

/** Sano: en 2026 el dólar argentino ronda 1.000-2.000 ARS. Fuera de este
 *  rango casi seguro es basura de la API (o un HTML parseado como número). */
export const MIN_SANE_RATE = 1;
export const MAX_SANE_RATE = 1_000_000;
