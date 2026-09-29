import { CircleAlert } from 'lucide-react';
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface FieldA11y {
  /** `htmlFor` del `<label>` y `id` del control. */
  id: string;
  /**
   * `id` del `<label>`.
   *
   * Existe para los controles que un `<label htmlFor>` **no** nombra: el
   * `Select` propio y el `Switch` renderizan un `<button>`, y el HTML solo
   * etiqueta `<input>`, `<select>`, `<textarea>`, `<button>`, `<meter>`,
   * `<output>` y `<progress>`. Para esos, el nombre tiene que entrar por
   * `aria-labelledby` apuntando acá, o el campo queda sin nombre accesible.
   */
  labelId: string;
  /** `id` del bloque de hint. */
  hintId: string;
  /** `id` del bloque de error. */
  errorId: string;
  /** Valor listo para `aria-describedby` del control. `undefined` si no hay nada que describir. */
  describedBy: string | undefined;
  /** `true` si hay `error`. Se pasa al control como `aria-invalid`. */
  invalid: boolean;
}

export interface UseFieldA11yOptions {
  /** Si no se pasa, sale de `useId()` y el consumidor no lo puede conocer. */
  id?: string;
  hint?: ReactNode;
  error?: ReactNode;
}

/** `''`, `null` y `undefined` no cuentan como contenido: evitan el `hint` vacío. */
function isPresent(value: ReactNode): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Lo único que el `Field` le inyecta al hijo, y lo mínimo que hace falta para
 * que un control que **no** es un `<label>`-nombrable quede con nombre.
 *
 * El tipo es deliberadamente abierto y no `React.HTMLAttributes<HTMLElement>`:
 * el hijo del `Field` es un **componente** del design system (`Select`, `Input`,
 * `Textarea`, `Switch`), no un elemento del DOM, y un componente no es
 * asignable a un tipo de props intrínsecas. Con este tipo, `cloneElement`
 * compila para cualquiera de ellos y el chequeo real queda en el runtime: el
 * componente que no sepa qué hacer con `aria-labelledby` lo ignora, que es
 * exactamente lo que tiene que pasar.
 */
