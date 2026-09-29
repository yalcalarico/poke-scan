import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type ContainerTag = 'main' | 'div' | 'section';

/** Los atributos del elemento, sin los tres que el componente ya expone. */
type ContainerRest = Omit<
  ComponentPropsWithoutRef<ContainerTag>,
  'className' | 'id' | 'children' | 'aria-labelledby'
>;

export interface ScreenContainerProps extends ContainerRest {
  children: ReactNode;
  /** Solo para ubicación. Pisa el ancho y el ritmo de acá, no los reemplaza. */
  className?: string;
  /** Default: `"contenido"`, que es a donde apunta el skip link. */
  id?: string;
  /** Azúcar de `aria-labelledby`; el nombre de la prop sigue siendo el del design system. */
  labelledBy?: string;
  as?: ContainerTag;
  /** Sin `max-w` ni `px`: para el scanner y la home, que son full-bleed. */
  bleed?: boolean;
}

/**
 * Ancho y ritmo de página.
 *
 * El `pb` reserva la `BottomNav` más el safe area: es el mismo número que usa
 * la nav para su propio inset, y si se desincronizan la última fila de cartas
 * queda debajo de la nav.
 *
 * ## El resto de los atributos
 *
 * Se aceptan sueltos y se mandan al elemento, para que un `loading.tsx` pueda
 * poner su `aria-busy="true"` (§11) en el `<main>` — que es la región que está
 * ocupada — en vez de escribir un `<main>` propio copiando las clases de ancho y
 * ritmo, o de dejar el atributo en un `<div>` interno que describe otra cosa.
 *
 * `className` e `id` no entran por el resto: son props propias y se resuelven
 * después, así que un `className` del call site **pisa** el ancho por defecto en
 * vez de pelearse con él, y un `id` pisa `"contenido"` a propósito.
 */
export function ScreenContainer({
  children,
  className,
  id = 'contenido',
  labelledBy,
  as: Tag = 'main',
  bleed = false,
  ...rest
}: ScreenContainerProps) {
  return (
    <Tag
      id={id}
      aria-labelledby={labelledBy}
      {...rest}
      className={cn(
        !bleed &&
          'mx-auto w-full max-w-6xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
