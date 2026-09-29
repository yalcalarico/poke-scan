'use client';

import { BarChart3 } from 'lucide-react';

import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import { Alert, Skeleton, Surface } from '@/components/ui';

import { PriceDelta, type PriceDeltaProps } from './price-delta';

const NO_PRICE_COPY = 'No tenemos precio de mercado para esta carta todavía.';

export interface PriceHeroProps
  extends Pick<PriceDeltaProps, 'changeUsd' | 'changePercent' | 'updatedAt' | 'windowLabel'> {
  /**
   * Precio de referencia en **USD**. `null` = sabemos que no tiene precio;
   * `undefined` = todavía no lo sabemos (va `isLoading`).
   */
  usd?: number | null;
  /** El precio todavía está viajando: `Skeleton`, no un guion (§9.2). */
  isLoading?: boolean;
  /**
   * Abre el detalle (el `Sheet` con la tabla de variantes). **Sin esto el panel
   * no es interactivo** y no se dibuja el ícono de gráfico: una afordancia que
   * no hace nada es peor que no tenerla.
   */
  onOpenDetails?: () => void;
  className?: string;
}

/**
 * El precio como elemento protagonista de la ficha: `overline` arriba, `display`
 * abajo, y el delta (o la fecha) en una tercera línea.
 *
 * ## Moneda
 *
 * El valor crudo **siempre es USD** y la conversión es del cliente
 * (`useCurrency().formatMoney`), porque la preferencia es del usuario y llega
 * desde el token: formatearlo en el server produciría HTML que no corresponde a
 * la moneda que el visitante tiene activa. Con la moneda en ARS la cifra
 * principal es ARS y el USD va debajo en `caption text-tertiary`: el que guarda
 * en pesos necesita ver las dos, y el que razona en dólares necesita el número
 * crudo.
 *
 * ## Sin precio
 *
 * `—` en `text-tertiary` con `aria-label="Sin precio"` y un `Alert` de
 * `warning`. **Nunca `$0.00`**: un precio de cero es un dato falso y una carta
 * sin precio es un dato que todavía no tenemos (§9.2, §2.3). El aviso va
 * adentro del hero y no en la pantalla porque el estado "no hay precio" es
 * inseparable de la cifra que falta: cualquier otro consumidor del componente
 * lo tiene que seguir teniendo.
 */
export function PriceHero({
  usd,
  isLoading = false,
  changeUsd,
  changePercent,
  updatedAt,
  windowLabel,
  onOpenDetails,
  className,
}: PriceHeroProps) {
  const { currency, formatMoney } = useCurrency();

  const hasPrice = typeof usd === 'number' && Number.isFinite(usd);
  const showUsdSecondary = hasPrice && currency === 'ARS';

  const content = (
    <>
      <div className="flex w-full items-center justify-between gap-3">
        <p className="text-overline text-tertiary">Precio medio</p>
        {onOpenDetails ? (
          <BarChart3
            aria-hidden="true"
            focusable="false"
            strokeWidth={1.75}
            className="h-5 w-5 shrink-0 text-tertiary"
          />
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="mt-1 h-9 w-40" />
      ) : hasPrice ? (
        <>
          <p className="text-display text-primary tabular-nums">{formatMoney(usd)}</p>
          {showUsdSecondary ? (
            <p className="-mt-1 text-caption text-tertiary tabular-nums">{formatPrice(usd, 'USD')}</p>
          ) : null}
        </>
      ) : (
        <p className="text-display text-tertiary" aria-label="Sin precio">
          —
        </p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <PriceDelta
          changeUsd={changeUsd}
          changePercent={changePercent}
          windowLabel={windowLabel}
          updatedAt={updatedAt}
        />
      </div>

      {!isLoading && !hasPrice ? (
        <Alert tone="warning" size="sm" className="mt-3 w-full">
          {NO_PRICE_COPY}
        </Alert>
      ) : null}
    </>
  );

  return (
    <Surface as="section" padded={false} className={cn('overflow-hidden', className)}>
      {onOpenDetails ? (
        <button
          type="button"
          onClick={onOpenDetails}
          aria-haspopup="dialog"
          className={cn(
            'flex w-full flex-col items-start gap-1 p-4 text-left',
            'transition-colors duration-fast ease-standard hover:bg-surface-2 active:bg-surface-3',
            'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40',
          )}
        >
          {content}
        </button>
      ) : (
        <div className="flex w-full flex-col items-start gap-1 p-4">{content}</div>
      )}
    </Surface>
  );
}

export { NO_PRICE_COPY };
