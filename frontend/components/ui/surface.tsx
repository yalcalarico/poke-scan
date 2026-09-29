import { createElement } from 'react';

import { cn } from '@/lib/cn';

export type SurfaceElement = 'div' | 'section' | 'article' | 'aside';

export interface SurfaceProps {
  /** `p-4` estándar; `p-5` cuando la superficie lleva título. */
  padded?: boolean;
  as?: SurfaceElement;
  /** Sube a `shadow-md` para lo que flota sobre otra superficie. */
  elevated?: boolean;
  /** Hover y cursor, para superficies que se comportan como target. */
  interactive?: boolean;
  className?: string;
  children?: React.ReactNode;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/**
 * Antes esto eran `rounded-xl border border-slate-800 bg-slate-900/40 p-4` en
 * 15 archivos, con 4 radios y 5 paddings distintos. Borde y sombra van
 * siempre juntos: en dark la sombra casi no se ve y el borde hace el trabajo,
 * pero la clase es la misma en los dos temas para no bifurcar el JSX.
 */
export function Surface({
  padded = true,
  as = 'div',
  elevated = false,
  interactive = false,
  className,
  children,
  ...rest
}: SurfaceProps) {
  return createElement(
    as,
    {
      ...rest,
      className: cn(
        'rounded-surface border border-line bg-surface shadow-sm',
        padded ? 'p-4' : 'p-0',
        elevated && 'shadow-md',
        interactive &&
          'transition-colors duration-fast ease-standard hover:border-line-strong hover:bg-surface-2',
        className,
      ),
    },
    children,
  );
}
