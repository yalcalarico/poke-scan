'use client';

import { useEffect, useMemo, useState } from 'react';

import { getCardPriceHistory } from '@/lib/api/cards';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { CardVariant, PriceHistoryDto } from '@/types/api';

import { Sparkline, type SparklinePoint } from './sparkline';

/**
 * Desde cuántos puntos hay geometría que dibujar.
 *
 * Con **dos** hay un segmento, y un segmento es una línea. Con **uno** no hay
 * segmento: un `<polyline>` de un punto no dibuja nada, y `Sparkline` sale con
 * `null`. Por eso el piso de la geometría es 2 y no 1.
 */
const MIN_POINTS_FOR_LINE = 2;

/**
 * Desde cuántos días el texto puede hablar de una tendencia.
 *
 * Este número **no** decide si se dibuja: decide si el caption dice "subió en
 * los últimos 30 días" o dice cuántas consultas hay y por qué la línea es corta.
 * Son dos preguntas distintas y por eso son dos constantes.
 *
 * ## Por qué el umbral del texto es 3
 *
 * La línea ya no se esconde —`card_prices` tiene 124 filas en 5 días y casi
 * todas las cartas tienen un solo día, así que esconder la geometría escondía
 * la feature entera—, pero el **tono** del texto sí depende de cuánta evidencia
 * hay. Con dos días, "subió" es cierto y "subió en los últimos 30 días" no: no
 * hay 30 días mirando. Un punto medido y nada más se anuncia como lo que es.
 */
const MIN_DAYS_FOR_TREND = 3;

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
 * ## Por qué se dibuja siempre que haya geometría
 *
 * Antes esta lista pedía tres puntos y, como `card_prices` es append-only pero
 * tiene unos días de historia, casi todas las cartas caían en el texto de
 * descarte y la línea no se veía nunca. La feature más importante de la ficha
 * era invisible.
 *
 * La redacción del principio es "nunca inventar un dato", y eso obliga a la
 * **forma y al texto**, no a la geometría: un punto medido con su día es un
 * dato, y dibujarlo no agrega nada que no esté en la base. Lo que sí se
 * inventa es una línea que conecta dos precios y los hace ver como una
 * trayectoria, y por eso el caption dice siempre cuántos días hay.
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

  const hasFigure = summary.points.length >= MIN_POINTS_FOR_LINE;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/*
        El texto va **debajo** de la línea y no al lado. En 390 px la línea
        necesita el ancho completo para que los puntos se lean como puntos, y
        una línea de `caption` entra holgada abajo.
      */}
      {hasFigure ? (
        <Sparkline
          points={summary.points}
          label={summary.label}
          className={summary.toneClass}
        />
      ) : summary.points.length === 1 ? (
        <PriceDot label={summary.label} className={summary.toneClass} />
      ) : null}
      {/*
        La rama sin figura no es la rama "poco historial": es la rama **sin
        historial**. El `sr-only` existe porque `buildSummary` arma un `label`
        con la ventana pedida, y ese texto tiene que oírlo alguien aunque no
        haya nada que dibujar. Cuando hay figura lo anuncia el `role="img"` (o
        su `aria-label`) y repetirlo acá sería que un lector de pantalla diga
        la misma frase dos veces.
      */}
      {summary.points.length === 0 ? (
        <span className="sr-only">{summary.label}</span>
      ) : null}
      <p className="text-caption text-tertiary">{summary.caption}</p>
    </div>
  );
}

/**
 * Un punto medido, sin línea alrededor.
 *
 * Un día de precio es **un dato**, y un dato que no se dibuja es un dato que
 * no está. La serie más joven de esta app tiene un solo día, así que sin este
 * bloque la ficha no muestra nunca nada.
 *
 * ## Por qué un `<div>` y no el `Sparkline`
 *
 * `Sparkline` se corta con `points.length < 2` porque no hay segmento, y el
 * caso de un punto necesita una forma distinta —un punto, no una recta— en el
 * mismo lugar. Meterlo adentro del `Sparkline` sería cambiarle el contrato a un
 * componente que tiene su propio test de contrato; y estirar un `viewBox` de
 * 100 × 32 con `preserveAspectRatio="none"` deformaría el círculo en un óvalo
 * de 4:1 en 390 px. Un div con `bg-current` es un punto redondo de verdad y
 * toma el color por el mismo camino que la línea.
 */
