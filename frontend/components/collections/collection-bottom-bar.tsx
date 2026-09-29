'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

import { Money } from '@/components/cards/money';
import { buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';

import { formatCount } from './collection-options';

/**
 * El `pb` que el detalle le pasa al `ScreenContainer` para que el último tile no
 * quede bajo la barra.
 *
 * El `ScreenContainer` reserva `pb-[calc(5rem+env(safe-area-inset-bottom))]`, que
 * es 16 px más que la `BottomNav` (4rem) y alcanza para ella, pero no para la
 * barra que se le apoya encima (3.5rem más). 4 + 3.5 + 0.5 de aire = 8rem.
 * `tailwind-merge` resuelve el conflicto de `pb-*` a favor del `className`, así
 * que alcanza con pasarlo por prop y no hace falta tocar `ScreenContainer`.
 *
 * Va **siempre**, también en los estados de error y de colección vacía: el
 * padding de abajo es invisible ahí, y hacerlo condicional haría saltar el
 * layout en el momento exacto en que llegan los datos.
 *
 * El `lg:pb-16` es el otro lado del mismo cálculo: en `lg:` la `BottomNav` es el
 * navbar de arriba, así que la barra de la colección se apoya en el piso y solo
 * necesita su propia altura (3.5rem) más aire, no las 8rem de abajo.
 */
export const DETAIL_CONTENT_INSET = 'pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-16';

export interface CollectionBottomBarProps {
  /** Total de cartas de la colección, con duplicados. Sale de `/stats`, igual que el `CollectionSummary`. */
  totalCards: number;
  /** Valor total en **USD**. Lo formatea `Money`, que ya usa `useCurrency`. */
  totalValueUsd: number;
}

/**
 * La barra fija del detalle: el total de la colección y el botón de agregar.
 * Antes el botón de agregar flotaba sobre la card.
 *
 * ## Los insets
 *
 * Se apoya **encima** de la `BottomNav`, no la pisa. Las dos miden
 * `calc(4rem + env(safe-area-inset-bottom))` de alto desde el piso: la nav es
 * `h-16` (4rem) más su `pb-[env(safe-area-inset-bottom)]`, y la barra se
 * posiciona con `bottom` igual a ese mismo número. El `z-nav` es el de la nav
 * (§6) a propósito: si fuera mayor, en el único lugar donde se tocan —el borde
 * de arriba de la nav— la barra le ganaría al chrome global; con el mismo z gana
 * la nav por orden de documento, que es lo correcto.
 *
 * ## El botón es un `Link`, no un `IconButton`
 *
 * `IconButton` es un `<button>` y un botón no navega: el `Button` del design
 * system no tiene `asChild` justamente por eso, y los links se arman con
 * `next/link` + las clases de `buttonVariants`. El `Plus` lleva al catálogo, que
 * es donde se elige la carta para sumar.
 */
export function CollectionBottomBar({ totalCards, totalValueUsd }: CollectionBottomBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-nav border-t border-line bg-surface/90 shadow-md backdrop-blur-lg lg:bottom-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <p className="flex min-w-0 items-baseline gap-1.5 text-caption text-tertiary tabular-nums">
          <span className="truncate">
            {formatCount(totalCards)} {pluralize(totalCards, 'carta', 'cartas')}
          </span>
          <span aria-hidden="true">·</span>
          <Money usd={totalValueUsd} tone="positive" size="lg" className="shrink-0" />
        </p>

        <Link
          href={"/buscar"}
          aria-label="Buscar una carta para sumar"
          className={cn(buttonVariants({ variant: 'primary', size: 'icon' }), 'shrink-0')}
        >
          <Plus aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
}
