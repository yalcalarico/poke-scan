'use client';

import { useEffect, useMemo, useState } from 'react';

import { getCardPriceHistory } from '@/lib/api/cards';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { CardVariant, PriceHistoryDto } from '@/types/api';

import { Sparkline, type SparklinePoint } from './sparkline';

/**
 * Cuántos días de historial hacen falta para poder dibujar una línea.
 *
 * ## Por qué 3 y no 2
 *
 * Con **dos** puntos hay exactamente una recta, y una recta entre dos números no
 * es una tendencia: es la definición de línea que une dos puntos. Dibujarla con
 * el mismo aspecto que una serie de 30 días y llamarla "precio" es la forma más
 * barata de mentir, y `card_prices` tiene unos días de historia, o sea que el
 * caso de dos puntos **es** un caso real de esta app.
 *
 * Con tres hay dos tramos y al menos un cambio de dirección posible. Sigue sin
 * ser una tendencia de 30 días, y por eso el texto de abajo dice cuántos días
 * hay: el número al lado de la línea es lo que la limita.
 *
 * Es el mismo criterio que usa el backend para el `change`: sin dos puntos con
 * `market` no hay delta, y acá sin tres no hay línea.
 */
const MIN_POINTS_FOR_LINE = 3;

/**
 * La serie de precios de la carta, como sparkline.
 *
 * ## Por qué vive adentro del `PriceHero` y no al lado
 *
 * La cifra es el dato de la pantalla y la serie es su contexto. Un bloque
 * independiente obligaría al ojo a saltar del número a la línea y de vuelta;
 * pegado abajo del `PriceDelta` la lectura es "cuánto vale, cómo viene, por
 * dónde viene". Es la composición de la referencia de diseño.
 *
 * ## Por qué no hay estado de carga ni de error
 *
 * Es la misma degradación que el resto de la sección de precio: si la serie no
 * llega, la pantalla sigue mostrando la cifra. Un error de la serie **no** es un
 * error de la pantalla —el usuario puede hacer todo lo que venía a hacer sin ver
 * la línea—, así que no hay `ErrorState` ni reintento. Lo único que se dibuja
 * cuando no hay nada es el texto que dice que todavía no hay historial, que es
 * el estado que de verdad existe.
 *
 * ## Por qué el color lo pone el `className` y no una prop de tono
 *
 * El `Sparkline` dibuja con `currentColor`, o sea que el trazo **es** el color
 * del texto del contenedor. El tono sale de los tokens (`text-positive`,
 * `text-negative`, `text-tertiary`) y lo decide acá con una de tres clases
 * exactas, no con una prop abierta: una prop `tone` sería una lista de tonos que
 * el caller puede usar mal, y es el mismo criterio de `Progress`/`Meter`, que
 * tampoco tienen tonos propios.
 */
export interface PriceHistoryProps {
  cardId: string;
  /** Se acota a una variante. Sin esto, la serie es la mejor disponible por día. */
  variant?: CardVariant;
  /**
   * Días pedidos. El default es 30, el mismo que el delta de `PriceDelta`.
   *
   * El copy usa el `windowDays` que **devolvió** el servidor, no este número: el
   * servidor recorta la ventana a 7..365, así que si mañana el default baja a
   * 14 el texto tiene que decir 14 sin tocar este componente.
   */
  days?: number;
  className?: string;
}

interface HistorySummary {
  points: SparklinePoint[];
  label: string;
  caption: string;
  toneClass: string;
}

export function PriceHistory({
  cardId,
  variant,
  days = 30,
  className,
}: PriceHistoryProps) {
  const [history, setHistory] = useState<PriceHistoryDto | null>(null);

  useEffect(() => {
    let disposed = false;

    /*
     * La microtask no es decorativa: llamar al setter sincrónico desde el
     * cuerpo del efecto dispara un render en cascada (`docs/gotchas.md` §9). El
     * doble request que produce el doble montaje de `StrictMode` no cuesta
     * rate limit —esta serie lee `card_prices`, no al proveedor—, pero el
     * render en cascada sí es un costo real.
     */
    queueMicrotask(() => {
      if (disposed) return;
      getCardPriceHistory(cardId, { days, variant })
        .then((data) => {
          if (disposed) return;
          setHistory(data);
        })
        .catch(() => {
          /*
           * 404 (la carta no existe) o corte de red. La serie es contexto, no
           * contenido: la cifra de arriba ya está en pantalla y no hay nada
           * que avisar. `null` es el estado que el resumen traduce en el texto
           * honesto de abajo.
           */
          if (disposed) return;
          setHistory(null);
        });
    });

    return () => {
      disposed = true;
    };
  }, [cardId, days, variant]);

  const summary = useMemo(() => buildSummary(history), [history]);

  if (summary === null) return null;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/*
        El texto va **debajo** de la línea y no al lado. En 390 px la línea
        necesita el ancho completo para que tres puntos se lean como tres
        puntos, y una línea de `caption` entra holgada abajo.
      */}
      {summary.points.length >= MIN_POINTS_FOR_LINE ? (
        <Sparkline
          points={summary.points}
          label={summary.label}
          className={summary.toneClass}
        />
      ) : null}
      {/*
        Con menos de tres puntos no hay línea, así que el `label` no lo
        consume nadie: el rango de fechas y el nombre accesible que arma
        `buildSummary` se calculaban y se perdían. Por eso el contenedor lleva
        el `aria-label` **solo** en ese caso. Cuando sí hay línea, el nombre lo
        da el `role="img"` del `Sparkline` y repetirlo acá sería que un lector
        de pantalla anuncie la misma frase dos veces.
      */}
      {summary.points.length >= MIN_POINTS_FOR_LINE ? null : (
        <span className="sr-only">{summary.label}</span>
      )}
      <p className="text-caption text-tertiary">{summary.caption}</p>
    </div>
  );
}

