'use client';

import { Layers } from 'lucide-react';

import { Badge, StatValue, Surface } from '@/components/ui';
import { useCurrency } from '@/hooks/use-currency';
import type { CollectionStatsResponse } from '@/lib/api/collections';

import { formatCount } from './collection-options';

export interface CollectionSummaryProps {
  name: string;
  /** Bajada del nombre: cantidad de cartas y fecha de creación. */
  subtitle: string;
  /** Valor total en **USD**. Lo formatea `useCurrency`; el crudo nunca sale de acá. */
  totalValueUsd: number | null;
  isDefault?: boolean;
  isPartial?: boolean;
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
  isPartial = false,
}: CollectionSummaryProps) {
  const { formatMoney } = useCurrency();

  return (
    <Surface as="section" className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-control bg-brand-soft text-brand"
        >
          <Layers focusable="false" strokeWidth={1.75} className="h-5 w-5" />
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="break-words text-h3 text-primary" title={name}>
              {name}
            </p>
            {isDefault ? <Badge tone="brand">Principal</Badge> : null}
          </div>
          <p className="text-caption text-secondary" title={subtitle}>
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-col items-start sm:items-end">
        {/*
          `text-overline` ya trae `uppercase`, así que el copy va en minúscula y
          se ve en caja alta sola.
        */}
        <p className="text-overline text-tertiary">{isPartial ? 'Valor parcial' : 'Valor'}</p>
        <p className="break-all text-display text-positive tabular-nums">{totalValueUsd === null ? '—' : formatMoney(totalValueUsd)}</p>
      </div>
    </Surface>
  );
}

export interface CollectionStatsProps {
  stats: CollectionStatsResponse;
}

/** El valor ya está en la cabecera; acá quedan los cuatro conteos. */
export function CollectionStats({ stats }: CollectionStatsProps) {
  return (
    <dl className="grid grid-cols-4 gap-2 border-y border-line py-3">
      {[
        ['Cartas', stats.totalCards], ['Únicas', stats.uniqueCards],
        ['Duplicadas', stats.duplicateCards], ['Sets', stats.setsCount],
      ].map(([label, value]) => <div key={label} className="flex min-w-0 flex-col gap-1">
        <dt className="text-caption text-tertiary">{label}</dt>
        <StatValue value={formatCount(Number(value))} />
      </div>)}
    </dl>
  );
}
