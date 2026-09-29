import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

import { Spinner } from './spinner';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-control font-label',
    'transition-[color,background-color,border-color,transform,box-shadow] duration-fast ease-standard',
    'active:scale-[0.98]',
    'focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:ring-brand/40',
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
        md: 'h-10 px-4 text-label',
        lg: 'h-12 px-5 text-body-strong',
        icon: 'h-10 w-10 p-0',
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
  /** Reemplaza el children mientras carga. Sin esto el botón se estrecha y baila. */
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
      {loading && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export { buttonVariants };
