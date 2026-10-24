'use client';

import { BarChart3 } from 'lucide-react';

import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/cn';
import { formatDate, formatPrice } from '@/lib/format';
import { variantLabel } from '@/lib/variants';
import { Alert, Skeleton, Surface } from '@/components/ui';

import { AnimatedNumber } from '@/components/visual-preview/effects';

import { PriceDelta, type PriceDeltaProps } from './price-delta';
import { PriceHistory } from './price-history';

const NO_PRICE_COPY = 'No tenemos precio de mercado para esta carta todavía.';

export interface PriceHeroProps
  extends Pick<PriceDeltaProps, 'changeUsd' | 'changePercent' | 'updatedAt' | 'windowLabel'> {
  /**
   * Precio de referencia en **USD**. `null` = sabemos que no tiene precio;
   * `undefined` = todavía no lo sabemos (va `isLoading`).
   */
  usd?: number | null;
  /**
   * Id de la carta, para el `Sparkline` del histórico.
   *
   * Va como prop y no se deduce del `usd` porque **no hay forma de obtenerlo**:
   * el número ya viene formateado desde la capa de precios y la única fuente
   * del id es el `cardId` de la pantalla. Opcional porque sin él el hero sigue
   * siendo válido: es lo que pasa en `/colecciones/[id]/sets` y en cualquier
   * consumidor futuro que muestre una cifra sin serie.
   */
  cardId?: string;
  variant?: import('@/types/api').CardVariant;
  provider?: import('@/types/api').PriceDto['provider'];
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
 * `warning` cuando no hay market. Un cero conocido se muestra formateado:
 * ausencia y cero son estados diferentes (§9.2, §2.3). El aviso va
 * adentro del hero y no en la pantalla porque el estado "no hay precio" es
 * inseparable de la cifra que falta: cualquier otro consumidor del componente
 * lo tiene que seguir teniendo.
 *
 * La serie conserva su contexto en la misma Surface. Su detalle de procedencia
 * tiene un control propio, por lo que queda fuera del botón que abre variantes.
 *
 * ## Por qué el `outline` del foco va hacia adentro
 *
 * El botón que abre el detalle llena la `Surface` (`w-full`), y la `Surface` es
 * `overflow-hidden`. Un `outline` con `offset-2` —el patrón de `Button`, `Chip` y
 * `Select`— quedaría 4 px por fuera de la `Surface` y lo recorta su propio
 * `overflow-hidden`: el indicador de foco no se vería. Por eso el offset va
 * **negativo**, que es lo que ya hacía el `ring-inset` de antes y lo mismo que
 * usa la fila del buscador del `Select` (`select.tsx:136`): 2 px adentro del
 * borde de la tarjeta, que es justo donde se lo busca.
 */
export function PriceHero({
  usd,
  cardId,
  variant,
  provider,
  isLoading = false,
  changeUsd,
  changePercent,
  updatedAt,
  windowLabel,
  onOpenDetails,
  className,
}: PriceHeroProps) {
  const { currency, formatMoney, activeRate, fetchedAt, isStale: rateIsStale } = useCurrency();

  const hasPrice = typeof usd === 'number' && Number.isFinite(usd);
  const showUsdSecondary = hasPrice && currency === 'ARS';

  const content = (
    <>
      <div className="flex w-full items-center justify-between gap-3">
        <p className="text-overline text-tertiary">{variant ? `Referencia · ${variantLabel(variant)}` : 'Referencia de mercado'}</p>
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
        <div role="status" aria-label="Cargando referencia de precio" className="mt-1">
          <Skeleton className="h-9 w-40" />
        </div>
      ) : hasPrice ? (
        <>
          <p className="text-display text-positive tabular-nums"><AnimatedNumber value={usd} format={formatMoney} /></p>
          {showUsdSecondary ? (
            <p className="-mt-1 text-caption text-tertiary tabular-nums">{formatPrice(usd, 'USD')}</p>
          ) : null}
          {currency === 'ARS' ? <p className="text-caption text-secondary">Referencia internacional convertida</p> : null}
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

      {currency === 'ARS' ? <p className="text-caption text-tertiary">{activeRate ? `1 USD = ${formatPrice(activeRate.rate, 'ARS')} (${activeRate.rateType})${fetchedAt ? ` · cotización del ${formatDate(fetchedAt)}` : ''}${rateIsStale ? ' · cotización cambiaria anterior' : ''}` : 'Cotización cambiaria actual no disponible'}</p> : null}

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
            'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]',
          )}
        >
          {content}
        </button>
      ) : (
        <div className="flex w-full flex-col items-start gap-1 p-4">{content}</div>
      )}
      {cardId && !isLoading && hasPrice ? (
        <div className="px-4 pb-4"><PriceHistory cardId={cardId} variant={variant} provider={provider === null ? 'legacy' : provider === 'tcgdex' || provider === 'tcgcsv' || provider === 'scrydex' || provider === 'pokemontcg.io' ? provider : undefined} /></div>
      ) : null}
    </Surface>
  );
}

export { NO_PRICE_COPY };
