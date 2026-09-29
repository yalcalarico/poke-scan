'use client';

import { useCurrency } from '@/hooks/use-currency';
import { formatPrice, formatRelativeTime } from '@/lib/format';
import { VARIANT_OPTIONS, variantLabel } from '@/lib/variants';
import type { PriceDto } from '@/types/api';
import { Money } from '@/components/cards/money';
import { EmptyState, StatRow } from '@/components/ui';

import { freshestFetchedAt } from './price-delta';

/** Orden de lectura de las variantes: el de `lib/variants`, que es el canónico (§9.5). */
const VARIANT_ORDER = new Map<string, number>(
  VARIANT_OPTIONS.map((option, index) => [option.value, index]),
);

/**
 * Orden de lectura de las variantes: el de `lib/variants`, que es el canónico
 * (§9.5). Exportado porque la cifra del `PriceHero` tiene que ser la **misma**
 * variante que encabeza la tabla: si el hero elige una fila y la tabla muestra
 * otra primera, el usuario ve dos precios distintos para la misma pantalla.
 */
export function sortPricesByVariant(prices: readonly PriceDto[]): PriceDto[] {
  return [...prices].sort(
    (a, b) => (VARIANT_ORDER.get(a.variant) ?? 99) - (VARIANT_ORDER.get(b.variant) ?? 99),
  );
}

/** `true` si la fila no tiene un solo número: es una variante que todavía no tiene precio. */
function isEmptyRow(price: PriceDto): boolean {
  return [price.low, price.mid, price.high, price.market].every(
    (value) => value === null || value === undefined || !Number.isFinite(value),
  );
}

/**
 * Una celda de precio. Con la moneda en ARS, la cifra grande es en pesos y el
 * dólar va debajo en `caption text-tertiary` (misma regla que el `PriceHero`).
 */
function PriceCell({ usd, market = false }: { usd: number | null; market?: boolean }) {
  const { currency } = useCurrency();
  const hasValue = usd !== null && Number.isFinite(usd);
  const showUsd = hasValue && currency === 'ARS';

  return (
    <span className="block tabular-nums">
      {hasValue ? (
        <>
          <Money usd={usd} tone={market ? 'positive' : 'default'} className="block whitespace-nowrap" />
          {showUsd ? (
            <span className="mt-0.5 block whitespace-nowrap text-caption text-tertiary tabular-nums">
              {formatPrice(usd, 'USD')}
            </span>
          ) : null}
        </>
      ) : (
        <span aria-label="Sin precio" className="text-body text-tertiary">
          —
        </span>
      )}
    </span>
  );
}

export interface PriceTableProps {
  prices: readonly PriceDto[];
  className?: string;
}

/**
 * Los precios de las variantes de una carta, y el problema que resuelve.
 *
 * ## Por qué dos layouts
 *
 * Una tabla de 5 columnas con `min-w-[440px]` a 390 px obliga a scrollear en
 * horizontal y deja las cuatro cifras ilegibles: el 100 % del tráfico es mobile,
 * así que una tabla así **es** un desktop que se ve roto en el celular. El corte
 * está en `lg:` (1024 px), que es donde las 5 columnas entran sin scroll con el
 * padding de la pantalla; por debajo de
 * ahí el mismo dato se lee como filas apiladas de `StatRow` (bajo / medio / alto /
 * mercado en vertical, no en columnas), que es el formato que el §8.7 ya resuelve
 * para "label a la izquierda, valor a la derecha".
 *
 * El componente **no** decide cuál de los dos se ve: los dos se renderizan y el
 * breakpoint los separa. Es la forma de no depender de un listener de `matchMedia`
 * en un Server Component, y de que el CSS siga siendo la fuente de la decisión.
 *
 * La tabla lleva `<caption class="sr-only">` y `scope="col"`/`"row"`:
 * una tabla sin esos atributos es una grilla de números para un lector de pantalla.
 */
