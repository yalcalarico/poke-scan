import { cn } from '@/lib/cn';

/**
 * Columns × rows del waffle: 27 casillas.
 *
 * ## Por qué 9 × 3 y no 10 × 10
 *
 * El corpus propone 10×10 para "qué fracción de un todo está llena", pero el
 * objeto físico que el usuario tiene en la mano es una **página de binder**, y en
 * una-beta son 9 columnas por 3 filas. 27 casillas es la cantidad real de cartas
 * que entran en una página, así que "13 de 27 llena" y "la página está a la
 * mitad" son la misma frase.
 *
 * Y el 10×10 tampoco entraría: a 390 px menos el padding de la pantalla y el de
 * la `Surface`, una celda de 10 columnas mide 26 px, o sea por debajo de los
 * 44 px que §0.5 exige a todo control. 9 columnas da 33 px, que tampoco llega a
 * 44 pero se acerca, y —esto es lo importante— **el waffle no es interactivo**:
 * no hay objetivo de toque, hay un dibujo. El objetivo real es el `Progress` de
 * arriba y la barra de la acción masiva, y los dos llegan de sobra.
 *
 * Si alguna vez hace falta un waffle de 10×10, tiene que ir en su propia
 * pantalla con scroll, no metido en una `Surface` de 358 px.
 */
const COLUMNS = 9;
const ROWS = 3;
const SLOTS = COLUMNS * ROWS;

export interface BinderWaffleProps {
  /**
   * Porcentaje 0–100, o `null` cuando **no hay denominador** (`SetDto.total` y
   * `printedTotal` los dos `NULL`).
   *
   * El `null` es el estado importante: no se dibuja ninguna casilla, ni una
   * vacía, ni una gris. Cero de 27 llenadas es un dato falso —el usuario tiene
   * cartas, no tiene el total del set— y "0 %" en una pantalla donde sí tenés
   * 40 cartas es la forma más fácil de arruinar la confianza en el número. El
   * `BinderSummary` ya traduce ese caso a "No sabemos cuántas cartas tiene este
   * set" en el texto de al lado; acá solo se apaga el dibujo.
   */
  percent: number | null;
  /**
   * Solo para ubicación. La forma la decide el componente.
   *
   * Sin prop de tono, por el mismo motivo que `Progress`: el color lo pone el
   * consumidor con `text-*`, y el waffle usa `currentColor`. Una prop `tone`
   * sería una lista de tonos que el call site puede usar mal, y el binding del
   * set es un estado de progreso, no un estado de error.
   */
  className?: string;
}

/**
 * El waffle de progreso del set: qué fracción de la página de binder está llena.
 *
 * ## Por qué un waffle y no solo la barra
 *
 * La barra de `Progress` es la lectura **numérica** y ya estaba: `role
 * ="progressbar"` con `aria-valuenow`, que es lo que un lector de pantalla y un
 * lector de porcentaje necesitan. El waffle es la lectura **visual y física**:
 * "la página está casi llena" sin tener que calcular 40 % en la cabeza, que es
 * justo lo que la referencia de diseño muestra.
 *
 * ## Por qué es decorativo y no interactivo
 *
 * Es `aria-hidden` entero, y el `Progress` de arriba queda como la única fuente
 * de verdad para tecnología asistiva. Dos razones:
 *
 * 1. **La información ya está.** Si el waffle se anunciara, el lector diría "40
 *    por ciento" dos veces seguidas, con dos palabras distintas. `Progress` ya lo
 *    hace con `aria-valuenow` y `aria-valuetext`, que son los atributos correctos
 *    para un valor medible.
 * 2. **Un dibujo de 27 casillas no es navegable.** No hay un índice 1..27 que
 *    signifique "falta la carta 14" en una página que no está ordenada por
 *    número: los slots son un porcentaje, no un índice. Anunciar "casilla 14 de
 *    27" sería un dato que no existe.
 *
 * ## Por qué cumple WCAG 1.4.1 sin el texto al lado
 *
 * La regla dice que el color no puede ser el único portador de información. Acá
 * el color **no** la porta: el porcentaje ya está escrito en el `caption` de
 * abajo del `BinderSummary` ("37% · te faltan 64 cartas · 3 duplicadas"), y el
 * `Progress` de arriba lo anuncia. El waffle es una **repetición** de un dato que
 * ya está en texto dos veces. Repetir no es codificar: el mismo número está en
 * la píldora, en el texto y en el dibujo, y cualquiera de los tres alcanza.
 *
 * ## Sin animación
 *
 * No hay transición de casillas que se van llenando. Sería movimiento
 * decorativo sobre un dato estático, y §5.3 (reduced motion) tendría que
 * apagarlo igual: el ahorro es cero y el costo es una animación que se puede
 * disparar en cada render del resumen.
 */
export function BinderWaffle({ percent, className }: BinderWaffleProps) {
  if (percent === null) return null;

  const clamped = Math.min(100, Math.max(0, percent));
  /*
   * `Math.round` y no `Math.floor`: con 27 casillas, el piso siempre muestra una
   * casilla menos de las que corresponde. Con 40 % son 10,8 casillas y el piso
   * dibuja 10 (37 %) mientras el texto dice 40 %. Redondear a 11 dice 40,7 %, que
   * es el error de redondeo de una sola casilla y el que el ojo no percibe en un
   * dibujo de 27. El número exacto está en el texto de al lado.
   */
  const filled = Math.round((clamped / 100) * SLOTS);

  return (
    <div aria-hidden="true" className={cn('flex flex-col gap-1', className)}>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: SLOTS }, (_, index) => {
          const isFilled = index < filled;
          return (
            <span
              key={index}
              className={cn(
                'block w-full rounded-[2px]',
                // `aspect-[63/88]` y no un alto fijo: es la proporción real de
                // una carta y hace que la página se vea como una página.
                'aspect-[63/88]',
                isFilled ? 'bg-current' : 'bg-surface-3',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

export {
  COLUMNS as WAFFLE_COLUMNS,
  ROWS as WAFFLE_ROWS,
  SLOTS as WAFFLE_SLOTS,
};
