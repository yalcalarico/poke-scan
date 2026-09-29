import { Children, cloneElement, isValidElement } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

const VALUE_TONES = {
  default: 'text-primary',
  positive: 'text-positive',
  brand: 'text-brand',
  warning: 'text-warning',
} as const;

export type StatTone = keyof typeof VALUE_TONES;

/**
 * Todas las grillas arrancan en 2 columnas porque la referencia es 390 px
 * (§0.1, §7.1). `odd` es el `col-span` del último stat cuando el conteo es
 * impar: resuelve el huérfano en mobile y lo deshace en el breakpoint donde la
 * grilla ya tiene columnas para todos.
 */
const GRID = {
  2: { cols: 'grid-cols-2', odd: 'col-span-2' },
  3: { cols: 'grid-cols-2 md:grid-cols-3', odd: 'col-span-2 md:col-span-1' },
  4: { cols: 'grid-cols-2 md:grid-cols-4', odd: 'col-span-2 md:col-span-1' },
  5: { cols: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5', odd: 'col-span-2 md:col-span-1' },
} as const;

export type StatGridColumns = keyof typeof GRID;

export interface StatValueProps extends ComponentPropsWithoutRef<'dd'> {
  value: ReactNode;
  tone?: StatTone;
}

/**
 * Solo la cifra, sin el `dt`. Existe para el consumidor que arma su propio
 * layout de `dl/dt/dd` (una fila con label a la izquierda, un hero con el
 * total arriba) y quiere el `text-h3 tabular-nums` sin reescribirlo.
 *
 * Renderiza un `<dd>`: va dentro de un `<dl>`.
 */
export function StatValue({ value, tone = 'default', className, ...props }: StatValueProps) {
  return (
    <dd {...props} className={cn('text-h3 tabular-nums', VALUE_TONES[tone], className)}>
      {value}
    </dd>
  );
}

export interface StatProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  label: string;
  value: ReactNode;
  tone?: StatTone;
  icon?: LucideIcon;
}

/**
 * Una métrica del grid. Sustituye las 5 implementaciones que había
 * (`components/collections/collection-card.tsx` y otras, con 3 radios y 3
 * paddings distintos), y usa `dt`/`dd` de verdad en vez de dos `<p>`.
 *
 * Renderiza el grupo `dt` + `dd`, o sea el hijo de `<dl>` que la spec de HTML
 * permite envolver. Por eso va dentro de un `StatGrid` o de un `<dl>` propio: un
 * `Stat` suelto en el medio de un `div` no es HTML válido.
 *
 * `tone` es para el **valor**, no para la celda: la celda es siempre la
 * superficie interior `bg-surface-2` de §2.2, y un `Stat` que se pinta entero de
 * rojo compite con la carta, que es la protagonista (§0.2).
 */
export function Stat({ label, value, tone = 'default', icon: Icon, className, ...props }: StatProps) {
  return (
    <div {...props} className={cn('flex flex-col gap-1 rounded-control bg-surface-2 p-3', className)}>
      <dt className="flex items-center gap-1.5 text-overline text-tertiary">
        {Icon ? (
          <Icon aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-3.5 w-3.5" />
        ) : null}
        {label}
      </dt>
      <StatValue value={value} tone={tone} />
    </div>
  );
}

export interface StatGridProps extends ComponentPropsWithoutRef<'dl'> {
  /**
   * Columnas. En mobile toda grilla de stats es de 2, así que la regla del
   * huérfano se aplica siempre en la base.
   */
  columns?: StatGridColumns;
}

/**
 * Compone N `Stat` y pone el `<dl>` alrededor.
 *
 * **Regla de §8.7 resuelta acá, no en el call site:** un conteo impar de stats
 * en una grilla de 2 columnas deja un hueco feo. En vez de forbidding (que deja
 * al consumidor descubriéndolo en el render) el último stat se estira a
 * `col-span-2` y se lee como el total de la pantalla, que es exactamente el
 * patrón que el doc propone para los conjuntos de 5. Con 5 stats queda
 * `2 + 2 + 1 full`: la aritmética del `2 + 3` del doc, sin el hueco.
 *
 * El `className` del último hijo se completa por acá, así que el consumidor
 * escribe los `Stat` sin acordarse de la regla.
 */
export function StatGrid({ columns = 2, className, children, ...props }: StatGridProps) {
  const items = Children.toArray(children);
  const { cols, odd } = GRID[columns];
  // Impar + grilla par = huérfano. `0` es par y `1` se estira a ancho completo.
  const hasOddCount = items.length % 2 === 1;

  return (
    <dl {...props} className={cn('grid gap-3', cols, className)}>
      {items.map((child, index) => {
        if (!hasOddCount || index !== items.length - 1) return child;
        if (!isValidElement<{ className?: string }>(child)) return child;

        return cloneElement(child, { className: cn(child.props.className, odd) });
      })}
    </dl>
  );
}
