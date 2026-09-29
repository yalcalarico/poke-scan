import { cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

const chipVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-label',
    'whitespace-nowrap transition-colors duration-fast ease-standard',
    'focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40',
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
        // 36 para el filtro, 28 para el contenido (§8.4).
        sm: 'h-7 px-2.5 text-caption',
        md: 'h-9 px-3.5 text-label',
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
  children,
  ...props
}: ChipProps) {
  const resolvedSize: ChipSize = size ?? (mode === 'content' ? 'sm' : 'md');
  const isContent = mode === 'content';
  // En contenido el `active` no se aplica: no hay nada que imponer sobre el `tone`.
  const shape = chipVariants({ mode, size: resolvedSize, active: isContent ? false : active });

  return (
    <button
      {...props}
      type={type}
      aria-pressed={isContent ? undefined : active}
      className={cn(
        shape,
        isContent && TONE_CLASSES[tone],
        !isContent && !active && 'hover:bg-surface-2 hover:text-primary',
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