function PriceDot({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('flex h-8 w-full items-center', className)}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" />
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
  const providerName =
    history.provider === null
      ? 'origen no identificado'
      : history.provider === 'tcgdex'
        ? 'TCGdex'
        : history.provider === 'scrydex'
          ? 'Scrydex'
          : history.provider;
  const provenance = `${history.source} · ${providerName}`;

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
      caption: `Todavía no hay historial de precio para comparar · ${provenance}.`,
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

  const hasChange = change !== null;

  /*
   * El tono sale del `change` del backend y **solo** del `change`. Calcularlo
   * acá desde la pendiente podría contradecir al delta que muestra el
   * `PriceDelta` de arriba, y dos indicadores del mismo dato pintados de
   * distinto color es peor que no pintar ninguno. Un día no tiene pendiente
   * propia: si el backend dice que hay variación, se le cree, y si dice que no
   * la hay, se dibuja en neutro.
   *
   * Y `change: null` con línea dibujada es un estado real y honesto: la serie
   * existe y la pendiente se ve, pero el número no se puede calcular. El texto lo
   * dice sin adornarlo —ni "0 %", ni "sin cambios", que serían los dos
   * inventos que este proyecto no hace—.
   */
  const toneClass = !hasChange
    ? 'text-tertiary'
    : change.changeUsd > 0
      ? 'text-positive'
      : change.changeUsd < 0
        ? 'text-negative'
        : 'text-secondary';

  const dayWord = dayCount === 1 ? 'día' : 'días';
  const isThin = dayCount < MIN_DAYS_FOR_TREND;

  /*
   * Un día solo no tiene rango que anunciar —"del 27 al 27"—, así que el
   * `label` dice el día y el valor. La fecha es el dato que el `caption` no
   * tiene, y un lector de pantalla tiene que oírla igual.
   */
  const label =
    dayCount === 1
      ? `Un solo día de precio registrado, el ${formatDate(
          from.date,
        )}: ${from.value.toFixed(2)} dólares. Todavía no hay una tendencia.`
      : `Precio de mercado del ${formatDate(from.date)} al ${formatDate(
          to.date,
        )}: de ${from.value.toFixed(2)} a ${to.value.toFixed(
          2,
        )} dólares, ${
          !hasChange
            ? 'sin variación calculable'
            : direction !== 'no cambió'
              ? direction
              : 'sin cambios'
        }, en ${dayCount} ${dayWord} de los últimos ${windowDays}.`;

  /*
   * El caption tiene dos trabajos y no uno: decir cuánto vale la evidencia y
   * decir qué no se puede afirmar con ella.
   *
   * Con menos de tres días la serie es **más corta que la ventana**: decir
   * "subió en los últimos 30 días" cuando hay dos consultas sería afirmar que
   * se estuvo mirando un mes. Por eso la rama delgada dice la cantidad y
   * promete el crecimiento —que es cierto, porque `card_prices` es append-only y
   * cada consulta nueva escribe una fila— en vez de disculparse por no tener más.
   */
  const caption = !hasChange
    ? `${dayCount} ${dayWord} de precio ${
        dayCount === 1 ? 'registrado' : 'registrados'
      }. Todavía no hay con qué comparar una variación · ${provenance}.`
    : isThin
      ? `${dayCount} ${dayWord} de precio · ${direction}. La línea crece con cada consulta nueva · ${provenance}.`
      : `${dayCount} ${dayWord} de precio · ${direction} en los últimos ${windowDays} días · ${provenance}`;

  return { points, label, caption, toneClass };
}
