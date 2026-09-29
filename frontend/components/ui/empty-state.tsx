import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

import { Surface } from './surface';

/**
 * `first-use`: nunca usaste la feature → el copy explica el valor y va con un
 * CTA primario.
 * `no-results`: la query no devolvió nada → el copy repite el criterio, porque
 * "Sin resultados" sin decir el criterio deja al usuario creyendo que la app
 * está rota (§8.11, §10.2).
 */
export type EmptyStateKind = 'first-use' | 'no-results';

const SIZES = {
  sm: { wrap: 'gap-2.5 px-4 py-8', icon: 'h-8 w-8', title: 'text-body-strong' },
  md: { wrap: 'gap-3 px-6 py-12', icon: 'h-10 w-10', title: 'text-h3' },
} as const;

export type EmptyStateSize = keyof typeof SIZES;

const ICON_TONES = {
  neutral: 'text-tertiary',
  brand: 'text-brand',
} as const;

export type EmptyStateTone = keyof typeof ICON_TONES;

/** Máximo 2 líneas (§10.1), y siempre termina en punto. */
function defaultDescription(kind: EmptyStateKind, query?: string): string {
  if (kind === 'first-use') return 'Escaneá tu primera carta y armá tu colección.';

  return query
    ? `No encontramos cartas para «${query}». Probá con otro nombre o quitá los filtros.`
    : 'No encontramos nada con esos filtros. Probá con otros o empezá de cero.';
}

export interface EmptyStateProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'children'> {
  kind?: EmptyStateKind;
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Solo para `no-results`: el criterio que se repite en el copy. */
  query?: string;
  action?: ReactNode;
  size?: EmptyStateSize;
  /** `brand` cuando el ícono es el foco del estado (ej. el escáner). */
  tone?: EmptyStateTone;
  className?: string;
}

/**
 * El estado vacío. Separa las dos cosas que antes iban con el mismo chrome:
 * `first-use` (la app es nueva para vos) y `no-results` (tu filtro no devolvió
 * nada). **Nunca** para un error: eso es `ErrorState` (§8.11).
 *
 * Construido sobre `Surface` (§8.6), pero sin `role="status"`: esta pantalla se
 * renderiza con el resto del contenido, no cambia sola, y una región viva
 * anunciaría "Sin resultados" dos veces en el primer render.
 */
export function EmptyState({
  kind = 'first-use',
  icon: Icon,
  title,
  description,
  query,
  action,
  size = 'md',
  tone = 'neutral',
  className,
  ...props
}: EmptyStateProps) {
  const sizeConfig = SIZES[size];

  return (
    <Surface
      as="div"
      padded={false}
      {...props}
      className={cn('flex flex-col items-center text-center', sizeConfig.wrap, className)}
    >
      {Icon ? (
        <Icon
          aria-hidden="true"
          focusable="false"
          strokeWidth={1.75}
          className={cn('shrink-0', sizeConfig.icon, ICON_TONES[tone])}
        />
      ) : null}

      <div className="flex w-full max-w-sm flex-col gap-1">
        <p className={cn(sizeConfig.title, 'text-primary')}>{title}</p>
        <p className="text-body text-secondary">{description ?? defaultDescription(kind, query)}</p>
      </div>

      {action ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </Surface>
  );
}
