'use client';

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';

/**
 * Frescura máxima de un precio antes de considerarlo viejo: 24 h, la misma
 * regla que aplica el backend en su caché de Postgres (`AGENTS.md` §3.1).
 */
export const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Margen por reloj y por el `revalidate` de la página. Sin esto, un precio de
 * 23 h 58 min se paints viejo justo en el peor momento.
 */
export const PRICE_FRESHNESS_SLACK_MS = 5 * 60 * 1000;

/** El `fetchedAt` más reciente del conjunto: el precio más nuevo que tenemos. */
export function freshestFetchedAt(prices: readonly { fetchedAt: string }[]): string | null {
  let newest: number | null = null;
  for (const price of prices) {
    const at = Date.parse(price.fetchedAt);
    if (Number.isFinite(at) && (newest === null || at > newest)) newest = at;
  }
  return newest === null ? null : new Date(newest).toISOString();
}

/** Edad del precio más reciente, en ms. `null` si no hay ninguno. */
export function priceAgeMs(updatedAt: string | null | undefined, now = Date.now()): number | null {
  if (!updatedAt) return null;
  const at = Date.parse(updatedAt);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, now - at);
}

/**
 * ¿El precio tiene más de 24 h? Es la condición del `Alert tone="warning"`.
 *
 * Vive acá y no en el componente que muestra el aviso porque la regla de
 * frescura la necesitan tres: la tabla (que reimprime "actualizado hace X"), el
 * `PriceHero` y la sección que decide si hay que volver a pedir el precio en el
 * cliente. Una sola fuente, tres consumidores.
 */
export function isPriceStale(updatedAt: string | null | undefined, now = Date.now()): boolean {
  const age = priceAgeMs(updatedAt, now);
  return age === null || age > PRICE_MAX_AGE_MS - PRICE_FRESHNESS_SLACK_MS;
}

export type PriceDeltaTone = 'negative' | 'positive' | 'flat';

const TONE_CLASSES: Record<PriceDeltaTone, string> = {
  negative: 'bg-negative-soft text-negative',
  positive: 'bg-positive-soft text-positive',
  // Sin cambio no es "ni una cosa ni la otra": es un precio quieto, y pintar
  // un 0 % de rojo dice "cayó" cuando no cayó nada.
  flat: 'bg-surface-2 text-secondary',
};

