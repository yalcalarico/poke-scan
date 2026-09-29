'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, ErrorState, Sheet } from '@/components/ui';
import { getCardPrices } from '@/lib/api/cards';
import { pluralize } from '@/lib/format';
import type { PriceDto } from '@/types/api';

import {
  freshestFetchedAt,
  isPriceStale,
  priceAgeMs,
  PRICE_FRESHNESS_SLACK_MS,
  PRICE_MAX_AGE_MS,
} from './price-delta';
import { PriceHero } from './price-hero';
import { countPricelessVariants, PriceTable, sortPricesByVariant } from './price-table';

type SectionStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface CardPriceSectionProps {
  cardId: string;
  /**
   * Precios resueltos en el servidor. Pintan la pantalla en el primer render,
   * pero **no son definitivos**: el backend tiene su propia regla de frescura
   * (24 h) y el cliente vuelve a preguntar solo cuando hace falta.
   */
  initialPrices?: readonly PriceDto[];
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'No pudimos consultar los precios en este momento.';
}

/**
 * El precio de referencia de la carta.
 *
 * Es el `market` de la primera variante con precio, y el `mid` como respaldo.
 * `market` es el número que la fuente calcula sobre las ventas reales y el que
 * la app usa en todos lados (el chip del escáner, el total de una colección);
 * `mid` es el punto medio de los listados, que es lo mejor que hay cuando la
 * fuente todavía no tiene historial de ventas de esa variante.
 *
 * Ojo con el rate limit: esto **no** dispara ningún request. Solo elige una fila
 * de las que el backend ya devolvió.
 */
export function heroPriceUsd(prices: readonly PriceDto[]): number | null {
  const rows = sortPricesByVariant(prices);
  for (const price of rows) {
    if (price.market !== null && Number.isFinite(price.market)) return price.market;
  }
  for (const price of rows) {
    if (price.mid !== null && Number.isFinite(price.mid)) return price.mid;
  }
  return null;
}

/** El delta que se le pasa al `PriceDelta`, o `null` si no hay ninguno. */
export interface PriceWindowDelta {
  changeUsd: number | null;
  changePercent: number | null;
  /** `undefined` = "sin ventana": el `PriceDelta` muestra solo la fecha. */
  windowLabel?: string;
}

/**
 * El delta de la ventana, leído de los precios que ya están en memoria.
 *
 * ## De dónde sale
 *
 * De la **primera variante que lo trae**, en el orden de `sortPricesByVariant`, que
 * es el mismo orden que usa `heroPriceUsd`. Esa coincidencia importa: si la
 * píldora hablara de la variación de una variante y la cifra grande de otra, la
 * pantalla mostraría dos precios distintos para la misma carta.
 *
 * ## Las dos formas, y por qué se leen las dos
 *
 * El backend manda el delta en dos formas: los tres campos planos
 * (`changeUsd` / `changePercent` / `windowLabel`) y el objeto anidado `change`.
 * Son **la misma cuenta**, y leer las dos es lo que evita que el delta desaparezca
 * si una de las dos deja de venir. Los planos ganan cuando están.
 *
 * ## El `null` no se convierte en `0`
 *
 * Los tres vienen juntos o en `null`, y `null` significa "se calculó y no hay con
 * qué comparar" (un solo punto con precio, o el primero en cero). Se propaga tal
 * cual y el `PriceDelta` lo traduce a la fecha de actualización, que es lo único
 * que sabe decir con verdad. Convertirlo a `0` afirmaría que el precio no se movió,
 * que es un dato.
 */
export function priceWindowDelta(prices: readonly PriceDto[]): PriceWindowDelta | null {
  for (const price of sortPricesByVariant(prices)) {
    const flatUsd = price.changeUsd;
    const flatPercent = price.changePercent;

    const hasFlat =
      typeof flatUsd === 'number' || typeof flatPercent === 'number' || flatUsd === null;
    if (hasFlat) {
      return {
        changeUsd: flatUsd ?? null,
        changePercent: flatPercent ?? null,
        windowLabel: price.windowLabel ?? undefined,
      };
    }

    const nested = price.change;
    if (nested) {
      return {
        changeUsd: nested.usd,
        changePercent: nested.percent,
        windowLabel: `últimos ${nested.windowDays} días`,
      };
    }
  }
  return null;
}

/**
 * Los precios de la carta en la ficha: el `PriceHero` siempre y el detalle en un
 * `Sheet`. No queda el state `revalidating` que tenía el `CardPriceSection`
 * anterior y que nunca se ponía en `true` (`gotchas.md` #11).
 *
 * ## Por qué el precio se vuelve a pedir en el cliente
 *
 * El servidor trae los precios con `no-store` y un timeout de 1,5 s, así que la
 * pantalla nunca espera a la fuente. Si ese request se_timeouta o la carta no
 * tiene precio, el HTML llega igual y es **esta** parte la que reintenta, en el
 * cliente y con su propio estado de carga. Ese reintento no se dispara cuando
 * el precio que trajo el servidor es fresco: cada llamada a `/cards/:id/prices`
 * que no esté en la caché de 24 h del backend puede pegarle a pokemontcg.io, y
 * su límite es de 1.000 requests por día (`AGENTS.md` §3.1).
 */
