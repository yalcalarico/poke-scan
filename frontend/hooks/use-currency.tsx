'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/hooks/use-auth';
import {
  DEFAULT_RATE_TYPE,
  getUsdArsRate,
  isRateType,
  updateCurrencyPreference,
  type PreferredCurrency,
  type RateType,
  type RateView,
  type UsdArsRate,
} from '@/lib/api/currency';
import { formatPrice } from '@/lib/format';

export interface CurrencyContextValue {
  /** Cotización completa (ambos tipos) o `null` si ARS no está disponible. */
  rate: UsdArsRate | null;
  isLoading: boolean;
  isStale: boolean;
  isAvailable: boolean;
  currency: PreferredCurrency;
  rateType: RateType;
  /** Cotización efectivamente usada (la elegida, o la única disponible). */
  activeRate: RateView | null;
  /** Timestamp de la cotización activa, para "actualizado hace X". */
  fetchedAt: string | null;
  setCurrency: (currency: PreferredCurrency) => void;
  setRateType: (rateType: RateType) => void;
  formatMoney: (usd: number | null | undefined) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, refreshUser } = useAuth();

  const [rate, setRate] = useState<UsdArsRate | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currency, setCurrencyState] = useState<PreferredCurrency>('USD');
  const [rateType, setRateTypeState] = useState<RateType>(DEFAULT_RATE_TYPE);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const data = await getUsdArsRate();
      if (cancelled) return;
      setRate(data);
      setIsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const preferredCurrency: PreferredCurrency = user?.preferredCurrency ?? 'USD';
  const preferredRateType: RateType = isRateType(user?.preferredRateType)
    ? user.preferredRateType
    : DEFAULT_RATE_TYPE;

  // La preferencia guardada manda, pero recién sincroniza cuando el usuario
  // (o el logout) la cambia de verdad: un toggle local que todavía no llegó al
  // backend no se pisa con el valor viejo.
  const [syncedPreference, setSyncedPreference] = useState<{
    currency: PreferredCurrency;
    rateType: RateType;
  } | null>(null);

  if (syncedPreference?.currency !== preferredCurrency || syncedPreference.rateType !== preferredRateType) {
    setSyncedPreference({ currency: preferredCurrency, rateType: preferredRateType });
    setCurrencyState(preferredCurrency);
    setRateTypeState(preferredRateType);
  }

  const activeRate = useMemo<RateView | null>(() => {
    if (!rate) return null;
    const preferred = rateType === 'oficial' ? rate.oficial : rate.blue;
    return preferred ?? rate.oficial ?? rate.blue ?? null;
  }, [rate, rateType]);

  // Sin cotización no se puede mostrar ARS: caemos a USD aunque la
  // preferencia guardada diga lo contrario (feature flag apagado).
  const effectiveCurrency: PreferredCurrency = currency === 'ARS' && activeRate ? 'ARS' : 'USD';

  const persist = useCallback(
    async (payload: { preferredCurrency: PreferredCurrency; preferredRateType: RateType }) => {
      if (!isAuthenticated) return;
      try {
        await updateCurrencyPreference(payload);
        void refreshUser();
      } catch {
        // La preferencia queda solo en memoria: no vale la pena romper la UI.
      }
    },
    [isAuthenticated, refreshUser],
  );

  const setCurrency = useCallback(
    (next: PreferredCurrency) => {
      setCurrencyState(next);
      void persist({ preferredCurrency: next, preferredRateType: rateType });
    },
    [persist, rateType],
  );

  const setRateType = useCallback(
    (next: RateType) => {
      setRateTypeState(next);
      void persist({ preferredCurrency: currency, preferredRateType: next });
    },
    [currency, persist],
  );

  const formatMoney = useCallback(
    (usd: number | null | undefined): string => {
      if (effectiveCurrency === 'ARS' && activeRate) {
        if (usd === null || usd === undefined || !Number.isFinite(usd)) {
          return formatPrice(usd, 'USD');
        }
        return formatPrice(usd * activeRate.rate, 'ARS');
      }
      return formatPrice(usd, 'USD');
    },
    [activeRate, effectiveCurrency],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      rate,
      isLoading,
      isStale: activeRate?.stale ?? false,
      isAvailable: activeRate !== null,
      currency: effectiveCurrency,
      rateType: activeRate?.rateType ?? rateType,
      activeRate,
      fetchedAt: activeRate?.fetchedAt ?? null,
      setCurrency,
      setRateType,
      formatMoney,
    }),
    [
      rate,
      isLoading,
      activeRate,
      effectiveCurrency,
      rateType,
      setCurrency,
      setRateType,
      formatMoney,
    ],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency debe usarse dentro de <CurrencyProvider>');
  }
  return context;
}
