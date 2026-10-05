import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

import { Spinner } from './spinner';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-control font-label',
    'transition-[color,background-color,border-color,transform,box-shadow] duration-fast ease-standard',
    'active:scale-[0.98]',
    // El indicador de foco es `outline` y no `ring` (WCAG 2.2 SC 1.4.11), y va
    // a color pleno. El patrón viejo —`ring-brand/20`— medía 1.38:1 sobre una
    // superficie clara: no llega a los 3:1 que pide la norma, y el `ring`
    // además es un `box-shadow`, que el UA fuerza a `none` en high contrast,
    // justo donde más se lo necesita. `outline-offset: 2px` además da el aire
    // que el anillo nunca tuvo.
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]',
    'disabled:pointer-events-none disabled:active:scale-100',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-press',
        secondary:
          'border border-line bg-surface text-primary shadow-xs hover:bg-surface-2 dark:bg-surface-2',
        ghost: 'text-secondary hover:bg-surface-3 hover:text-primary',
        destructive: 'bg-negative text-on-brand hover:opacity-90',
        inverse: 'bg-surface text-primary shadow-xs hover:bg-surface-2',
      },
      size: {
        sm: 'h-8 px-3.5 text-label',
        // 44 px en `md` (§0.5). Antes eran 40: `md` es el tamaño **default**, o
        // sea el de todos los botones de la app, y el default es el que decide
        // si la regla se cumple o no. `sm` sigue en 32 (§8.1 lo reserva para
        // acciones terciarias en una fila densa) y `lg` en 48.
        md: 'h-11 px-4 text-label',
        lg: 'h-12 px-5 text-body-strong',
        icon: 'h-11 w-11 p-0',
      },
      isDisabled: {
        true: 'text-disabled',
        false: '',
      },
    },
    compoundVariants: [
      {
        variant: ['primary', 'destructive'],
        isDisabled: true,
        class: 'bg-surface-3 text-disabled shadow-none',
      },
      {
        variant: ['secondary', 'inverse'],
        isDisabled: true,
        class: 'border-line bg-surface-2 text-disabled shadow-none',
      },
      { variant: 'ghost', isDisabled: true, class: 'hover:bg-transparent' },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      isDisabled: false,
    },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

/**
 * `isDisabled` se omite de la API pública: existe solo para que `cva` resuelva
 * el color de apagado según la variante, y se deriva del `disabled` nativo +
 * `loading`. Dejarla expuesta se filtraría al DOM como atributo inválido.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof buttonVariants>, 'disabled' | 'isDisabled'> {
  loading?: boolean;
  /**
   * Reemplaza el children mientras carga. Sin esto el botón se estrecha y baila.
   *
   * También es lo que evita el nombre accesible vacío: con `loading` y sin
   * `pendingLabel`, un botón de `children` puramente visuales se queda mudo
   * (WCAG 2.2 SC 4.1.2, *Name, Role, Value*), porque el `Spinner` es
   * `aria-hidden`. El primitivo lo resuelve solo —los `children` van a un
   * `sr-only`— así que el `pendingLabel` es opcional de verdad; lo que aporta
   * es el texto **visible** del estado ocupado, que es una decisión de copy.
   */
  pendingLabel?: React.ReactNode;
  fullWidth?: boolean;
}

/**
 * No hay `asChild`: el `Button` es siempre un `<button>`. Los links usan
 * `next/link` con las clases de `buttonVariants` re-exportadas, porque un
 * `<button>` con `href` no navega y un `<a>` sin `href` no es enfocable.
 */
export function Button({
  className,
  variant,
  size,
  disabled,
  loading = false,
  pendingLabel,
  fullWidth = false,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled ?? false;

  return (
    <button
      {...props}
      type={type}
      disabled={isDisabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        buttonVariants({
          variant,
          size,
          isDisabled: isDisabled || loading,
        }),
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? <Spinner size="sm" className="shrink-0" /> : null}
      {/* Texto del botón. Sin `loading` es el de siempre. Con `loading` y
          `pendingLabel` es el nuevo, y los `children` se van porque el
          reemplazo de texto ahí sí es decisión del consumidor. */}
      {loading
        ? pendingLabel ?? <span className="sr-only">{children}</span>
        : children}
    </button>
  );
}

export { buttonVariants };