export function CardPriceSection({ cardId, initialPrices = [] }: CardPriceSectionProps) {
  const [prices, setPrices] = useState<PriceDto[]>(() => [...initialPrices]);
  const [status, setStatus] = useState<SectionStatus>(() =>
    initialPrices.length > 0 ? 'ready' : 'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const updatedAt = useMemo(() => freshestFetchedAt(prices), [prices]);

  /**
   * ¿Hay que volver a pedirlo? Solo si no vino ninguno o si el más nuevo tiene
   * más de 24 h menos el margen de reloj. Es un booleano y no un `ageMs` en las
   * dependencias a propósito: un number que cambia con el paso del tiempo
   * re-despacharía el efecto en cada render.
   */
  const needsRefresh = useMemo(() => {
    const age = priceAgeMs(updatedAt);
    return age === null || age > PRICE_MAX_AGE_MS - PRICE_FRESHNESS_SLACK_MS;
  }, [updatedAt]);

  useEffect(() => {
    if (!needsRefresh) return;

    // `getCardPrices` no acepta `AbortSignal` (no hay signal en la capa de API),
    // así que la cancelación es lógica: el flag descarta la respuesta de una
    // corrida vieja cuando el componente se desmonta o el `cardId` cambia.
    let disposed = false;

    // El arranque va en una microtask: llamar al setter sincrónico desde el
    // cuerpo del efecto dispara un render en cascada, y con el doble montaje de
    // StrictMode se convierte en dos requests contra la fuente (gotchas #9).
    queueMicrotask(() => {
      if (disposed) return;
      getCardPrices(cardId)
        .then((data) => {
          if (disposed) return;
          const next = data?.prices ?? [];
          setPrices(next);
          setStatus(next.length > 0 ? 'ready' : 'empty');
          setError(null);
        })
        .catch((caught: unknown) => {
          // El timeout del servidor es un estado esperado, no un error: si ya
          // vino un precio del servidor, el hero lo muestra y no hay nada que
          // avisar. Solo se avisa cuando no hay nada en pantalla.
          if (disposed || isAbort(caught)) return;
          setError(messageOf(caught));
          setStatus((current) => (current === 'ready' ? 'ready' : 'error'));
        });
    });

    return () => {
      disposed = true;
    };
  }, [cardId, needsRefresh, reloadToken]);

  const retry = useCallback(() => {
    setError(null);
    setStatus('loading');
    setReloadToken((token) => token + 1);
  }, []);

  const isLoading = status === 'loading';
  const usd = heroPriceUsd(prices);
  const stale = isPriceStale(updatedAt);
  const pricelessVariants = countPricelessVariants(prices);
  const hasPrices = prices.length > 0;

  /*
   * El delta que se le pasa al `PriceHero`.
   *
   * Se lee de los **tres campos planos** (`changeUsd` / `changePercent` /
   * `windowLabel`) y se cae a `change` anidado como respaldo. Los dos son la
   * misma cuenta del backend con dos formas distintas: los planos son de primer
   * nivel y es lo que manda hoy, y el anidado es lo que ya leía esta pantalla
   * antes de que existieran. Leer los dos y no uno es lo que evita que el delta
   * desaparezca si uno de los dos deja de venir.
   *
   * Los tres vienen **juntos o `null`**, y `null` no se traduce a `0`: el
   * `PriceDelta` ya sabe distinguir "no hay variación calculable" de "no se
   * movió", que son dos cosas opuestas, y es la regla del proyecto no inventar
   * un dato (`price-delta.tsx`).
   *
   * El `windowLabel` solo se pasa si hay delta: sin él el `PriceHero` usaría el
   * default "últimos 30 días" al lado de una fecha de actualización, que son dos
   * afirmaciones sobre ventanas distintas en la misma línea.
   */
  const delta = priceWindowDelta(prices);

  /*
   * `empty` no necesita un bloque propio: lo muestra el `PriceHero` con el guion
   * (`—`, `aria-label="Sin precio"`) y su `Alert` de `warning`, porque "esta carta
   * no tiene precio" y "no hay cifra" son el mismo hecho. Pintarlo también acá
   * pondría el mismo copy dos veces en la misma pantalla.
   */

  return (
    <div className="flex flex-col gap-3">
      {/*
        En error el hero **no** se dibuja: su `Alert` de "no tenemos precio" sería
        mentira (no sabemos si lo hay, sabemos que no pudimos preguntarlo) y
        dejaría dos avisos de la misma cosa en pantalla. El `ErrorState` con su
        reintento es el estado completo (§9.1).
      */}
      {status === 'error' ? (
        <ErrorState
          title="No pudimos consultar el precio"
          message={error ?? undefined}
          onRetry={retry}
          retrying={isLoading}
        />
      ) : (
        <PriceHero
          usd={usd}
          cardId={cardId}
          isLoading={isLoading}
          updatedAt={updatedAt}
          changeUsd={delta?.changeUsd}
          changePercent={delta?.changePercent}
          windowLabel={delta?.windowLabel}
          onOpenDetails={hasPrices ? () => setIsSheetOpen(true) : undefined}
        />
      )}

      {/*
        `warning` y no `error` (§2.3): un precio viejo no impide hacer nada, solo
        avisa que el número puede no ser el de hoy. La ausencia de precio también
        es `warning`, y la dice el hero.
      */}
      {status === 'ready' && stale ? (
        <Alert tone="warning" size="sm" title="Precio desactualizado">
          El precio que ves tiene más de un día. Lo actualizamos cuando alguien
          consulta la carta.
        </Alert>
      ) : null}

      {status === 'ready' && pricelessVariants > 0 ? (
        <Alert tone="warning" size="sm">
          {`${pricelessVariants} ${pluralize(pricelessVariants, 'variante', 'variantes')} todavía no ${pricelessVariants === 1 ? 'tiene' : 'tienen'} precio de mercado.`}
        </Alert>
      ) : null}

      {hasPrices ? (
        <Sheet
          open={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          title="Precios de mercado"
          subtitle={`${prices.length} ${pluralize(prices.length, 'variante', 'variantes')}`}
          size="lg"
        >
          <PriceTable prices={prices} />
        </Sheet>
      ) : null}
    </div>
  );
}
