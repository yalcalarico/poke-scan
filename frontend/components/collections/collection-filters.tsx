'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Repeat2 } from 'lucide-react';

import { Chip, chipVariants } from '@/components/ui';

/** Cuántas cartas se piden por página en cada modo. */
export type CollectionScope = 'all' | 'duplicates';

export interface CollectionFiltersProps {
  scope: CollectionScope;
  onScopeChange: (scope: CollectionScope) => void;
  /** Independiente del `scope`: "duplicadas para intercambio" tiene que ser una combinación, no una tercera pestaña. */
  forTradeOnly: boolean;
  onForTradeChange: (value: boolean) => void;
  /** Destino del chip "Sets" (`/colecciones/[id]/sets`). */
  setsHref: string;
  /**
   * Enlaza el chip con su `Alert` explicativo por `aria-describedby`. Se pasa
   * `false` cuando el filtro ya es server-side y no hay nada que aclarar.
   */
  showTradeNotice?: boolean;
}

/**
 * La fila de filtros del detalle: Todas · Duplicadas · Para intercambio · Sets.
 *
 * ## Por qué `Chip` con `aria-pressed` y no un `role="tablist"`
 *
 * §11 es explícito: si el contenido cambia pero la pantalla no, son `Chip` con
 * `aria-pressed`; un tablist exige `tabpanel`, `aria-controls`, `tabindex`
 * roving y flechas ← →. Un `role="tablist"` a medio hacer, sin panel ni teclado,
 * es peor que no usar tabs.
 *
 * ## Por qué "Sets" es un `Link` y no un `Chip`
 *
 * Porque cambia la URL: `ScreenHeader` + ruta nueva, no un filtro de la misma
 * pantalla. El criterio de §11 lo dice sin ambigüedad, y por eso se arma con
 * `chipVariants` sobre un `<Link>` con `aria-current="page"` — el `Chip` es un
 * `<button>` y un botón no navega. Es el mismo criterio que el de `Button`
 * ("los links usan `next/link` con las clases de `buttonVariants`").
 *
 * ## Por qué "Intercambio" no es una tercera pestaña
 *
 * Como checkbox al lado de un tablist, "Duplicadas" y "Para intercambio" se
 * podían combinar. Dos chips con `aria-pressed` no: si "Todas" y "Intercambio"
 * estuvieran ambos presionados, "Todas" no estaría diciendo nada. "Intercambio"
 * es entonces un modificador independiente con su propio `aria-pressed`, y
 * "Todas" es el estado sin filtros — por eso "Ver todas" lo apaga.
 */
export function CollectionFilters({
  scope,
  onScopeChange,
  forTradeOnly,
  onForTradeChange,
  setsHref,
  showTradeNotice = false,
}: CollectionFiltersProps) {
  const pathname = usePathname();
  const isSetsActive = pathname === setsHref || pathname.startsWith(`${setsHref}/`);

  const isAll = scope === 'all' && !forTradeOnly;

  return (
    <div
      role="group"
      aria-label="Filtros de la colección"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <Chip
        active={isAll}
        onClick={() => {
          onScopeChange('all');
          if (forTradeOnly) onForTradeChange(false);
        }}
      >
        <LayoutGrid aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
        Todas
      </Chip>

      <Chip active={scope === 'duplicates'} onClick={() => onScopeChange('duplicates')}>
        Duplicadas
      </Chip>

      {/*
        El `aria-describedby` apunta al `Alert` que explica que el filtro corre
        sobre lo cargado. Va condicionado por prop para que la fila se pueda
        reusar en una pantalla donde sí sea server-side sin arrastrar el aviso.
      */}
      <Chip
        active={forTradeOnly}
        onClick={() => onForTradeChange(!forTradeOnly)}
        aria-describedby={showTradeNotice && forTradeOnly ? 'aviso-intercambio' : undefined}
      >
        <Repeat2 aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
        Intercambio
      </Chip>

      <Link
        href={setsHref}
        aria-current={isSetsActive ? 'page' : undefined}
        className={chipVariants({ mode: 'filter', size: 'md', active: isSetsActive })}
      >
        Sets
      </Link>
    </div>
  );
}
