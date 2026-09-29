import { LoaderCircle } from 'lucide-react';

import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const;

export type SpinnerSize = keyof typeof SIZES;

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Solo para ubicación. El color lo decide el padre. */
  className?: string;
}

/**
 * El spinner único de la app (había 3 estilos distintos). Es decorativo:
 * siempre `aria-hidden`, y el texto de carga lo pone quien lo muestra, porque
 * un `aria-label` en un elemento sin rol no lo anuncia ningún lector de
 * pantalla.
 */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <LoaderCircle
      aria-hidden="true"
      focusable="false"
      strokeWidth={1.75}
      className={cn('animate-spin', SIZES[size], className)}
    />
  );
}