/**
 * El resumen de la serie: qué se dibuja, con qué tono, y qué se dice.
 *
 * Sale en **un** objeto y no en tres `useMemo` porque las tres cosas salen del
 * mismo recorrido: separarlas serían tres pasadas por los mismos puntos para
 * decidir que el primero tiene el `min` y el `max`.
 *
 * `null` es el único caso en que no se dibuja nada: el request falló. Los demás
 * casos dibujan **texto**, porque todos son estados que existen de verdad
 * ("no hay historial", "hay un día", "hay tres pero no se puede comparar") y
 * un espacio en blanco debajo de una cifra se lee como bug.
 */
function buildSummary(history: PriceHistoryDto | null): HistorySummary | null {
  if (history === null) return null;

  const points: SparklinePoint[] = [];
  for (const point of history.points) {
    if (point.market !== null && Number.isFinite(point.market)) {
      points.push({ date: point.date, value: point.market });
    }
  }

  const dayCount = points.length;
  const windowDays = history.windowDays;

  if (dayCount === 0) {
    return {
      points,
      label: `Esta carta no tiene historial de precio en los últimos ${windowDays} días.`,
      /*
       * No es un error ni un estado vacío de la pantalla: es el primer día de
       * la serie. `card_prices` se va llenando a medida que alguien consulta la
       * carta, así que "todavía no hay" es una frase que puede ser verdad hoy y
       * falsa en una hora, y por eso no promete nada.
       */
      caption: 'Todavía no hay historial de precio para comparar.',
      toneClass: 'text-tertiary',
    };
  }

  const from = points[0]!;
  const to = points[points.length - 1]!;
  const change = history.change;

  const direction =
    change === null
      ? null
      : change.changeUsd > 0
        ? 'subió'
        : change.changeUsd < 0
          ? 'bajó'
          : 'no cambió';

  if (dayCount < MIN_POINTS_FOR_LINE) {
    /*
     * Uno o dos días: **no** hay línea. El texto dice cuántos hay, porque
     * "no hay historial" sería falso (hay) y "solo 1 día" es exactamente lo que
     * se sabe. Es el estado que más va a aparecer mientras `card_prices` sea
     * joven, y por eso está escrito y no es un accidente del render.
     *
     * El `label` es el texto que oye un lector de pantalla, así que no puede
     * decir "un solo día" cuando puede haber dos: announce el número real.
     */
    return {
      points,
      label:
        dayCount === 1
          ? `Un solo día de precio registrado, el ${formatDate(
              from.date,
            )}. Todavía no hay una tendencia.`
          : `Solo ${dayCount} días de precio registrados, del ${formatDate(
              from.date,
            )} al ${formatDate(to.date)}. Todavía no hay una tendencia.`,
      caption: `Solo ${dayCount} ${
        dayCount === 1 ? 'día' : 'días'
      } de precio. Falta más historial para ver una tendencia.`,
      toneClass: 'text-tertiary',
    };
  }

  /*
   * Tres días o más: hay línea.
   *
   * El tono sale del `change` del backend y **solo** del `change`. Calcularlo
   * acá desde la pendiente podría contradecir al delta que muestra el
   * `PriceDelta` de arriba, y dos indicadores del mismo dato pintados de
   * distinto color es peor que no pintar ninguno.
   *
   * Y `change: null` con línea dibujada es un estado real y honesto: la serie
   * existe y la pendiente se ve, pero el número no se puede calcular. El texto lo
   * dice sin adornarlo —ni "0 %", ni "sin cambios", que serían los dos
   * inventos que este proyecto no hace—.
   */
  const hasChange = change !== null;
  const toneClass = !hasChange
    ? 'text-tertiary'
    : change.changeUsd > 0
      ? 'text-positive'
      : change.changeUsd < 0
        ? 'text-negative'
        : 'text-secondary';

  const dayWord = dayCount === 1 ? 'día' : 'días';
  const hasMoved = hasChange && direction !== 'no cambió';

  return {
    points,
    label: `Precio de mercado del ${formatDate(from.date)} al ${formatDate(
      to.date,
    )}: de ${from.value.toFixed(2)} a ${to.value.toFixed(
      2,
    )} dólares, ${
      !hasChange
        ? 'sin variación calculable'
        : hasMoved
          ? direction
          : 'sin cambios'
    }, en ${dayCount} ${dayWord} de los últimos ${windowDays}.`,
    caption: !hasChange
      ? `${dayCount} ${dayWord} de precio registrados. Todavía no hay con qué comparar una variación.`
      : `${dayCount} ${dayWord} de precio · ${direction} en los últimos ${windowDays} días`,
    toneClass,
  };
}
