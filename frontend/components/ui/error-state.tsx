import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Alert, RetryButton } from './alert';

const DEFAULT_TITLE = 'No pudimos cargar esto';

export interface ErrorStateProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'children'> {
  /** Qué pasó. Default: neutro, porque cada pantalla sabe qué le falló. */
  title?: string;
  /** El mensaje del backend, si lo hay. Va arriba de la guía. */
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Acción principal del error, después del reintento. */
  action?: ReactNode;
  /** Acción terciaria debajo del mensaje ("Ver estado del servicio"). */
  supportingAction?: ReactNode;
  className?: string;
}

/**
 * El estado de error, y es **otro componente** que `EmptyState` a propósito
 * (§8.11): antes los dos se pintaban con el mismo chrome, así que un error se
 * leía como "no hay nada acá" y el usuario no entendía si había que reintentar o
 * esperar.
 *
 * Va montado sobre `Alert tone="error"`, así que el chrome, el `role="alert"` y
 * el `RetryButton` no se duplican: acá solo está el copy.
 *
 * El cuerpo es **qué pasó + qué hacer** (§10.2). Nunca "Error desconocido" ni
 * "Algo salió mal": con el mensaje del backend arriba y la guía abajo, el
 * usuario siempre tiene una acción.
 */
export function ErrorState({
  title = DEFAULT_TITLE,
  message,
  onRetry,
  retrying = false,
  action,
  supportingAction,
  className,
  ...props
}: ErrorStateProps) {
  // Sin `onRetry` no tiene sentido decir "reintentá": el componente no ofrece esa
  // acción y el copy no puede prometer lo que no está en pantalla.
  const hint = onRetry
    ? 'Revisá tu conexión y reintentá.'
    : 'Si sigue pasando, probá de nuevo en un rato.';

  const actions =
    onRetry || action ? (
      <div className="flex flex-wrap items-center gap-2">
        {onRetry ? <RetryButton onClick={onRetry} pending={retrying} /> : null}
        {action}
      </div>
    ) : undefined;

  return (
    <Alert
      {...props}
      tone="error"
      title={title}
      action={actions}
      className={cn(className)}
    >
      <div className="flex flex-col gap-1">
        {message ? <p>{message}</p> : null}
        <p>{hint}</p>
        {supportingAction ? <div className="mt-1">{supportingAction}</div> : null}
      </div>
    </Alert>
  );
}
