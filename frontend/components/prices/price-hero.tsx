'use client';

import { BarChart3 } from 'lucide-react';

import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import { Alert, Skeleton, Surface } from '@/components/ui';

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
 *
 * ## La serie va adentro del `Surface`, no al lado
 *
 * Abajo del `PriceDelta`, y **dentro** del mismo bloque, incluso del mismo
 * `<button>` cuando hay detalles para abrir. Un bloque hermano abriría un hueco
 * de 12 px entre la cifra y su contexto y haría que la línea pareciera otra
 * tarjeta. Y no hay problema de semántica: el `Sparkline` es un `<figure>` con
 * nombre accesible y sin nada enfocable adentro, así que el botón sigue siendo
 * un control con un único nombre, que es lo que ya se anunciaba.
 *
 * La composición es de mayor a menor de tamaño hacia abajo —cifra `display`, delta
 * de `label`, línea de 32 px con `stroke` de 2— y por eso la línea no compite
 * con el número ni con la carta (§0.2). Es contexto, no un dashboard: sin ejes,
 * sin leyenda, sin tooltip.
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
          <p className="text-display text-positive tabular-nums">{formatMoney(usd)}</p>
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

      {/*
        La serie solo se dibuja si hay `cardId` **y** hay cifra. Una línea de
        tendencia sobre un precio que todavía no se sabe, o sobre el guion de
        "sin precio", es una afirmación que la pantalla no puede sostener: el
        `Sparkline` es un contexto, y no hay contexto de un dato que no existe.
      */}
      {cardId && !isLoading && hasPrice ? (
        <PriceHistory cardId={cardId} className="mt-1" />
      ) : null}

      {!isLoading && !hasPrice ? (
        <Alert tone="warning" size="sm" className="mt-3 w-full">
          {NO_PRICE_COPY}
        </Alert>
      ) : null}
    </>
  );

  /*
   * El `PriceHistory` va **adentro** del `<button>`, no al lado.
   *
   * Parece raro meter un gráfico en un botón, pero la alternativa —un bloque
   * hermano debajo del `Surface`— abre un hueco de 12 px entre la cifra y su
   * contexto y hace que la línea parezca otra tarjeta. Y no hay problema de
   * semántica: el `Sparkline` es un `<figure aria-label>` sin nada
   * enfocable adentro, así que sigue siendo un único control con un único
   * nombre accesible (el nombre del botón), que es lo que ya se anunciaba.
   */
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
    </Surface>
  );
}

export { NO_PRICE_COPY };
