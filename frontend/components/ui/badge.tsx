import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-overline',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-secondary',
        brand: 'bg-brand-soft text-brand',
        positive: 'bg-positive-soft text-positive',
        negative: 'bg-negative-soft text-negative',
        warning: 'bg-warning-soft text-warning',
        info: 'bg-info-soft text-info',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/**
 * Chip no interactivo de 20 px con `text-overline` (§8.5): rareza, número de
 * carta, supertype, estado de un enlace. Si necesita `onClick` es un `Chip`,
 * no un `Badge` — un badge pulsable no anuncia su estado.
 *
 * Sin borde: a 20 px el borde se come el padding y deja de leerse como chip.
 */
export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span {...props} className={cn(badgeVariants({ tone }), className)} />;
}

export { badgeVariants };
