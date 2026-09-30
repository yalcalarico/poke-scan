// Rutas relativas y no el alias `@/`: `vitest.config.ts` no lo tiene configurado
// (la misma nota que está arriba de `cn.test.ts`).
import { describe, expect, it } from 'vitest';

import { priceWindowDelta } from '../../components/prices/card-price-section';
import { toCardLocation, toPriceHistory } from '../api/schema';
import type { PriceDto, PriceHistoryDto, PriceHistoryPointDto } from '../../types/api';

/** Un `PriceDto` mínimo. Solo se mira el delta, así que el resto va con defaults. */
function price(overrides: Partial<PriceDto>): PriceDto {
  return {
    cardId: 'base1-4',
    variant: 'holofoil',
    low: null,
    mid: null,
    high: null,
    market: 29.9,
    provider: 'tcgdex',
    isStale: false,
    currency: 'USD',
    source: 'tcgplayer',
    fetchedAt: '2026-09-28T10:00:00.000Z',
    ...overrides,
  };
}

/** Un `PriceHistoryDto` con `change: null`, que es el caso común de la app. */
function history(overrides: Partial<PriceHistoryDto> = {}): PriceHistoryDto {
  return {
    cardId: 'base1-4',
    provider: 'tcgdex',
    source: 'tcgplayer',
    variant: null,
    currency: 'USD',
    windowDays: 30,
    from: '2026-09-27',
    to: '2026-09-29',
    points: [
      { date: '2026-09-27', fetchedAt: '2026-09-27T10:00:00.000Z', market: 29.9, low: null, mid: null, high: null },
      { date: '2026-09-28', fetchedAt: '2026-09-28T10:00:00.000Z', market: 30.1, low: null, mid: null, high: null },
      { date: '2026-09-29', fetchedAt: '2026-09-29T10:00:00.000Z', market: 31.5, low: null, mid: null, high: null },
    ],
    change: { changeUsd: 1.6, changePercent: 5 },
    ...overrides,
  };
}

describe('toPriceHistory', () => {
  it('exige cardId: sin él no se puede ni dibujar ni volver a pedir la serie', () => {
    expect(toPriceHistory({ points: [] })).toBeNull();
    expect(toPriceHistory({ cardId: '  ', points: [] })).toBeNull();
    expect(toPriceHistory('nope')).toBeNull();
  });

  /**
   * El caso que va a aparecer más: `change: null` porque hay un solo punto con
   * precio. El guard tiene que **preservarlo**, no convertirlo en `{0, 0}`: un
   * 0 % afirmaría que el precio no se movió, que es un dato falso.
   */
  it('preserva change: null en vez de inventar un 0', () => {
    const parsed = toPriceHistory(
      history({
        points: [
          { date: '2026-09-29', fetchedAt: '2026-09-29T10:00:00.000Z', market: 29.9, low: null, mid: null, high: null },
        ],
        change: null,
      }),
    );

    expect(parsed?.change).toBeNull();
  });

  it('acepta dos extremos iguales como {0, 0}: "no se movió" es un dato', () => {
    const parsed = toPriceHistory(history({ change: { changeUsd: 0, changePercent: 0 } }));

    expect(parsed?.change).toEqual({ changeUsd: 0, changePercent: 0 });
  });

  it('descarta un delta con uno solo de los dos números', () => {
    // Un `changePercent` sin `changeUsd` haría que el `PriceDelta` usara el
    // porcentaje como signo de referencia, que es un camino que no existe.
    const parsed = toPriceHistory(
      history({ change: { changePercent: -12 } as unknown as PriceHistoryDto['change'] }),
    );

    expect(parsed?.change).toBeNull();
  });

  /**
   * A diferencia del envelope, un punto sin `date` sí se puede descartar
   * individual: son filas de una serie, y perder una no deja la serie sin
   * sentido.
   */
  it('descarta puntos sin date pero conserva el resto', () => {
    const parsed = toPriceHistory(
      history({
        points: [
          // Sin `date`: es justo lo que el guard tiene que descartar, y el tipo
          // del contrato lo exige, así que el fixture necesita el `as`.
          {
            fetchedAt: '2026-09-27T10:00:00.000Z',
            market: 10,
            low: null,
            mid: null,
            high: null,
          } as PriceHistoryPointDto,
          { date: '2026-09-28', fetchedAt: '2026-09-28T10:00:00.000Z', market: 20, low: null, mid: null, high: null },
        ],
      }),
    );

    expect(parsed?.points).toHaveLength(1);
    expect(parsed?.points[0]?.date).toBe('2026-09-28');
  });

  it('deja market en null cuando el día no lo tiene, sin inventarlo en 0', () => {
    const parsed = toPriceHistory(
      history({
        points: [
          { date: '2026-09-28', fetchedAt: '2026-09-28T10:00:00.000Z', market: null, low: null, mid: null, high: null },
        ],
      }),
    );

    expect(parsed?.points[0]?.market).toBeNull();
  });
});

