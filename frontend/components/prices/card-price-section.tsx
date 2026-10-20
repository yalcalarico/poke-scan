'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, ErrorState, Sheet } from '@/components/ui';
import { getCardPrices } from '@/lib/api/cards';
import { pluralize } from '@/lib/format';
import type { PriceDto } from '@/types/api';

import {
  freshestFetchedAt,
  priceAgeMs,
  PRICE_FRESHNESS_SLACK_MS,
  PRICE_MAX_AGE_MS,
} from './price-delta';
import { PriceHero } from './price-hero';
import { CardComparisonPanel } from './comparison-panel';
import { PriceReferenceDetails } from './price-evidence';
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
  showComparison?: boolean;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Revisá tu conexión y reintentá.';
}

/** Primera variante canónica con market conocido; mid nunca sustituye mercado. */
export function heroPriceUsd(prices: readonly PriceDto[]): number | null {
  const rows = sortPricesByVariant(prices);
  for (const price of rows) {
    if (price.market !== null && Number.isFinite(price.market)) return price.market;
  }
  return null;
}

function heroReference(prices: readonly PriceDto[]): PriceDto | null {
  return sortPricesByVariant(prices).find((price) => price.market !== null && Number.isFinite(price.market)) ?? null;
}

/** El delta que se le pasa al `PriceDelta`, o `null` si no hay ninguno. */
export interface PriceWindowDelta {
  changeUsd: number | null;
  changePercent: number | null;
  /** `undefined` = "sin ventana": el `PriceDelta` muestra solo la fecha. */
  windowLabel?: string;
}

/** El delta pertenece a la misma fila que aporta el hero; ausencia no equivale a cero. */
export function priceWindowDelta(prices: readonly PriceDto[]): PriceWindowDelta | null {
  const price = heroReference(prices);
  if (price) {
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
 * La ficha renderiza primero la carta y este componente carga el precio en
 * cliente. Antes el Server Component esperaba hasta 1,5 s a que terminara el
 * endpoint de precios; en una carta vencida ese request puede esperar a la
 * fuente externa y retenía también el nombre, la imagen y los datos estáticos.
 * El precio tiene su propio skeleton y no bloquea la navegación principal.
 *
 * El endpoint sigue pasando por la caché de 24 h del backend y su cola
 * throttled. No se debe agregar polling ni requests por tile: cada refresco que
 * vence la caché puede gastar presupuesto externo (`AGENTS.md` §3.1).
 */
export function CardPriceSection({ cardId, initialPrices = [], showComparison = false }: CardPriceSectionProps) {
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
    return (
      prices.some((price) => price.isStale === true) ||
      age === null ||
      age > PRICE_MAX_AGE_MS - PRICE_FRESHNESS_SLACK_MS
    );
  }, [prices, updatedAt]);

  useEffect(() => {
    if (!needsRefresh) return;

    // `getCardPrices` no acepta `AbortSignal` (la capa de precios no lo expone),
    // así que la cancelación es lógica: el flag descarta la respuesta de una
    // corrida vieja cuando el componente se desmonta o el `cardId` cambia. Con el
    // `key={card.id}` de la ficha, cambiar de carta **remonta** el componente y
    // por lo tanto la corrida vieja muere con el nodo.
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
  const reference = heroReference(prices);
  const stale = prices.some((price) => price.freshness === 'stale');
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
   * default "últimos 30 días" al lado de una fecha de consulta, que son dos
   * afirmaciones sobre ventanas distintas en la misma línea.
   */
  const delta = priceWindowDelta(reference ? [reference] : []);

  /*
   * `empty` no necesita un bloque propio: lo muestra el `PriceHero` con el guion
   * (`—`, `aria-label="Sin precio"`) y su `Alert` de `warning`, porque "esta carta
   * no tiene precio" y "no hay cifra" son el mismo hecho. Pintarlo también acá
   * pondría el mismo copy dos veces en la misma pantalla.
   */

  return (
    <>
    <div className="flex flex-col gap-3" aria-busy={isLoading}>
      {/*
        En error el hero **no** se dibuja: su `Alert` de "no tenemos precio" sería
        mentira (no sabemos si lo hay, sabemos que no pudimos preguntarlo) y
        dejaría dos avisos de la misma cosa en pantalla. El `ErrorState` con su
        reintento es el estado completo (§9.1).
      */}
      {status === 'error' ? (
        <ErrorState
          title="No pudimos cargar la referencia de precio"
          message={error ?? undefined}
          onRetry={retry}
          retrying={isLoading}
        />
      ) : (
        <PriceHero
          usd={usd}
          cardId={cardId}
          isLoading={isLoading}
          updatedAt={reference?.fetchedAt}
          changeUsd={delta?.changeUsd}
          changePercent={delta?.changePercent}
          windowLabel={delta?.windowLabel}
          onOpenDetails={hasPrices ? () => setIsSheetOpen(true) : undefined}
          variant={reference?.variant}
        />
      )}

      {reference ? <div role="status"><PriceReferenceDetails reference={reference} /></div> : status === 'ready' ? <p role="status" className="text-caption text-warning">Referencia, variante y antigüedad no disponibles.</p> : null}

      {/*
        `warning` y no `error` (§2.3): un precio viejo no impide hacer nada, solo
        avisa que el número puede no ser el de hoy. La ausencia de precio también
        es `warning`, y la dice el hero.
      */}
      {status === 'ready' && stale ? (
        <Alert tone="warning" size="sm" title="Referencia anterior">
          Hay consultas anteriores o de otra API al evaluar. Cada variante conserva su fecha, mercado y proveedor.
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
    {showComparison ? <CardComparisonPanel cardId={cardId} variants={prices.map((price) => price.variant)} preferredVariant={reference?.variant} loadingVariants={isLoading} /> : null}
    </>
  );
}
