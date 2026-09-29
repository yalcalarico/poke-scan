import { cn } from '@/lib/cn';

const SPACING = {
  none: 'my-0',
  sm: 'my-3',
  md: 'my-4',
  lg: 'my-6',
} as const;

const LINE_SPACING = {
  none: 'my-0',
  sm: 'my-2',
  md: 'my-3',
  lg: 'my-4',
} as const;

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerSpacing = keyof typeof SPACING;

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: DividerOrientation;
  /** Convierte el `<hr>` en una fila con texto adentro. */
  label?: string;
  spacing?: DividerSpacing;
}

/**
 * `<hr>` cuando no tiene label, y `role="separator"` sobre un `div` cuando lo
 * tiene: no se puede poner texto adentro de un `<hr>`.
 *
 * El separador decorativo lleva `aria-hidden`: antes había `<hr>` con texto
 * suelto que los lectores de pantalla leían como un grupo de palabras sin
 * contexto.
 */
export function Divider({
  className,
  orientation = 'horizontal',
  label,
  spacing = 'md',
  ...props
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        className={cn('inline-block w-px self-stretch bg-line', LINE_SPACING[spacing], className)}
      />
    );
  }

  if (!label) {
    return (
      <hr
        {...props}
        className={cn('h-px w-full border-0 bg-line', SPACING[spacing], className)}
      />
    );
  }

  return (
    <div className={cn('flex items-center gap-3', SPACING[spacing], className)} {...props}>
      <span className="h-px flex-1 bg-line" />
      <span className="text-overline text-tertiary">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
