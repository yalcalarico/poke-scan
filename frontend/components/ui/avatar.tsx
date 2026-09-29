import Image from 'next/image';

import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'h-8 w-8 text-caption',
  md: 'h-10 w-10 text-label',
  lg: 'h-12 w-12 text-h3',
  xl: 'h-16 w-16 text-h2',
} as const;

/** Píxeles reales por tamaño: `next/image` necesita un tamaño intrínseco. */
const PIXELS = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
} as const;

export type AvatarSize = keyof typeof SIZES;

export interface AvatarProps {
  src?: string | null;
  /** Obligatoria aunque haya `src`: es el fallback, el `alt` y el nombre accesible. */
  name: string;
  size?: AvatarSize;
  className?: string;
}

/** Iniciales: la primera letra del primer nombre y del último, o la primera. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 1);
  return `${words[0].slice(0, 1)}${words[words.length - 1].slice(0, 1)}`;
}

/**
 * Toda imagen pasa por `next/image` (§12), así que el `src` se mide con el
 * tamaño del token y no con `fill`: un avatar siempre es cuadrado y siempre
 * tiene su lugar en el layout antes de que cargue el archivo.
 *
 * El `alt` es `name` y no vacío: un avatar es la identidad de una persona y
 * "imagen" no le dice nada al lector de pantalla.
 */
export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const pixel = PIXELS[size];
  const initials = initialsOf(name);

  if (!src) {
    return (
      <span
        role="img"
        aria-label={name}
        className={cn(
          'inline-flex shrink-0 select-none items-center justify-center overflow-hidden',
          'rounded-full bg-brand-soft font-semibold uppercase text-brand',
          SIZES[size],
          className,
        )}
      >
        {initials}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={name}
      width={pixel}
      height={pixel}
      className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)}
    />
  );
}