const TONE_ICONS: Record<PriceDeltaTone, LucideIcon> = {
  negative: TrendingDown,
  positive: TrendingUp,
  flat: Minus,
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export interface PriceDeltaProps {
  /**
   * Variación del período, **siempre en USD**: el valor crudo de la API es USD y
   * la conversión es del cliente (`useCurrency`).
   *
   * Hoy el backend **no tiene histórico de precio** (`card_prices` es
   * append-only pero no se agrega, y la propuesta B10 de calcular la serie no
   * está implementada), así que estas props llegan `undefined` y el componente
   * cae a la fecha de actualización. Cuando exista, alcanza con que el DTO
   * mande los dos números: no hay que tocar el markup.
   */
  changeUsd?: number | null;
  /** Variación porcentual con signo: `-73` es una caída del 73 %. */
  changePercent?: number | null;
  /** Ventana del histórico. Solo se muestra si hay delta. */
  windowLabel?: string;
  /** `fetchedAt` del precio. Se muestra cuando no hay delta. */
  updatedAt?: string | null;
  className?: string;
}

/**
 * La píldora de variación de precio (§8.15).
 *
 * ## Por qué dos formas en un componente
 *
 * El diseño pide la píldora de la referencia, pero el backend todavía no puede
 * mandarla. Las dos alternativas —píldora o fecha— ocupan el mismo lugar en la
 * composición (la línea bajo la cifra del `PriceHero`) y nunca aparecen juntas,
 * así que un solo componente con dos salidas es menos API que dos. Lo que **no**
 * hace es inventar el dato: sin `changeUsd` y `changePercent` no hay píldora,
 * hay "Actualizado hace 3 h", y el `Alert tone="warning"` de "esto está viejo"
 * lo pone el consumidor (`CardPriceSection`), porque un `Alert` no es una
 * píldora y esta caja no debe crecer de ancho completo.
 *
 * ## Formato
 *
 * - Porcentaje con **cero decimales** (§8.15): `-73 %`.
 * - Monto con los decimales de la moneda activa: dos en USD, **cero en ARS**
 *   (§9.3). El formato de la moneda le gana a la regla del "dos decimales":
 *   `$2.839` es lo que el usuario lee, y `$2.839,31` en pesos es ruido.
 * - `tabular-nums` en las dos cifras: el delta se compara contra la cifra de
 *   arriba y baila si las columnas no están alineadas (§3.2).
 */
export function PriceDelta({
  changeUsd,
  changePercent,
  windowLabel = 'últimos 30 días',
  updatedAt,
  className,
}: PriceDeltaProps) {
  const { formatMoney } = useCurrency();

  const hasChange = isFiniteNumber(changeUsd) || isFiniteNumber(changePercent);

  if (!hasChange) {
    // Sin delta y sin `fetchedAt` no hay nada que decir: "Actualizado —" es peor
    // que una línea de menos, y el estado sin precio ya lo cuenta el `Alert` del
    // `PriceHero`.
    if (!updatedAt) return null;

    return (
      <p className={className}>
        <span className="text-caption text-tertiary tabular-nums">
          Actualizado {formatRelativeTime(updatedAt)}
        </span>
      </p>
    );
  }

  const reference = isFiniteNumber(changeUsd) ? changeUsd : (changePercent ?? 0);
  const tone: PriceDeltaTone = reference > 0 ? 'positive' : reference < 0 ? 'negative' : 'flat';
  const Icon = TONE_ICONS[tone];

  const amount = isFiniteNumber(changeUsd)
    ? `${reference < 0 ? '-' : reference > 0 ? '+' : ''}${formatMoney(Math.abs(changeUsd))}`
    : null;
  const percent = isFiniteNumber(changePercent) ? `${Math.round(changePercent)} %` : null;

  const direction = reference < 0 ? 'Bajó' : reference > 0 ? 'Subió' : 'Sin cambios';
  const spokenAmount = isFiniteNumber(changeUsd) ? formatMoney(Math.abs(changeUsd)) : null;
  const spokenPercent = isFiniteNumber(changePercent)
    ? `${Math.abs(Math.round(changePercent))} por ciento`
    : null;

  return (
    <p className={className}>
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        {/*
          El `text-label` va adentro de la píldora y no en ella: `cn()` resuelve
          por grupos y `text-label` (utilidad propia de §3.1) cae en el mismo
          grupo que `text-negative`, así que mergeados en el mismo elemento el
          tamaño se pierde. Dentro no hay color con el que colisionar.
        */}
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 tabular-nums',
            TONE_CLASSES[tone],
          )}
        >
          <Icon aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0" />
          {/*
            Lo visible es `aria-hidden` y lo que se anuncia es esta línea: un
            "-$2.839,31 (-73 %)" leído por un lector de pantalla dice el símbolo
            de la moneda y el signo de la resta, que es exactamente lo que hay
            que evitar. Una sola fuente de texto, sin `aria-label` encima.
          */}
          <span className="sr-only">
            {direction}
            {spokenAmount ? ` ${spokenAmount}` : ''}
            {spokenPercent ? ` (${spokenPercent})` : ''}
            {` en los ${windowLabel}`}
          </span>
          <span aria-hidden="true" className="text-label">
            {amount}
          </span>
          {percent ? (
            <span aria-hidden="true" className="text-label">
              ({percent})
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="text-caption text-tertiary">
          {windowLabel}
        </span>
      </span>
    </p>
  );
}
