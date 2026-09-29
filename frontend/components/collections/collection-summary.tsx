'use client';

import { Layers } from 'lucide-react';

import { Badge, Stat, StatGrid, Surface } from '@/components/ui';
import { useCurrency } from '@/hooks/use-currency';
import type { CollectionStatsResponse } from '@/lib/api/collections';

import { formatCount } from './collection-options';

export interface CollectionSummaryProps {
  name: string;
  /** Bajada del nombre: cantidad de cartas y fecha de creación. */
  subtitle: string;
  /** Valor total en **USD**. Lo formatea `useCurrency`; el crudo nunca sale de acá. */
  totalValueUsd: number;
  isDefault?: boolean;
}

/**
 * El bloque de cabecera del detalle: `Surface` de dos columnas con el ícono de
 * la colección, su nombre, y a la derecha el valor. Es el componente de la
 * referencia de diseño, y reemplaza la fila de `<dl>` que antes estaba suelta
 * arriba del stats.
 *
 * ## Por qué el valor vive acá y no en un `Stat`
 *
 * El total es la cifra que el usuario vino a ver; un `Stat` la pone en
 * `text-h3` al lado de cuatro contadores y la vuelve una más. Acá va en
 * `text-display`, alineado a la derecha, que es como la muestra la referencia y
 * como se lee un número que se compara con el de otro lado de la app.
 */
export function CollectionSummary({
  name,
  subtitle,
  totalValueUsd,
  isDefault = false,
}: CollectionSummaryProps) {
  const { formatMoney } = useCurrency();

  return (
    <Surface as="section" className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-control bg-brand-soft text-brand"
        >
          <Layers focusable="false" strokeWidth={1.75} className="h-5 w-5" />
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-h3 text-primary" title={name}>
              {name}
            </p>
            {isDefault ? <Badge tone="brand">Principal</Badge> : null}
          </div>
          <p className="truncate text-caption text-tertiary" title={subtitle}>
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        {/*
          `text-overline` ya trae `uppercase`, así que el copy va en minúscula y
          se ve en caja alta sola.
        */}
        <p className="text-overline text-tertiary">Valor</p>
        <p className="text-display text-positive tabular-nums">{formatMoney(totalValueUsd)}</p>
      </div>
    </Surface>
  );
}

export interface CollectionStatsProps {
  stats: CollectionStatsResponse;
}

/**
 * Las cinco métricas de la colección, en el `StatGrid`.
 *
 * ## El huérfano
 *
 * Cinco stats en un `grid-cols-2` dejan una celda vacía (§8.7, y el anti-patrón
 * explícito de §12). `StatGrid columns={5}` lo resuelve solo: `grid-cols-2
 * md:grid-cols-3 lg:grid-cols-5` con `col-span-2 md:col-span-1` en la última, o
 * sea `2 + 2 + 1 a lo ancho` en mobile, `3 + 2` en `md` y las cinco en `lg`. El
 * `StatGrid` calcula el `col-span` mirando la cantidad de hijos, así que el
 * consumidor no se tiene que acordar de la regla — y por eso `columns={5}` y no
 * `columns={2}`: con `2` el `md:col-span-1` no existe y la última queda
 * estirada en el breakpoint de tablet.
 *
 * ## Por qué el valor está dos veces
 *
 * Una en el `CollectionSummary` (la cifra hero, `text-display`) y otra acá
 * (`text-h3`). Es redundante a propósito: la del resumen responde "¿cuánto vale
 * esta colección?" y esta responde "¿cómo se compone ese número?". Sacarla del
 * `StatGrid` es un cambio de una línea, pero deja el grupo de métricas en 4 y
 * el `2 + 2` pierde el salto de escala que lo hace legible.
 */
export function CollectionStats({ stats }: CollectionStatsProps) {
  const { formatMoney } = useCurrency();

  return (
    <StatGrid columns={5}>
      <Stat label="Cartas" value={formatCount(stats.totalCards)} />
      <Stat label="Únicas" value={formatCount(stats.uniqueCards)} />
      <Stat label="Duplicadas" value={formatCount(stats.duplicateCards)} />
      <Stat label="Sets" value={formatCount(stats.setsCount)} />
      <Stat label="Valor" value={formatMoney(stats.totalValueUsd)} tone="positive" />
    </StatGrid>
  );
}
