import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  /** Ícono opcional. Nunca es la única fuente de información (§8.14). */
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  /**
   * Nombre accesible del grupo. El label **visible** lo pone el consumidor como
   * texto arriba: el control no lo dibuja, así no hay dos_labels idénticos
   * peleándose por el mismo espacio en las pantallas de dos niveles
   * (moneda → tipo de dólar).
   */
  label: string;
  value: T;
  options: readonly SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/**
 * El control de 2 a 4 opciones excluyentes (moneda, tipo de dólar, tema).
 *
 * No es un `Chip`: el `Chip` es un filtro sobre un conjunto que puede crecer y
 * scrollea (§8.4), y el activo invertido a negro es un look de filtro. Acá las
 * opciones son **fijas y mutuamente excluyentes**, y todas tienen que estar
 * visibles a la vez porque el usuario está eligiendo entre un número cerrado de
 * cosas, no explorando. Por eso comparte paleta con el `Chip` activo
 * (`bg-primary text-inverse`: el rojo queda para el precio y el CTA) pero no
 * forma.
 *
 * Semántica: `role="group"` + `aria-pressed` en cada segmento, y no un
 * `tablist` ni `radiogroup`. No hay `tabpanel` que mostrar (el contenido no
 * cambia, cambia una preferencia) y el criterio de §11 es explícito: si el
 * contenido no cambia, son controles con `aria-pressed`.
 *
 * `h-11` en vez de los 36 px del `Chip`: son menos controles, más anchos, y en
 * una pantalla de ajustes se elige una sola vez. 44 px cumple §0.5 sin
 * excepción que justificar.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex gap-0.5 rounded-control border border-line bg-surface-2 p-0.5', className)}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-control px-3',
              'font-label transition-colors duration-fast ease-standard',
              // Ver el bloque de `Button`: el indicador de foco es un `outline`
              // a color pleno (WCAG 2.2 SC 1.4.11), no un `ring-brand/20` de
              // 1.38:1. El `outline-offset` de 2 px invade el `gap-0.5` del
              // vecino, y es aceptable: el grupo no tiene `overflow: hidden` y
              // un anillo de foco que se solapa con el segmento contiguo se
              // lee mejor que uno recortado.
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]',
              'disabled:pointer-events-none disabled:text-disabled',
              isActive
                ? 'bg-primary text-inverse shadow-xs'
                : 'text-secondary hover:bg-surface-3 hover:text-primary',
            )}
          >
            {Icon ? (
              <Icon
                aria-hidden="true"
                focusable="false"
                strokeWidth={1.75}
                className="h-4 w-4 shrink-0"
              />
            ) : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
