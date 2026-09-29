'use client';

import { cva, type VariantProps } from 'class-variance-authority';

import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/cn';

/**
 * `default` no lleva clase de color a propósito: el `Money` hereda el color del
 * contexto (un `text-positive` de un `Alert`, un `text-primary` de una ficha).
 * Ponerle `text-primary` fijo le ganaría al padre y rompería el `tone` de
 * cualquier consumidor que lo use dentro de un tono.
 */
const TONE_CLASSES = {
  default: '',
  positive: 'text-positive',
  negative: 'text-negative',
  brand: 'text-brand',
} as const;

/**
 * Tres pasos de la escala, no cuatro: el precio vive en un `caption` (chip de
 * colección), en un `label` (tile de catálogo) o en un `body-strong` (celda de
 * una tabla). La cifra hero de una pantalla (`PriceHero`) no usa este
 * componente: es un `display` y necesita tracking, no solo color.
 */
const SIZE_CLASSES = {
  sm: 'text-caption',
  md: 'text-label',
  lg: 'text-body-strong',
} as const;

export type MoneyTone = keyof typeof TONE_CLASSES;
export type MoneySize = keyof typeof SIZE_CLASSES;

const moneyVariants = cva(
  // `tabular-nums` va siempre, sin excepción: dos precios de la misma columna
  // que no alinean el decimal se leen como si fueran distintos (§3.2).
  'tabular-nums',
  {
    variants: {
      tone: TONE_CLASSES,
      size: SIZE_CLASSES,
    },
    defaultVariants: { tone: 'default', size: 'md' },
  },
);

export interface MoneyProps
  extends Omit<React.ComponentPropsWithoutRef<'span'>, 'children'>,
    VariantProps<typeof moneyVariants> {
  /** Monto en **USD**. El valor crudo siempre es USD; la conversión es del cliente. */
  usd: number | null | undefined;
}

/**
 * El precio en la moneda activa del usuario, y **nada más**: no decide el
 * color, no decide el tamaño y no formatea a mano.
 *
 * Es un **componente** y no un hook a propósito, aunque lo único que hace sea
 * llamar a `useCurrency().formatMoney`: así puede vivir dentro de un Server
 * Component (`/carta/[id]`, `/share/[slug]`), que es donde el precio llega sin
 * haber pasado por el cliente. Un hook obligaría a que toda la rama del
 * Server Component fuera `'use client'` y arrastrara el grafo entero.
 *
 * - El `tone` lo pone el consumidor (`positive` para el valor de una carta,
 *   `negative` para una variación), nunca el componente: el color del dinero
 *   es `positive` por defecto semántico pero un delta negativo es `negative`
 *   aunque sea plata (§2.3).
 * - `className` es para **ubicación** (ancho, margen, alineación), nunca para
 *   la forma. Para la forma están `tone` y `size`.
 * - `formatMoney` ya devuelve `—` ante `null`/`undefined`/no finito, así que
 *   este componente nunca imprime `$0.00` ni un espacio.
 */
export function Money({
  usd,
  tone = 'default',
  size = 'md',
  className,
  ...props
}: MoneyProps) {
  const { formatMoney } = useCurrency();

  return (
    <span {...props} className={cn(moneyVariants({ tone, size }), className)}>
      {formatMoney(usd)}
    </span>
  );
}

export interface ShowOrDashProps extends MoneyProps {
  /** Copy del `aria-label` cuando no hay precio. */
  label?: string;
  /** Se pasa a `Money` cuando **sí** hay valor. */
  moneyClassName?: string;
}

/**
 * `Money` o el guion de "no hay precio" (§9.2, §12).
 *
 * Imprime el monto si hay, y `—` si no hay. Un `null` explícito ("sabemos que
 * no tiene precio") y un `undefined` ("no lo sabemos todavía") se dibujan
 * igual acá: la diferencia entre "no hay" y "no lo sé" la resuelve **quien
 * llama** — el `CardTile` no dibuja fila de precio cuando el dato no vino, en
 * vez de llenar la grilla de guiones.
 */
export function ShowOrDash({ usd, label = 'Sin precio', className, moneyClassName, ...props }: ShowOrDashProps) {
  if (usd === null) {
    return (
      <span aria-label={label} className={cn('text-tertiary', className)}>
        —
      </span>
    );
  }

  return <Money {...props} usd={usd} className={cn(className, moneyClassName)} />;
}

export { moneyVariants };
