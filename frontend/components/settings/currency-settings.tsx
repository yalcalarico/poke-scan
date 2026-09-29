'use client';

import { useCurrency } from '@/hooks/use-currency';
import { formatPrice, formatRelativeTime } from '@/lib/format';
import { Alert, SegmentedControl, Skeleton, type SegmentedControlOption } from '@/components/ui';
import type { PreferredCurrency, RateType } from '@/lib/api/currency';

import { SettingsSection } from './settings-section';

const CURRENCY_OPTIONS: readonly SegmentedControlOption<PreferredCurrency>[] = [
  { value: 'USD', label: 'USD' },
  { value: 'ARS', label: 'ARS' },
];

const RATE_TYPE_OPTIONS: readonly SegmentedControlOption<RateType>[] = [
  { value: 'blue', label: 'Blue' },
  { value: 'oficial', label: 'Oficial' },
];

/**
 * En qué moneda se ven los precios.
 *
 * `SegmentedControl` lo unifica; el estado y la lógica de frescura no cambian.
 * Antes el markup estaba duplicado: una copia local acá y otra inline en
 * `app/(app)/colecciones/[id]/page.tsx`.
 */
export function CurrencySettings() {
  const {
    isLoading,
    isAvailable,
    isStale,
    currency,
    rateType,
    activeRate,
    fetchedAt,
    setCurrency,
    setRateType,
  } = useCurrency();

  // Sin cotización no hay ARS: es el feature flag `CURRENCY_ARS_ENABLED` del
  // backend apagado, no un error. Por eso el aviso es `info` y no `warning`.
  const options = isAvailable ? CURRENCY_OPTIONS : CURRENCY_OPTIONS.slice(0, 1);

  return (
    <SettingsSection
      title="Moneda"
      description="Elegí en qué moneda querés ver los precios de tus cartas."
    >
      <SegmentedControl
        label="Moneda de los precios"
        value={currency}
        onChange={setCurrency}
        options={options}
      />

      {isLoading ? (
        <div role="status" aria-label="Consultando cotización" className="flex flex-col gap-2">
          <Skeleton variant="text" className="w-40" />
          <Skeleton variant="text" className="w-56" />
        </div>
      ) : null}

      {!isLoading && !isAvailable ? (
        <Alert tone="info" size="sm" title="La cotización en pesos no está disponible">
          Mientras tanto los precios se ven en dólares. Es algo del servidor, no de tu cuenta.
        </Alert>
      ) : null}

      {!isLoading && isAvailable ? (
        <>
          {currency === 'ARS' ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-label text-secondary">Tipo de dólar</p>
              <SegmentedControl
                label="Tipo de dólar"
                value={rateType}
                onChange={setRateType}
                options={RATE_TYPE_OPTIONS}
              />
            </div>
          ) : null}

          {activeRate ? (
            <p className="text-caption text-secondary">
              <span className="text-body-strong text-primary">
                1 USD = {formatPrice(activeRate.rate, 'ARS')}
              </span>{' '}
              · actualizado {formatRelativeTime(fetchedAt)}
            </p>
          ) : null}

          {/*
            `warning` y no `error` (§2.3): la cotización es vieja, pero el
            usuario puede igual mirar precios y tomar decisiones con ellos. Es
            literalmente el caso de ejemplo del design system.
          */}
          {isStale ? (
            <Alert tone="warning" size="sm" title="Cotización desactualizada">
              Puede estar unas horas atrasada. Los precios en dólares no cambian.
            </Alert>
          ) : null}
        </>
      ) : null}
    </SettingsSection>
  );
}
