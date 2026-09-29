import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

const SIZES = {
  // 40 es el mínimo de todo control tappable (§0.5).
  sm: 'h-10 w-10',
  // 44 en `ScreenHeader` y `Sheet`, que es donde el doc lo pide (§8.2).
  md: 'h-11 w-11',
} as const;

const ICON_SIZES = {
  sm: 'h-5 w-5',
  md: 'h-5 w-5',
} as const;

export type IconButtonSize = keyof typeof SIZES;

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Obligatorio: el botón no tiene texto visible, el nombre va acá. */
  label: string;
  size?: IconButtonSize;
}

/**
 * Ícono + `aria-label`. El ícono va siempre `aria-hidden` (el `label` del botón
 * ya lo nombra); un ícono con texto alternativo propio duplica el anuncio en
 * la mayoría de los lectores.
 *
 * No hay tooltip propio: `title` alcanza para desktop y no estorba en touch.
 */
export function IconButton({
  icon: Icon,
  label,
  size = 'sm',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      title={props.title ?? label}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control text-secondary',
        'transition-colors duration-fast ease-standard',
        'hover:bg-surface-3 hover:text-primary',
        // Ver el bloque de `Button`: el indicador de foco es un `outline` a
        // color pleno (WCAG 2.2 SC 1.4.11), no un `ring-brand/20` de 1.38:1.
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]',
        'disabled:pointer-events-none disabled:text-disabled',
        SIZES[size],
        className,
      )}
    >
      <Icon aria-hidden="true" focusable="false" strokeWidth={1.75} className={ICON_SIZES[size]} />
    </button>
  );
}
