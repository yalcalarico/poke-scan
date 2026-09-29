import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { AlertCircle, AlertTriangle, Check, Info, RotateCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

import { Button } from './button';

/**
 * La tabla de §8.8, copiada literal. `success` usa los tokens `positive` a
 * propósito: el verde de la app es el del dinero y del éxito, no un verde
 * genérico de "ok" (§2.3).
 */
const TONES = {
  info: {
    wrap: 'border-info-border bg-info-soft',
    text: 'text-info',
    icon: Info,
  },
  success: {
    wrap: 'border-positive-border bg-positive-soft',
    text: 'text-positive',
    icon: Check,
  },
  warning: {
    wrap: 'border-warning-border bg-warning-soft',
    text: 'text-warning',
    icon: AlertTriangle,
  },
  error: {
    wrap: 'border-negative-border bg-negative-soft',
    text: 'text-negative',
    icon: AlertCircle,
  },
  neutral: {
    wrap: 'border-line bg-surface-2',
    text: 'text-secondary',
    icon: null,
  },
} as const satisfies Record<string, { wrap: string; text: string; icon: LucideIcon | null }>;

export type AlertTone = keyof typeof TONES;

const SIZES = {
  sm: {
    wrap: 'gap-2.5 px-3 py-2.5',
    icon: 'h-4 w-4',
    title: 'text-label',
    body: 'text-caption',
  },
  md: {
    wrap: 'gap-3 px-4 py-3',
    icon: 'h-5 w-5',
    title: 'text-body-strong',
    body: 'text-body',
  },
} as const;

export type AlertSize = keyof typeof SIZES;

export interface AlertProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'children'> {
  tone: AlertTone;
  title?: string;
  /** El ícono del tone. `neutral` no tiene: se pasa `undefined` explícito para quitarlo. */
  icon?: LucideIcon | null;
  action?: ReactNode;
  size?: AlertSize;
  className?: string;
  children?: ReactNode;
}

/**
 * El aviso único de la app: 5 tonos, 2 tamaños, un componente. Sustituye las 9
 * variantes que había, que eran 4 componentes distintos con el mismo propósito.
 *
 * - `role="alert"` **solo** en `error`: interrumpe al lector de pantalla y solo
 *   lo puede justificar un problema que necesita una acción. Los otros cuatro
 *   son `role="status"` + `aria-live="polite"`.
 * - El ícono es siempre `aria-hidden`: un ícono nunca es la única fuente de
 *   información, y si el mensaje se pierde el color no dice nada (§8.14).
 * - `tone="warning"` nunca es un error (§2.3): es "esto está viejo o no estamos
 *   seguros". Si dudás, pensá si el usuario puede igual hacer lo que quería.
 */
export function Alert({
  tone,
  title,
  icon,
  action,
  size = 'md',
  className,
  children,
  ...props
}: AlertProps) {
  const toneConfig = TONES[tone];
  const sizeConfig = SIZES[size];
  const isError = tone === 'error';
  const Icon = icon === undefined ? toneConfig.icon : icon;

  return (
    <div
      {...props}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? undefined : 'polite'}
      className={cn(
        'flex items-start rounded-control border',
        toneConfig.wrap,
        sizeConfig.wrap,
        className,
      )}
    >
      {Icon ? (
        <Icon
          aria-hidden="true"
          focusable="false"
          strokeWidth={1.75}
          className={cn('mt-0.5 shrink-0', sizeConfig.icon, toneConfig.text)}
        />
      ) : null}

      <div className="min-w-0 flex-1">
        {title ? (
          <p className={cn(sizeConfig.title, toneConfig.text)}>{title}</p>
        ) : null}
        {children ? (
          // `div` y no `p`: el cuerpo puede ser un texto suelto o un bloque con
          // acción terciaria, y meter un `div` adentro de un `p` es HTML
          // inválido.
          <div className={cn(title ? 'mt-1' : undefined, sizeConfig.body, toneConfig.text)}>
            {children}
          </div>
        ) : null}
      </div>

      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export interface RetryButtonProps
  extends Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'onClick'> {
  onClick?: () => void;
  /** `loading` del `Button` + el texto pasa a "Reintentando…". */
  pending?: boolean;
}

/**
 * El botón de reintentar, uno solo. Antes había seis copias con tres estilos:
 * cuatro primarios distintos y dos links de texto. Acá es siempre
 * `<Button size="sm" variant="secondary">` (§8.8): nunca texto plano porque un
 * link no dice que hay un botón, y nunca primario porque no compite con el CTA
 * de la pantalla (§8.1, una sola acción primaria).
 *
 * El texto no es prop: "Reintentar" es la palabra, no la opinión del
 * consumidor.
 *
 * Vive en este archivo y no en uno propio porque no es un componente de UI
 * genérico: es **la** acción de un `Alert tone="error"`, y separarla invita a
 * importarlo desde `alert.tsx` en vez de desde el lugar del `Alert`.
 */
export function RetryButton({ onClick, pending = false, className, ...props }: RetryButtonProps) {
  return (
    <Button
      {...props}
      type="button"
      variant="secondary"
      size="sm"
      onClick={onClick}
      loading={pending}
      pendingLabel="Reintentando…"
      className={className}
    >
      <RotateCw aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
      Reintentar
    </Button>
  );
}
