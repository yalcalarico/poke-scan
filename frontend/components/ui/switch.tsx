'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

/*
 * 44×26 el `md` y 36×22 el `sm` (§8.3). Todas las medidas salen de la escala
 * dinámica de Tailwind (`w-11` = 44, `h-6.5` = 26, `translate-x-4.5` = 18), así
 * que no hay ni un valor arbitrario.
 *
 * El recorrido del knob es exactamente `ancho - 2 borde - 2 padding - knob`:
 * md → 44 - 2 - 4 - 20 = 18, sm → 36 - 2 - 4 - 18 = 12. Si se cambia un tamaño
 * hay que recalcular el `TRAVEL` del mismo, o el knob se sale del track.
 */
const TRACK = {
  sm: 'h-5.5 w-9 p-0.5',
  md: 'h-6.5 w-11 p-0.5',
} as const;

const KNOB = {
  sm: 'size-4.5',
  md: 'size-5',
} as const;

const TRAVEL = {
  sm: 'translate-x-3',
  md: 'translate-x-4.5',
} as const;

export type SwitchSize = keyof typeof TRACK;

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Nombre visible, en un `<label htmlFor>` real (no label envolviendo). */
  label?: ReactNode;
  description?: string;
  disabled?: boolean;
  size?: SwitchSize;
  /** Solo para ubicación. */
  className?: string;
}

/**
 * El toggle "on/off" (§8.3). Controlado: `checked` y `onCheckedChange` son
 * obligatorios, como en `Sheet` con `open`/`onClose`. Un switch que administra
 * su propio estado no se puede resetear desde un formulario ni sincronizar con
 * un submit, y en la app hay al menos un caso de eso (preferencias que viven en
 * el backend).
 *
 * El track mide 26 px de alto, menos de los 44 px que pide §0.5. La excepción
 * está justificada: la fila completa es tappable (el label es el target del
 * click y del foco) y por encima del switch hay padding de la fila, así que el
 * objetivo real es de 44 px sin inflar el control visual.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className,
}: SwitchProps) {
  const controlId = useId();
  const descriptionId = description ? `${controlId}-description` : undefined;
  const hasText = (label !== undefined && label !== null) || Boolean(description);

  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-4 py-1', className)}>
      {hasText ? (
        /*
          El wrapper es una columna, pero el `<label>` envuelve **solo** el
          texto del label. La descripción va como hermana, no dentro: dentro, el
          algoritmo de nombre accesible concatena todo el contenido del label y
          el switch se anunciaba como "Modo oscuroSigue la preferencia del
          sistema" — el nombre deja de ser el texto que el usuario ve, y la
          descripción además se oía dos veces: una en el nombre y otra por el
          `aria-describedby` de abajo. Afuera, el nombre es el label y la
          descripción llega una sola vez, por su vía.
        */
        <span className="flex min-w-0 flex-col">
          {label !== undefined && label !== null ? (
            <label htmlFor={controlId} className="min-w-0">
              <span className={cn('text-body', disabled ? 'text-disabled' : 'text-primary')}>
                {label}
              </span>
            </label>
          ) : null}
          {description ? (
            <span id={descriptionId} className="text-caption text-secondary">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}

      <button
        id={controlId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex shrink-0 items-center rounded-full border',
          'transition-colors duration-fast ease-standard',
          // Ver el bloque de `Button`: el indicador de foco es un `outline` a
          // color pleno (WCAG 2.2 SC 1.4.11), no un `ring-brand/20` de 1.38:1.
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          // El borde es lo que da el contraste del componente contra el canvas
          // (§2.4): `--border-default` no alcanza 3:1, `--border-strong` sí.
          // El riel apagado, en cambio, no usa `--surface-3`: el knob va en
          // `--surface` y contra ese gris la posición OFF se leía en 1.16:1 —se
          // veía el switch, pero no dónde estaba el knob—. `--switch-track-off`
          // es el color de la posición, no el del control genérico, y sube solo
          // con el tema.
          checked
            ? 'border-brand bg-brand'
            : 'border-line-strong bg-[color:var(--switch-track-off)]',
          TRACK[size],
        )}
      >
        {/*
          El knob no cambió de color: el que estaba mal era el riel. Con el
          riel en `--switch-track-off` los dos lados del knob tienen su propio
          color de estado, y el `shadow-xs` sigue estando ahí para separar las
          dos superficies cuando el navegador las dibuja pegadas.
        */}
        <span
          aria-hidden="true"
          className={cn(
            'block rounded-full shadow-xs',
            'transition-transform duration-fast ease-standard',
            KNOB[size],
            checked ? cn('bg-on-brand', TRAVEL[size]) : 'translate-x-0 bg-surface',
          )}
        />
      </button>
    </div>
  );
}
