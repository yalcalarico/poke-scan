'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { useState, type ChangeEvent, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

import { controlBaseClasses } from './input';

/*
 * Sin `h-*`: un textarea crece con `rows` y lo que se puede es `resize-y`. El
 * piso (`min-h-24`) existe para que un `rows={2}` con placeholder no quede con
 * la altura de un campo de una línea.
 */
const textareaVariants = cva([...controlBaseClasses, 'block min-h-24 resize-y'], {
  variants: {
    size: {
      sm: 'px-3.5 py-1.5',
      md: 'px-4 py-2.5',
      lg: 'px-5 py-3',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export type TextareaSize = NonNullable<VariantProps<typeof textareaVariants>['size']>;

/**
 * El tipo de `value` de un textarea es `string | number | readonly string[]`
 * (nunca en la práctica, pero es lo que dice el DOM). El contador necesita un
 * largo, así que se normaliza acá en vez de castear con `as`.
 */
function toText(value: TextareaHTMLAttributes<HTMLTextAreaElement>['value']): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.join('');
  return '';
}

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'>,
    VariantProps<typeof textareaVariants> {
  rows?: number;
  /** Igual que en `Input`: setea `aria-invalid`. */
  invalid?: boolean;
  /**
   * Muestra el contador de `maxLength`. Por defecto se prende solo si hay
   * `maxLength`: un contador sin tope que contar no significa nada.
   */
  showCount?: boolean;
}

/**
 * Mismo lenguaje visual que `Input` (§8.3) con `resize-y` y contador de
 * caracteres.
 *
 * Es client component solo por el contador: para dibujar "412 / 500" hay que
 * conocer el valor, y un textarea no controlado no lo expone sin estado. El
 * estado interno solo existe si el consumidor **no** pasa `value`, así que el
 * camino controlado —el de todos los formularios de la app— no paga nada por él.
 */
export function Textarea({
  className,
  size = 'md',
  rows = 3,
  invalid,
  showCount,
  value,
  defaultValue,
  maxLength,
  onChange,
  'aria-invalid': ariaInvalid,
  ...props
}: TextareaProps) {
  // `useState<string>` explícito: sin el genérico, el estado heredaría la unión
  // del `defaultValue` del DOM y el contador no tendría `.length`.
  const [internalValue, setInternalValue] = useState<string>(toText(defaultValue));
  const isControlled = value !== undefined;
  const currentValue = isControlled ? toText(value) : internalValue;
  const hasMax = typeof maxLength === 'number';
  const withCount = showCount ?? hasMax;

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    if (!isControlled) setInternalValue(event.target.value);
    onChange?.(event);
  }

  const isAtLimit = hasMax && currentValue.length >= maxLength;

  return (
    <div className={cn('flex w-full min-w-0 flex-col', className)}>
      <textarea
        {...props}
        rows={rows}
        maxLength={maxLength}
        value={isControlled ? value : internalValue}
        onChange={handleChange}
        aria-invalid={ariaInvalid ?? (invalid ? true : undefined)}
        className={textareaVariants({ size: size ?? 'md' })}
      />

      {/*
       * El contador es texto estático, no `aria-live`: anunciarlo en cada tecla
       * sería insoportable. El tope ya lo anuncia el `maxLength` nativo.
       */}
      {withCount && hasMax ? (
        <p
          className={cn(
            'mt-1 text-right text-caption tabular-nums',
            isAtLimit ? 'text-negative' : 'text-tertiary',
          )}
        >
          {currentValue.length} / {maxLength}
        </p>
      ) : null}
    </div>
  );
}

export { textareaVariants };
