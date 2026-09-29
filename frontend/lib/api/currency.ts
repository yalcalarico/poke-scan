import type { UserDto } from '@/types/api';
import { apiFetch, buildQueryString } from './api-client';

export type RateType = 'blue' | 'oficial';

export type PreferredCurrency = 'USD' | 'ARS';

export const RATE_TYPES: readonly RateType[] = ['blue', 'oficial'];

export const PREFERRED_CURRENCIES: readonly PreferredCurrency[] = ['USD', 'ARS'];

export const DEFAULT_RATE_TYPE: RateType = 'blue';

/** Una cotización individual (espejo de `RateView` del backend). */
export interface RateView {
  rate: number;
  rateType: RateType;
  fetchedAt: string;
  stale: boolean;
}

/**
 * `GET /currency/usd-ars`. Los cuatro campos de primer nivel corresponden al
 * tipo pedido en `?type` (por defecto `blue`); `blue` y `oficial` traen
 * además la cotización del otro tipo para que el cliente ofrezca el selector
 * con una sola llamada. Uno de los dos puede venir en `null`.
 */
export interface UsdArsRate extends RateView {
  blue: RateView | null;
  oficial: RateView | null;
}

export interface UpdateCurrencyPreferencePayload {
  preferredCurrency: PreferredCurrency;
  preferredRateType?: RateType;
}

export function buildUsdArsPath(type?: RateType): string {
  return `/currency/usd-ars${buildQueryString(type ? { type } : {})}`;
}

/**
 * Nunca tira: un 404 significa que el feature flag `CURRENCY_ARS_ENABLED`
 * está apagado y cualquier otro error (DolarApi caído, backend abajo) deja la
 * app funcionando en USD. `null` = "no hay conversión a ARS disponible".
 */
export async function getUsdArsRate(type?: RateType): Promise<UsdArsRate | null> {
  try {
    const data = await apiFetch<UsdArsRate>(buildUsdArsPath(type), { skipAuth: true });
    if (!data || typeof data.rate !== 'number' || !Number.isFinite(data.rate)) return null;
    return data;
  } catch {
    return null;
  }
}

export function updateCurrencyPreference(
  payload: UpdateCurrencyPreferencePayload,
): Promise<UserDto> {
  return apiFetch<UserDto>('/currency/preference', { method: 'PATCH', body: payload });
}

export function isRateType(value: unknown): value is RateType {
  return typeof value === 'string' && (RATE_TYPES as readonly string[]).includes(value);
}
