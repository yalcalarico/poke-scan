import type { ComponentPropsWithoutRef, KeyboardEvent, ReactNode } from 'react';

import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

const VALUE_TONES = {
  default: 'text-secondary',
  brand: 'text-brand',
  positive: 'text-positive',
  negative: 'text-negative',
  warning: 'text-warning',
} as const;

export type StatRowValueTone = keyof typeof VALUE_TONES;

/**
 * El modo decide la semántica, y el chrome es siempre el mismo.
 *
 * | `as` | elemento | rol | `dt`/`dd` | interactivo |
 * |---|---|---|---|---|
 * | `dl` (default sin `onClick`) | `div` | — | sí | no |
 * | `button` (default con `onClick`) | `div` | `button` | no | sí |
 * | `link` | `div` | — | no | sí, el `<Link>` lo envuelve |
 * | `listitem` | `div` | `listitem` | no | sí, sin `role="button"` |
 */
export type StatRowAs = 'dl' | 'button' | 'link' | 'listitem';

export interface StatRowProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'onClick' | 'title'> {
  title: ReactNode;
  value: ReactNode;
  valueTone?: StatRowValueTone;
  /** Metadato bajo el título, del mismo grupo `dt`/`dd`. */
  description?: ReactNode;
  icon?: LucideIcon;
  /** Default `true` en los modos interactivos, `false` en `dl`. */
  chevron?: boolean;
  /** Default: `button` con `onClick`, `dl` sin `onClick`. */
  as?: StatRowAs;
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
  'aria-label'?: string;
}

const INTERACTIVE =
  'transition-colors duration-fast ease-standard hover:bg-surface-2 active:bg-surface-3';

/**
 * La fila `Administrar  1/4  ›` de la referencia. El nombre viene de que
 * originalmente era la fila de detalle de una colección; acá es una fila de
 * acción con label a la izquierda, valor a la derecha y chevron.
 *
 * **Por qué un componente con modos y no cuatro archivos:** el chrome es
 * idéntico, y una fila que se clickea no es un par término/definición. Con
 * `dt`/`dd` adentro de un `role="button"` el lector de pantalla anuncia el
 * contenido como texto del botón y se pierde la relación; al revés, un
 * `role="button"` adentro de un `<dl>` rompe el `dl > div > (dt, dd)` que
 * define la spec de HTML. El modo lo elige el consumidor según el contenedor
 * que ya tiene, y el default sale de las props.
 *
 * ```tsx
 * <dl><StatRow title="Únicas" value="12" /></dl>
 * <dl><StatRow title="Total" value="$29.850" valueTone="positive" /></dl>
 * <ul role="list"><StatRow as="listitem" title="Administrar" value="1/4" /></ul>
 * <Link href="/colecciones/1"><StatRow as="link" title="Administrar" value="1/4" /></Link>
 * <StatRow onClick={abrir} title="Administrar" value="1/4" icon={Settings2} />
 * ```
 *
 * El archivo no lleva `'use client'` porque no tiene estado. El `onClick` lo
 * tiene que pasar un padre client, pero eso no obliga a que el módulo sea
 * client: si lo fuera, un Server Component no podría ni importarlo para el
 * caso estático.
 */
export function StatRow({
  title,
  value,
  valueTone = 'default',
  description,
  icon: Icon,
  chevron,
  as,
  onClick,
  onKeyDown,
  className,
  ...props
}: StatRowProps) {
  const mode: StatRowAs = as ?? (onClick ? 'button' : 'dl');
  const isButton = mode === 'button';
  const isInteractive = mode !== 'dl';
  // En `link` el clic lo maneja el `<a>` de afuera: el `StatRow` no debe
  // duplicar la navegación ni convertirse en tab-stop.
  const handlesClick = (isButton || mode === 'listitem') && Boolean(onClick);
  const showChevron = chevron ?? isInteractive;

  // Solo `dl` conserva la semántica de definición; en los otros modos la fila
  // es una acción y `dt`/`dd` serían ruido para el lector de pantalla.
  const TitleTag = mode === 'dl' ? 'dt' : 'span';
  const ValueTag = mode === 'dl' ? 'dd' : 'span';
  const DescriptionTag = mode === 'dl' ? 'dd' : 'span';

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (!handlesClick || !onClick) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // Sin esto el espacio scrollea la página.
    event.preventDefault();
    onClick();
  };

  return (
    <div
      {...props}
      role={isButton ? 'button' : mode === 'listitem' ? 'listitem' : undefined}
      tabIndex={handlesClick ? 0 : undefined}
      onClick={handlesClick ? onClick : undefined}
      onKeyDown={isInteractive ? handleKeyDown : onKeyDown}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-control px-3 py-2.5',
        isInteractive && INTERACTIVE,
        // El puntero solo si hay algo clickeable: en `listitem` sin `onClick`
        // el consumidor pone el Link adentro y la fila no es el target.
        (isButton || mode === 'link' || handlesClick) && 'cursor-pointer',
        // El indicador va en el elemento que recibe el foco: en `button` es el
        // div, en `link` es el `<a>` de afuera, y `focus-within` lo levanta.
        // Mismo patrón que `Button`: `outline` a color pleno (SC 1.4.11) en vez
        // del `ring-brand/20` de 1.38:1.
        isButton &&
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]',
        (mode === 'link' || mode === 'listitem') &&
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[color:var(--focus-ring)]',
        className,
      )}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-2 text-secondary"
        >
          <Icon focusable="false" strokeWidth={1.75} className="h-4 w-4" />
        </span>
      ) : null}

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <TitleTag className="truncate text-body-strong text-primary">{title}</TitleTag>
        {description ? (
          <DescriptionTag className="text-caption text-secondary">{description}</DescriptionTag>
        ) : null}
      </span>

      <ValueTag className={cn('shrink-0 text-body tabular-nums', VALUE_TONES[valueTone])}>
        {value}
      </ValueTag>

      {showChevron ? (
        <ChevronRight
          aria-hidden="true"
          focusable="false"
          strokeWidth={1.75}
          className="h-4 w-4 shrink-0 text-tertiary"
        />
      ) : null}
    </div>
  );
}
