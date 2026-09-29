import { cn } from '@/lib/cn';

/** El track no se tintea: siempre es superficie hundida, el color es el relleno. */
const TRACK = 'w-full overflow-hidden rounded-full bg-surface-3';

const FILL = {
  brand: 'bg-brand',
  positive: 'bg-positive',
  negative: 'bg-negative',
  info: 'bg-info',
  neutral: 'bg-line-strong',
} as const;

const BAR_SIZES = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
} as const;

export type ProgressTone = keyof typeof FILL;
export type ProgressSize = keyof typeof BAR_SIZES;

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Porcentaje 0–100. Se recorta solo: un 108 no debe dibujar fuera del track. */
  value: number;
  tone?: ProgressTone;
  size?: ProgressSize;
  /** Nombre accesible de lo que se está midiendo. */
  label?: string;
  /** Oculta el valor numérico del anuncio cuando el texto cercano ya lo dice. */
  hideValue?: boolean;
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Progreso con valor conocido (`role="progressbar"` + `aria-valuenow`).
 *
 * El relleno transiciona con `--duration-base`: el ancho cambia después de
 * que llegan los datos, y sin transición la barra salta de 0 al valor final.
 */
export function Progress({
  value,
  tone = 'brand',
  size = 'md',
  label,
  hideValue = false,
  className,
  ...props
}: ProgressProps) {
  const clamped = clamp(value);

  return (
    <div
      {...props}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={hideValue ? undefined : `${clamped}%`}
      aria-label={label}
      className={cn(TRACK, BAR_SIZES[size], className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-base ease-standard',
          FILL[tone],
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export interface MeterProps extends ProgressProps {
  /** Obligatorio: es el único nombre que recibe el usuario (§11). */
  label: string;
}

/**
 * La barra de confianza del scanner. Es `role="img"` y no `progressbar` a
 * propósito: no es algo que avanza, es una lectura puntual ("Coincidencia 84
 * por ciento"). Un `progressbar` haría esperar que la barra llegue a 100.
 */
export function Meter({ value, tone = 'brand', size = 'sm', label, className, ...props }: MeterProps) {
  const clamped = clamp(value);

  return (
    <div
      {...props}
      role="img"
      aria-label={label}
      className={cn(TRACK, BAR_SIZES[size], className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-base ease-standard',
          FILL[tone],
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

