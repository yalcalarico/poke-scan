import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

/** Card tile del grid de búsqueda: la imagen manda, el chrome no compite (§0.2). */
const skeletonVariants = cva('bg-shimmer animate-shimmer', {
  variants: {
    variant: {
      text: 'h-3.5 w-full rounded-full',
      // `63/88` son los mm reales de una carta, no una aproximación (§14).
      card: 'aspect-[63/88] w-full rounded-surface',
      stat: 'h-8 w-16 rounded-control',
      avatar: 'size-10 rounded-full',
      block: 'h-24 w-full rounded-surface',
      sheet: 'h-64 w-full rounded-sheet',
    },
  },
  defaultVariants: {
    variant: 'text',
  },
});

export type SkeletonVariant = NonNullable<VariantProps<typeof skeletonVariants>['variant']>;

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
}

/**
 * Placeholder con la forma real del contenido, nunca con la de un dato
 * inventado (§9.2). Usa `shimmer` y no `animate-pulse`: el pulso se ve
 * "hospital" y el shimmer usa los tokens de `--shimmer-from/to` del tema.
 *
 * Siempre `aria-hidden`. El anuncio es responsabilidad del **contenedor**, no
 * del skeleton: el skeleton se repite N veces y N anuncios "cargando" son
 * ruido. El patrón es
 * `<div role="status" aria-label="Cargando cartas"><Skeleton …/></div>`
 * (ver `CardGridSkeleton`).
 */
export function Skeleton({ className, variant, ...props }: SkeletonProps) {
  return (
    <div {...props} aria-hidden="true" className={cn(skeletonVariants({ variant }), className)} />
  );
}

export interface CardGridSkeletonProps {
  count?: number;
  label?: string;
  /**
   * `collection` usa la grilla densa de §7.2 (solo imagen, 3 col en mobile);
   * `catalog` la de búsqueda (imagen + nombre y set, 2 col en mobile).
   */
  variant?: 'catalog' | 'collection';
  className?: string;
}

const GRIDS = {
  catalog: 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  collection: 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8',
} as const;

/**
 * El contenedor sí lleva `role="status"` + label: es el único elemento que le
 * dice al usuario que la pantalla está trabajando. Acá sí se anuncian las N
 * líneas porque no se anuncian nunca (son `aria-hidden`).
 */
export function CardGridSkeleton({
  count = 20,
  label = 'Cargando cartas',
  variant = 'catalog',
  className,
}: CardGridSkeletonProps) {
  return (
    <div role="status" aria-label={label} className={cn(GRIDS[variant], className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton variant="card" />
          {variant === 'catalog' ? (
            <>
              <Skeleton variant="text" />
              <Skeleton variant="text" className="w-3/5" />
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
