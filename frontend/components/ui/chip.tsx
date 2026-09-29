import { cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

const chipVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-label',
    'whitespace-nowrap transition-colors duration-fast ease-standard',
    // Ver el bloque de `Button`: el indicador de foco es un `outline` a color
    // pleno (WCAG 2.2 SC 1.4.11), no un `ring-brand/20` de 1.38:1. Pinta por
    // fuera del pill y por eso necesita aire: las filas de chips con scroll
    // horizontal tienen que dejar 4 px de padding vertical, o el `overflow` los
    // recorta. `carta/[id]/actions.tsx` ya lo tiene (`py-1`);
    // `rarity-filter.tsx` y `collection-filters.tsx` no, y hay que verlas.
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]',
  ],
  {
    variants: {
      mode: {
        // El filtro lleva borde porque flota sobre el canvas; el contenido va
        // sobre `bg-surface-2` y un borde invisible le da el mismo hit area.
        filter: 'border',
        content: 'border border-transparent',
      },
      size: {
        // 40 para el filtro (§0.5), 28 para el contenido (§8.4).
        //
        // El filtro subió de 36 a 40 porque es el control de la barra de filtros
        // de búsqueda, del filtro de rareza y del selector de modo: los tres en
        // el camino principal del pulgar, y los tres con el default `md`. Que
        // el default sea el que se mide es lo que decide si la regla se cumple.
        sm: 'h-7 px-2.5 text-caption',
        md: 'h-10 px-3.5 text-label',
      },
      active: {
        true: 'border-primary bg-primary text-inverse',
        false: 'border-line bg-surface text-secondary',
      },
    },
    defaultVariants: {
      mode: 'filter',
      size: 'md',
      active: false,
    },
  },
);

const TONE_CLASSES = {
  neutral: 'bg-surface-2 text-secondary',
  brand: 'border-brand-border bg-brand-soft text-brand',
  positive: 'border-positive-border bg-positive-soft text-positive',
  negative: 'border-negative-border bg-negative-soft text-negative',
  warning: 'border-warning-border bg-warning-soft text-warning',
  info: 'border-info-border bg-info-soft text-info',
} as const;

const ICON_SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
} as const;

/**
 * Apagado. Va **después** de `shape` y de `TONE_CLASSES` en el `cn()` del
 * componente, y no como una variante de `cva`, por una razón de orden: `cva`
 * concatena y no mergea, así que si el apagado fuera una variante las dos clases
 * de `bg-*` / `text-*` / `border-*` quedarían en el HTML y ganaría la última por
 * orden de la hoja de estilos, no por intención. Con `cn()` el merge resuelve el
 * conflicto explícitamente.
 *
 * Es la misma receta que el `compoundVariants` del `Button`, que existe por el
 * mismo motivo: en un chip el color puede venir de la variante `active` **o** del
 * `tone`, y hay que ganarle a los dos.
 */
const DISABLED_CLASSES =
  'pointer-events-none border-line-subtle bg-surface-2 text-disabled';

export type ChipTone = keyof typeof TONE_CLASSES;
export type ChipMode = 'filter' | 'content';
export type ChipSize = keyof typeof ICON_SIZES;

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  /** `filter` (default) o `content`. El `tone` solo aplica en `content`. */
  mode?: ChipMode;
  active?: boolean;
  size?: ChipSize;
  /** Solo con `mode="content"`: en `filter` el color lo define `active`. */
  tone?: ChipTone;
  icon?: LucideIcon;
  iconPosition?: 'start' | 'end';
  /**
   * Estado no disponible. Antes no existía y el atributo nativo pasaba al DOM
   * sin que nada se viera distinto: el chip se veía igual de apretable y solo
   * dejaba de hacer algo. Se implementa acá y no como variante de `cva` porque el
   * color tiene que ganarle tanto al `active` de la variante como al `tone`; ver
   * `DISABLED_CLASSES`.
   */
  disabled?: boolean;
}

/**
 * La pieza central del look nuevo: pills claros con el activo invertido a
 * negro (§8.4). El rojo se reserva para precio y CTA, así que el filtro activo
 * no usa `bg-brand`.
 *
 * El `tone` vive en un mapa aparte y no en `cva` a propósito: en `content` el
 * color pisa el `active` de la variante, y `cva` no puede expresar "el tone
 * gana" sin un `compoundVariant` por cada tone.
 */
export function Chip({
  className,
  mode = 'filter',
  active = false,
  size,
  tone = 'neutral',
  icon: Icon,
  iconPosition = 'start',
  type = 'button',
  disabled = false,
  children,
  ...props
}: ChipProps) {
  // El filtro se resuelve a `md` (40 px) y el contenido a `sm` (28 px), y esa
  // asimetría es deliberada: el filtro es el control de la barra y vive solo,
  // mientras que el chip de contenido vive **adentro** de una card, al lado de
  // un precio o de un contador. Subir el de contenido a 40 no lo haría más
  // accesible —el objetivo real sigue siendo la fila de la card— y desarmaría
  // la retícula de `carta/[id]`. Es la excepción que §0.5 pide justificar, y
  // §8.4 ya la fija en 28. Los dos tamaños siguen siendo públicos para el
  // consumidor que sí quiera un chip de contenido grande.
  const resolvedSize: ChipSize = size ?? (mode === 'content' ? 'sm' : 'md');
  const isContent = mode === 'content';
  // En contenido el `active` no se aplica: no hay nada que imponer sobre el `tone`.
  // Y apagado tampoco: si el chip se ve activo no se lee como no disponible, así
  // que el apagado fuerza el color de reposo de la variante.
  const shape = chipVariants({
    mode,
    size: resolvedSize,
    active: isContent || disabled ? false : active,
  });

  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      aria-pressed={isContent ? undefined : active}
      className={cn(
        shape,
        isContent && !disabled && TONE_CLASSES[tone],
        !isContent && !active && !disabled && 'hover:bg-surface-2 hover:text-primary',
        disabled && DISABLED_CLASSES,
        className,
      )}
    >
      {Icon && iconPosition === 'start' ? (
        <Icon
          aria-hidden="true"
          focusable="false"
          strokeWidth={1.75}
          className={ICON_SIZES[resolvedSize]}
        />
      ) : null}
      {children}
      {Icon && iconPosition === 'end' ? (
        <Icon
          aria-hidden="true"
          focusable="false"
          strokeWidth={1.75}
          className={ICON_SIZES[resolvedSize]}
        />
      ) : null}
    </button>
  );
}

export { chipVariants };