export function PriceTable({ prices, className }: PriceTableProps) {
  const { currency, activeRate, isStale } = useCurrency();
  const inArs = currency === 'ARS';
  const rows = sortPricesByVariant(prices);
  // El más reciente de todos, no el de la primera variante: la tabla está
  // ordenada por variante y la primera fila no dice nada sobre la frescura.
  const updatedAt = freshestFetchedAt(prices);

  if (rows.length === 0) {
    return (
      <EmptyState
        kind="no-results"
        size="sm"
        title="Sin precios"
        description="Esta carta todavía no tiene precio de mercado."
      />
    );
  }

  const footer = (
    <p className="mt-3 text-caption text-tertiary">
      Actualizado {formatRelativeTime(updatedAt)} ·{' '}
      {inArs && activeRate ? (
        <>
          <span className="text-secondary">
            1 USD = {formatPrice(activeRate.rate, 'ARS')} ({activeRate.rateType})
          </span>
          {isStale ? <span className="text-warning"> · cotización desactualizada</span> : null}
        </>
      ) : (
        'Moneda USD'
      )}
    </p>
  );

  return (
    <div className={className}>
      <div className="hidden lg:block">
        <table className="w-full border-collapse text-body">
          <caption className="sr-only">
            Precios de mercado por variante, en bajo, medio, alto y precio de mercado
          </caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="py-2 pr-3 text-overline text-tertiary font-semibold">
                Variante
              </th>
              <th scope="col" className="py-2 pr-3 text-right text-overline text-tertiary font-semibold">
                Bajo
              </th>
              <th scope="col" className="py-2 pr-3 text-right text-overline text-tertiary font-semibold">
                Medio
              </th>
              <th scope="col" className="py-2 pr-3 text-right text-overline text-tertiary font-semibold">
                Alto
              </th>
              <th scope="col" className="py-2 text-right text-overline text-tertiary font-semibold">
                Mercado
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((price) => (
              <tr key={`${price.variant}-${price.source}-${price.fetchedAt}`} className="border-b border-line-subtle last:border-0">
                <th scope="row" className="py-2.5 pr-3 text-left text-body-strong text-primary">
                  {variantLabel(price.variant)}
                  <span className="block text-caption font-normal text-tertiary">{price.source}</span>
                </th>
                <td className="py-2.5 pr-3 text-right text-body text-secondary">
                  <PriceCell usd={price.low} />
                </td>
                <td className="py-2.5 pr-3 text-right text-body text-secondary">
                  <PriceCell usd={price.mid} />
                </td>
                <td className="py-2.5 pr-3 text-right text-body text-secondary">
                  <PriceCell usd={price.high} />
                </td>
                <td className="py-2.5 text-right text-body text-primary">
                  <PriceCell usd={price.market} market />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {footer}
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {rows.map((price) => (
          <section
            key={`${price.variant}-${price.source}-${price.fetchedAt}`}
            className="rounded-control border border-line bg-surface-2 p-1"
          >
            <h3 className="px-2 pt-1.5 text-body-strong text-primary">{variantLabel(price.variant)}</h3>
            <p className="px-2 text-caption text-tertiary">{price.source}</p>
            <dl className="mt-1">
              <StatRow title="Bajo" value={<PriceCell usd={price.low} />} />
              <StatRow title="Medio" value={<PriceCell usd={price.mid} />} />
              <StatRow title="Alto" value={<PriceCell usd={price.high} />} />
              <StatRow title="Mercado" value={<PriceCell usd={price.market} market />} />
            </dl>
          </section>
        ))}
        {footer}
      </div>
    </div>
  );
}

/** Cuántas variantes no tienen un solo número: el aviso de "contenido parcial" (§9.1). */
export function countPricelessVariants(prices: readonly PriceDto[]): number {
  return prices.filter(isEmptyRow).length;
}

export { isEmptyRow as isPricelessVariant };
