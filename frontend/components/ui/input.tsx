import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * El lenguaje visual de un control de texto, compartido con `Textarea` (§8.3).
 *
 * Vive acá y no en un módulo aparte porque son exactamente dos consumidores y
 * los dos son el mismo objeto visual; un archivo de constantes para eso sería
 * estructura sin decisión.
 *
 * El estado de error se pinta **desde `aria-invalid`** y no desde el prop
 * `invalid`: si el consumidor pone el atributo a mano, el borde y el anillo
 * cambian igual, y lo que se anuncia nunca puede desincronizarse de lo que se ve.
 */
export const controlBaseClasses = [
  // El borde en reposo es `--border-control` y no `border` (=`--border-default`):
  // contra el `bg-surface-2` propio del control, `--border-default` mide
  // 1.19:1 y el campo deja de leerse como campo para leerse como texto suelto.
  // WCAG 2.2 SC 1.4.11 pide 3:1 para el límite de un control de formulario. El
  // token es solo para esto: los separadores decorativos siguen en
  // `--border-default`, que está exento por ser decorativos.
  'w-full min-w-0 rounded-control border border-[color:var(--border-control)] bg-surface-2 text-body text-primary',
  'placeholder:text-disabled',
  'transition-[color,background-color,border-color,box-shadow] duration-fast ease-standard',
  // El indicador de foco es obligatorio (§8.3, §11): antes había 17 elementos
  // con `focus:outline-none` y sin alternativa, que es un fallo de WCAG 2.4.7.
  //
  // Y es `outline` y no `ring` por dos motivos concretos (WCAG 2.2 SC 1.4.11):
  // el `ring-brand/20` viejo medía 1.38:1 sobre superficie clara, y el `ring` es
  // un `box-shadow`, que el UA fuerza a `none` en high contrast. A diferencia de
  // los `<button>`, acá el disparador es `focus:` y no `focus-visible:`: un
  // campo de texto tiene que avisar que está activo también cuando lo enfocás
  // con el click, que es como lo enfocás el 100 % de las veces en mobile.
  'focus:border-brand focus:outline-2 focus:outline-offset-2 focus:outline-[color:var(--focus-ring)]',
  'aria-[invalid=true]:border-negative aria-[invalid=true]:focus:border-negative',
  // En el estado de error el indicador cambia a `--negative` a color pleno, que
  // es lo que hacía el `ring-negative/20` viejo pero sin el alfa: el rojo queda
  // para decir "acá hay algo mal" también mientras el campo está enfocado.
  'aria-[invalid=true]:focus:outline-[color:var(--negative)]',
  'disabled:cursor-not-allowed disabled:border-line-subtle disabled:bg-surface-3 disabled:text-disabled',
];

const inputVariants = cva(controlBaseClasses, {
  variants: {
    /*
     * Alturas 32 / 44 / 48 de §8.3. El padding vertical va derivado de la altura
     * (y + 2 px de borde = alto pedido) en lugar del `py-2.5` nominal de §4.1:
     * con un `h-*` fijo, un `py-2.5` deja 18 px de caja de contenido para 22 px
     * de interlineado y el texto se recorta. El horizontal sí sigue la tabla.
     *
     * `md` pasó de 40 a 44 px (§0.5) y su `py-2.5` viene de la misma cuenta:
     * 44 - 2 de borde - 22 de interlineado = 20, o sea 10 de cada lado. Con el
     * `py-2` de antes quedaban 26 px de caja para 22 px de texto, que no
     * recorta pero afloja el centrado vertical.
     */
    size: {
      sm: 'h-8 px-3.5 py-1',
      md: 'h-11 px-4 py-2.5',
      lg: 'h-12 px-5 py-3',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

/**
 * Espacio que se le cede al adorno, para que no quede texto debajo del ícono.
 *
 * Son valores **horizontales** y no dependen del alto del campo, así que el
 * cambio de `md` a 44 px no los toca: los adornos van con `absolute` +
 * `-translate-y-1/2`, o sea que el centrado vertical se recalcula solo. El
 * `pr-*` sí se revisó, porque el toggle de `PasswordInput` y el `IconButton` del
 * buscador de `search-controls` se anclan a `right-1` (4 px) y el texto tiene que
 * terminar antes de que empiece el botón.
 */
const LEADING_PADDING = { sm: 'pl-9', md: 'pl-10', lg: 'pl-10' } as const;
/** `right-1` (4) + botón de 40 (md/lg) + 4 de aire = 48; en `sm` el botón es de 32. */
const TRAILING_PADDING = { sm: 'pr-10', md: 'pr-12', lg: 'pr-12' } as const;
const ICON_SIZES = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-5 w-5' } as const;

export type InputSize = NonNullable<VariantProps<typeof inputVariants>['size']>;

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'>,
    VariantProps<typeof inputVariants> {
  /**
   * Setea `aria-invalid` (y con eso el borde y el indicador rojos). Es el mismo
   * estado que el `Field` pasa como `invalid`: ver el JSDoc de `Field` para por
   * qué no puede propagarse solo.
   */
  invalid?: boolean;
  /** Ícono decorativo a la izquierda. `aria-hidden`: el nombre lo da el label. */
  leadingIcon?: LucideIcon;
  /** Nodo a la derecha (el toggle de `PasswordInput`). Entra en ~40 px. */
  trailingSlot?: ReactNode;
}

/**
 * El input del sistema. Sustituye los 7 estilos de input que había copiados a
 * mano.
 *
 * Siempre envuelve el `<input>` en un `div.relative` para poder posicionar
 * `leadingIcon` y `trailingSlot`. Por eso el `className` va al **wrapper**: es
 * la caja que se estira dentro de un `Field` o de un grid, y lo que el
 * consumidor quiere ubicar casi nunca es el input pelado. El input lleva
 * `w-full` por su cuenta.
 */
export function Input({
  className,
  size = 'md',
  invalid,
  leadingIcon: LeadingIcon,
  trailingSlot,
  type = 'text',
  'aria-invalid': ariaInvalid,
  ...props
}: InputProps) {
  const resolvedSize: InputSize = size ?? 'md';

  return (
    <div className={cn('relative w-full', className)}>
      {LeadingIcon ? (
        <LeadingIcon
          aria-hidden="true"
          focusable="false"
          strokeWidth={1.75}
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary',
            ICON_SIZES[resolvedSize],
          )}
        />
      ) : null}

      <input
        {...props}
        type={type}
        aria-invalid={ariaInvalid ?? (invalid ? true : undefined)}
        className={cn(
          inputVariants({ size: resolvedSize }),
          LeadingIcon && LEADING_PADDING[resolvedSize],
          trailingSlot && TRAILING_PADDING[resolvedSize],
        )}
      />

      {trailingSlot ? (
        <div className="absolute right-1 top-1/2 -translate-y-1/2">{trailingSlot}</div>
      ) : null}
    </div>
  );
}

export { inputVariants };