describe('toCardLocation', () => {
  it('devuelve null para el null del envelope: "no la tenés" no es un error', () => {
    expect(toCardLocation(null)).toBeNull();
  });

  it('exige itemId: sin él no hay PATCH ni ItemSheet', () => {
    expect(
      toCardLocation({
        collectionId: 'c1',
        collectionName: 'Principal',
        quantity: 2,
        variant: 'holofoil',
        condition: 'NM',
      }),
    ).toBeNull();
  });

  it('completa collectionName con "—" en vez de perder el ítem', () => {
    const parsed = toCardLocation({
      collectionId: 'c1',
      itemId: 'i1',
      quantity: 3,
      variant: 'holofoil',
      condition: 'LP',
    });

    expect(parsed?.collectionName).toBe('—');
    expect(parsed?.quantity).toBe(3);
  });

  it('rechaza una variante que lib/variants.ts no conoce', () => {
    // Sin variante no se puede ubicar la fila, así que se descarta entera en vez
    // de dibujarla con `variant: 'normal'` inventado.
    expect(
      toCardLocation({
        collectionId: 'c1',
        itemId: 'i1',
        quantity: 1,
        variant: 'shiny',
        condition: 'NM',
      }),
    ).toBeNull();
  });
});

describe('priceWindowDelta', () => {
  it('devuelve null cuando ninguna fila trae delta', () => {
    expect(priceWindowDelta([price({})])).toBeNull();
  });

  it('lee los tres campos planos', () => {
    const delta = priceWindowDelta([
      price({ changeUsd: -2839.31, changePercent: -73, windowLabel: 'últimos 30 días' }),
    ]);

    expect(delta).toEqual({
      changeUsd: -2839.31,
      changePercent: -73,
      windowLabel: 'últimos 30 días',
    });
  });

  /**
   * Los planos vienen juntos o en `null`. Con los dos en `null` el `PriceDelta`
   * tiene que caer a la fecha de actualización, así que `changeUsd` y
   * `changePercent` no pueden volverse 0.
   */
  it('preserva el null explícito de los tres planos', () => {
    const delta = priceWindowDelta([
      price({ changeUsd: null, changePercent: null, windowLabel: null }),
    ]);

    expect(delta).toEqual({ changeUsd: null, changePercent: null, windowLabel: undefined });
  });

  it('cae a la forma anidada cuando los planos no vienen', () => {
    const delta = priceWindowDelta([
      price({ change: { usd: 12, percent: 8, windowDays: 30, from: '2026-08-29T00:00:00.000Z' } }),
    ]);

    expect(delta).toEqual({ changeUsd: 12, changePercent: 8, windowLabel: 'últimos 30 días' });
  });

  it('elige la misma variante que heroPriceUsd, no la primera de la lista', () => {
    // `sortPricesByVariant` ordena por la tabla de `lib/variants.ts`: `normal`
    // antes que `holofoil`. Las dos filas traen delta distinto y solo puede
    // quedar uno.
    const delta = priceWindowDelta([
      price({ variant: 'holofoil', changeUsd: 100, changePercent: 10, windowLabel: 'w' }),
      price({ variant: 'normal', changeUsd: 5, changePercent: 1, windowLabel: 'w' }),
    ]);

    expect(delta?.changeUsd).toBe(5);
  });
});
