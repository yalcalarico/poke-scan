'use client';

import { useCallback, useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface CheckboxProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'size' | 'indeterminate' | 'aria-checked'
  > {
  /**
   * Tercer estado ("parcial"). Lo usa el checkbox de "para intercambio" con
   * selección múltiple, que marca la fila como parcialmente elegida sin poder
   * expresarlo.
   */
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /**
   * Nombre visible. Se renderiza como `<label htmlFor>` real: envolver el
   * checkbox con el label sin ponerle `id` deja el campo sin nombre
   * programático, y el lector de pantalla no anuncia nada.
   */
  label?: ReactNode;
  description?: string;
  /** Solo para ubicación. */
  className?: string;
}

/**
 * Checkbox nativo de 20×20 con `accent-brand` (§8.3).
 *
 * Se mantiene el input nativo en vez de uno dibujado a mano por tres cosas que
 * no salen de una clase: el radio del sistema en cada browser, el comportamiento
 * en modo de alto contraste y `forced-colors` (donde un `appearance-none` sin
 * `forced-color-adjust` se vuelve invisible), y el modo en que cada SO dibuja el
 * tilde. Un checkbox custom que se ve bien en el Safari de tu Mac y desaparece
 * con VoiceOver en iOS no es un win.
 *
 * Es client component por el estado indeterminado: `indeterminate` no es un
 * atributo HTML sino una propiedad del DOM, y la única forma de ponerla desde
 * React es un ref.
 */
export function Checkbox({
  id,
  className,
  indeterminate = false,
  checked,
  onChange,
  onCheckedChange,
  label,
  description,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = description ? `${controlId}-description` : undefined;

  /*
   * Ref con callback en lugar de `useEffect` a propósito: no hay render
   * intermedio donde el checkbox se pinte como vacío y después salte a
   * indeterminado, que es el flicker que se ve al abrir una fila de la lista.
   * React vuelve a llamar al ref cuando cambia la identidad del callback, y por
   * eso la dependencia es `indeterminate` y no el id.
   */
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      if (node) node.indeterminate = indeterminate;
    },
    [indeterminate],
  );

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        {...props}
        id={controlId}
        ref={setInputRef}
        type="checkbox"
        checked={checked}
        // `aria-checked="mixed"` es lo que anuncia el estado aunque el navegador
        // no llegue a pintarlo; el atributo manda sobre el estado que el input
        // reporta por sí solo.
        aria-checked={indeterminate ? 'mixed' : undefined}
        aria-describedby={descriptionId ?? props['aria-describedby']}
        onChange={(event) => {
          onChange?.(event);
          onCheckedChange?.(event.target.checked);
        }}
        // Ver el bloque de `Button`: el indicador de foco es un `outline` a
        // color pleno (WCAG 2.2 SC 1.4.11), no un `ring-brand/20` de 1.38:1.
        // Sobre un input nativo el `outline` es además el único indicador que
        // sobrevive a `forced-colors`, donde `accent-brand` se reescribe.
        className="mt-0.5 h-5 w-5 shrink-0 accent-brand disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
      />

      {label !== undefined && label !== null ? (
        <label htmlFor={controlId} className="flex min-w-0 flex-col">
          <span className="text-body text-primary">{label}</span>
          {description ? (
            <span id={descriptionId} className="text-caption text-secondary">
              {description}
            </span>
          ) : null}
        </label>
      ) : null}
    </div>
  );
}