interface FieldChildAriaProps {
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/**
 * `true` solo si el hijo es **un** elemento válido. Un array, un fragmento o un
 * string no se pueden clonar con props: hay que devolver el `children` tal cual
 * y que el consumidor resuelva el nombre a mano, pero sin reventar.
 */
function isInjectableChild(node: ReactNode): node is ReactElement<FieldChildAriaProps> {
  return isValidElement<FieldChildAriaProps>(node);
}

/**
 * El `aria-describedby` apunta a **una sola** cosa, y el error le gana al hint.
 * Se calcula acá y no en el componente para que el hook y `Field` no puedan
 * discrepar: si divergieran, el lector anunciaría un `id` que no existe.
 *
 * Recibe los `id` ya resueltos y no los arma: `Field` acepta `hintId`/`errorId`
 * como props, y si esta función los derivara de `controlId` el `Field` publicaría
 * un `describedBy` que no matchea el nodo que realmente renderiza.
 */
function resolveDescribedBy(
  errorId: string,
  hintId: string,
  hasHint: boolean,
  hasError: boolean,
) {
  if (hasError) return errorId;
  if (hasHint) return hintId;
  return undefined;
}

/**
 * Resuelve los `id` de un campo una sola vez, para que el `Field` y el control
 * hablen de los mismos `id` sin que nadie los escriba a mano.
 *
 * Existe por una limitación real de la API por composición: un `Field` no puede
 * inyectarle props a su hijo sin `cloneElement` (que rompe cuando el hijo es un
 * `Select` propio o un `Switch`) o sin contexto (que obliga a los dos a ser
 * client). El hook es la salida: el `Field` y el control se arman con el mismo
 * objeto.
 */
export function useFieldA11y({ id, hint, error }: UseFieldA11yOptions = {}): FieldA11y {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hasError = isPresent(error);
  const hasHint = !hasError && isPresent(hint);
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  return {
    id: controlId,
    labelId: `${controlId}-label`,
    hintId,
    errorId,
    describedBy: resolveDescribedBy(errorId, hintId, hasHint, hasError),
    invalid: hasError,
  };
}

export interface FieldProps extends Partial<FieldA11y> {
  /**
   * `undefined` = campo sin label visible. Para un campo cuyo nombre ya está
   * en otro lado (el botón de un sheet, el header de una pantalla) se pasa
   * `<span className="sr-only">Nombre</span>`: el `htmlFor` sigue siendo real.
   */
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Solo para ubicación. */
  className?: string;
  children?: ReactNode;
}

/**
 * El contenedor obligatorio de todo campo de formulario (§8.3). Sustituye al
 * `FormField` que había en `components/auth/form-controls.tsx` y a los ~29
 * `<label>` + input reimplementados a mano.
 *
 * ## Cómo se conecta con el control
 *
 * El hijo es el control real, no un prop `input`. Hay **dos** conexiones:
 *
 * 1. El `id`. Para que el `<label htmlFor>` apunte a algo tiene que ser el mismo
 *    `id` que el del control.
 * 2. El nombre y la descripción. El `Field` los **inyecta** en el hijo por
 *    `cloneElement` (ver el bloque de `cloneElement` en el cuerpo), así que no
 *    hay que pasarlos a mano.
 *
 * La segunda es nueva. Antes las dos eran trabajo del call site, y por eso
 * `organize-sheet.tsx` termina pasando un `aria-labelledby` escrito a mano.
 *
 * El helper `useFieldA11y` hace que la primera sea una línea en vez de cuatro:
 *
 * ```tsx
 * 'use client';
 * import { useState } from 'react';
 * import { Field, Input, useFieldA11y } from '@/components/ui';
 *
 * function EmailForm() {
 *   const [email, setEmail] = useState('');
 *   const [error, setError] = useState<string | null>(null);
 *
 *   // Un solo objeto: el `Field` lo usa para el label/hint/error y el `Input`
 *   // para el `id`.
 *   const field = useFieldA11y({ id: 'email', error });
 *
 *   return (
 *     <form className="flex flex-col gap-4">
 *       <Field {...field} label="Email" required error={error}>
 *         <Input
 *           id={field.id}
 *           type="email"
 *           inputMode="email"
 *           autoComplete="email"
 *           placeholder="ash@pokemon.com"
 *           value={email}
 *           onChange={(event) => setEmail(event.target.value)}
 *           invalid={field.invalid}
 *         />
 *       </Field>
 *       <Button type="submit">Entrar</Button>
 *     </form>
 *   );
 * }
 * ```
 *
 * Pasar `aria-describedby={field.describedBy}` a mano **no** rompe nada y sigue
 * siendo necesario si el control no es hijo directo del `Field` (por ejemplo
 * cuando hay un wrapper en el medio). Para el caso normal ya no hace falta.
 *
 * ## Por qué el `aria-invalid` lo pone el consumidor
 *
 * Un `Input` no puede saber que está dentro de un `Field` con error: no hay
 * relación entre el árbol de React de uno y del otro (el hijo puede ser un
 * `Select` propio que también necesita el estado, o un `Switch` que ya lo
 * deriva de `checked`). Inyectarlo con contexto obligaría a que **todos** los
 * controles fueran client components, y `Field` + `Input` son server-safe hoy
 * justamente porque no lo son. El costo de que lo declare el consumidor es una
 * prop; el costo de que lo declare el componente es que el design system entero
 * no se puede renderizar en un Server Component.
 *
 * El `aria-invalid` tampoco se inyecta por `cloneElement` aunque el hijo acepte
 * props: `aria-invalid` es el estado de un campo, no su nombre, y el `Field` no
 * puede afirmar que un `Select` apagado e inválido es un error. Se deja.
 *
 * El `Input` y el `Textarea` pintan el estado **desde** `aria-invalid`
 * (`aria-[invalid=true]:*`), no desde el prop `invalid`, así que el estilo y lo
 * que se anuncia nunca pueden desincronizarse.
 *
 * ## Hint y error no se muestran juntos
 *
 * Cuando hay error, el hint desaparece. El hint describe el camino feliz
 * ("Máximo 999") y el error describe qué está mal ahora: mostrarlos los dos
 * duplica el bloque de ayuda, suma dos filas de layout a un campo que ya está
 * vibrando, y hace que el lector anuncie la instrucción y el error pegados,
 * donde lo importante es lo segundo. Es el criterio que ya usaba
 * `form-controls.tsx`, ahora con una regla explícita.
 */
export function Field({
  id,
  hintId,
  errorId,
  labelId,
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hasError = isPresent(error);
  // El hint solo existe si no hay error: ver la nota del bloque de arriba.
  const hasHint = !hasError && isPresent(hint);
  const resolvedHintId = hintId ?? `${controlId}-hint`;
  const resolvedErrorId = errorId ?? `${controlId}-error`;
  const resolvedLabelId = labelId ?? `${controlId}-label`;
  const describedBy = resolveDescribedBy(resolvedErrorId, resolvedHintId, hasHint, hasError);
  const hasLabel = label !== undefined && label !== null;

  /*
   * Por qué se inyecta y no se deja como obligación del consumidor:
   * `<label htmlFor>` **no nombra un `<button>`**. La spec de HTML solo etiqueta
   * `<input>`, `<select>`, `<textarea>`, `<button>`, `<meter>`, `<output>`,
   * `<progress>`, `<fieldset>`, `<legend>`, `<optgroup>` y `<option>`, pero el
   * `Select` propio renderiza un `<button role="combobox">`: el `htmlFor` apunta
   * a un id válido, el navegador no da error, y el lector de pantalla anuncia
   * "combobox, 2 de 5" a secas. Lo mismo con el `aria-describedby`: el hint y el
   * error existen en el DOM pero nada los referencia.
   *
   * O sea: el bug no es del `Select`, es de toda la clase de controles que no
   * son labellables, y por eso se arregla acá y no allá. Si en algún momento se
   * "simplifica" esto afuera, el síntoma es que los `Select` dentro de un
   * `Field` vuelven a no tener nombre, y no hay ningún error en ningún lado.
   *
   * Dos guardas, y las dos importan:
   *
   * 1. **No se pisa lo que el consumidor ya puso.** `organize-sheet.tsx` pasa su
   *    propio `aria-labelledby` (por el `id` compuesto de la fila). El `??` lo
   *    deja ganar: una prop explícita es una decisión del call site, y el
   *    `Field` no puede saber si el label que el consumidor quiere nombrar es el
   *    suyo o este.
   * 2. **Solo se inyecta `aria-labelledby` si hay label renderizado.** Apuntar
   *    a un id que no existe en el DOM es peor que no apuntar: el lector queda
   *    con una referencia colgando en vez de con un nombre.
   *
   * La precedencia del `describedBy` (error le gana a hint) es la de
   * `resolveDescribedBy`, la misma función que usa `useFieldA11y`. Las dos
   * caminos tienen que decir lo mismo o uno de los dos miente.
   */
  const child = isInjectableChild(children)
    ? cloneElement(children, {
        ...(hasLabel ? { 'aria-labelledby': children.props['aria-labelledby'] ?? resolvedLabelId } : {}),
        ...(describedBy ? { 'aria-describedby': children.props['aria-describedby'] ?? describedBy } : {}),
      })
    : children;

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {hasLabel ? (
        <label
          id={resolvedLabelId}
          htmlFor={controlId}
          className="mb-1.5 text-label text-secondary"
        >
          {label}
          {required ? (
            <>
              <span aria-hidden="true" className="text-negative">
                {' '}
                *
              </span>
              <span className="sr-only"> (obligatorio)</span>
            </>
          ) : null}
        </label>
      ) : null}

      {child}

      {hasError ? (
        <div
          id={resolvedErrorId}
          role="alert"
          className="mt-1 flex items-start gap-1.5 text-caption text-negative"
        >
          <CircleAlert
            aria-hidden="true"
            focusable="false"
            strokeWidth={1.75}
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          <span className="min-w-0">{error}</span>
        </div>
      ) : hasHint ? (
        <p id={resolvedHintId} className="mt-1 text-caption text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
