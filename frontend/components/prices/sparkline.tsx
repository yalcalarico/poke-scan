import { cn } from '@/lib/cn';

/**
 * Alto y ancho del `viewBox`. No son píxeles de pantalla: el SVG escala con
 * `preserveAspectRatio="none"` y ocupa el 100 % del ancho de su contenedor, así
 * que un `viewBox` de 100 × 32 da una línea estable a cualquier ancho sin
 * tener que medir nada.
 *
 * Es deliberadamente bajo. En la ficha el `Sparkline` vive **debajo** de la
 * cifra del `PriceHero`, y §0.2 dice que la carta es la protagonista: un
 * gráfico de 120 px de alto convierte la pantalla en un dashboard y compite con
 * el arte. 32 unidades de viewBox son ~32 px de alto, que es lo que ocupa una
 * línea de texto con aire.
 */
const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 32;

/** Margen interior: sin él la línea toca el borde del `viewBox` y se ve cortada. */
const PADDING_Y = 3;

export interface SparklinePoint {
  /** El día, `YYYY-MM-DD`. Solo se usa para el texto equivalente. */
  date: string;
  value: number;
}

export interface SparklineProps {
  /** Un punto por día, en orden cronológico ascendente. Mínimo 2. */
  points: readonly SparklinePoint[];
  /**
   * Texto equivalente de la serie, en una frase.
   *
   * Es **obligatorio** y no opcional por una razón que no es de ARIA: el
   * sparkline es la única representación del trend, y un lector de pantalla no
   * puede leer una forma. Sin este texto, la información existe solo para el
   * ojo, y eso es exactamente lo que el corpus marca en los gráficos de
   * tendencia ("text summary" / "concise trend summary"). Lo escribe el
   * consumidor (`PriceHistory`), porque solo él sabe la ventana y el tono.
   */
  label: string;
  className?: string;
}

/**
 * Un sparkline: una línea, sin ejes, sin leyenda, sin hover.
 *
 * ## Por qué SVG inline y no una librería
 *
 * El corpus dice "menos de 1000 puntos → SVG", y acá hay como máximo 365 (el
 * tope que recorta el servidor). Una librería de gráficos son 40–90 kB de
 * bundle, un layout engine propio y una API que hay que aprender, para dibujar
 * un `polyline` de tres puntos. El proyecto es deliberadamente liviano de
 * dependencias (`AGENTS.md`: sin librería de animación, sin librería de
 * gráficos) y este es el caso donde esa decisión se gana sola.
 *
 * ## Las cuatro decisiones que el corpus pide y cómo se cumplen
 *
 * 1. **Nunca distinguir series por color solo.** Hay **una** serie, así que no
 *    hay nada que distinguir: no hay leyenda porque no hay con qué. El color del
 *    trazo es un token de estado (subió / bajó / quieto), no una identidad de
 *    serie.
 * 2. **No depender del hover.** No hay `title` por punto ni tooltip. Un tooltip
 *    es dato que existe solo para quien tiene un puntero fino, y en mobile no
 *    hay puntero fino. Todo lo que el hover diría está en `label`, que se lee
 *    siempre.
 * 3. **Equivalente textual para tecnología asistiva.** `label` va en un
 *    `<figcaption className="sr-only">` y además como `aria-label` del `role
 *    ="img"`. El `figcaption` es el que lee el modo de texto completo; el
 *    `aria-label` es el que anuncia el elemento cuando se navega por roles.
 * 4. **Respeta `prefers-reduced-motion`.** No hay animación de trazado. Ver
 *    abajo.
 *
 * ## Por qué no hay animación de trazado
 *
 * Un "path drawing" con `stroke-dasharray` es el efecto que hace que un
 * sparkline se lea como vivo. Es también el que peor le sienta a una app donde
 * la cifra de arriba **ya** cambió sola: el precio se revalida, la píldora de
 * `PriceDelta` se mueve con un `flash-once`, y una línea que se dibuja al mismo
 * tiempo suma un segundo movimiento al mismo dato. Con `--duration-slow` (400 ms)
 * además roza el umbral de §5.1, que reserva esa duración para la entrada de
 * pantalla completa.
 *
 * Si alguna vez se agrega, tiene que ir detrás del gate de `prefers-reduced-motion`
 * de `globals.css` (§5.3), que ya existe a nivel documento.
 *
 * ## Escala y forma
 *
 * La escala vertical es **relativa** a la serie (min/max del rango), no desde
 * cero: un precio que se mueve de 29,90 a 31,50 tiene que verse como un cambio
 * o no se ve. La escala temporal es **índice**, no fecha: `DISTINCT ON
 * (fetchedAt::date)` puede dejar saltarse un día, y un hueco de calendario
 * en el medio de la línea dibujaría una bajada que no ocurrió. Con el eje por
 * índice esa bajada no existe; el día exacto de cada punto está en el texto
 * equivalente, que es donde se lee.
 *
 * Una serie **plana** (todos los valores iguales) se dibuja en la mitad, no
 * pegada al borde: una línea horizontal en el tope del `viewBox` se lee como
 * "se cortó el gráfico" y no como "no se movió".
 */
export function Sparkline({ points, label, className }: SparklineProps) {
  if (points.length < 2) return null;

  let min = points[0]!.value;
  let max = min;
  for (const point of points) {
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }

  const span = max - min;
  const usableHeight = VIEW_HEIGHT - PADDING_Y * 2;
  const stepX = VIEW_WIDTH / (points.length - 1);

  const coords = points.map((point, index) => {
    const x = index * stepX;
    // El caso plano va al centro en vez de al tope: ver el JSDoc.
    const y =
      span === 0
        ? VIEW_HEIGHT / 2
        : PADDING_Y + (1 - (point.value - min) / span) * usableHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <figure className={cn('m-0 flex flex-col gap-1', className)}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className="h-8 w-full"
      >
        {/*
          `vectorEffect="non-scaling-stroke"` es lo que hace que el trazo se vea
          de 2 px y no de 0,64: sin él, `preserveAspectRatio="none"` escala el
          grosor del `stroke` con el eje de las X y la línea se ve de un pelo.
          Con `preserveAspectRatio="none"` el vector-effect es el único mecanismo
          que hay para eso (no hay `px` en el viewBox).
        */}
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
