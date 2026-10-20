import { hydrateCachedPrice, type CardPriceView } from './sync-prices.service.js';

describe('price cache metadata', () => {
  const evaluatedAt = '2026-10-08T10:00:00.000Z';
  const cached = {
    cardId: 'sv1-1', variant: 'normal', low: null, mid: null, high: null, market: 0, provider: 'tcgdex', source: 'tcgplayer', currency: 'USD',
    fetchedAt: '2026-10-08T09:00:00.000Z', isStale: false, evaluatedAt, freshness: 'fresh', upstreamUpdatedAt: null, upstreamFreshness: 'unknown',
  } satisfies Omit<CardPriceView, 'fetchedAt'> & { fetchedAt: string };

  it('rehidrata JSON sin cambiar la evaluación cacheada', () => {
    const serialized = JSON.parse(JSON.stringify(cached)) as unknown as CardPriceView;
    const hydrated = hydrateCachedPrice(serialized, 'tcgdex', new Date('2026-10-08T10:30:00.000Z'));
    expect(hydrated.fetchedAt).toEqual(new Date('2026-10-08T09:00:00.000Z'));
    expect(hydrated.evaluatedAt).toBe(evaluatedAt);
    expect(hydrated.freshness).toBe('fresh');
  });

  it('trata metadata ausente en una entrada legacy como unknown', () => {
    const { evaluatedAt: _evaluatedAt, freshness: _freshness, upstreamUpdatedAt: _updatedAt, upstreamFreshness: _upstream, ...legacy } = cached;
    const hydrated = hydrateCachedPrice(legacy as unknown as CardPriceView, 'tcgdex', new Date('2026-10-08T10:30:00.000Z'));
    expect(hydrated).toMatchObject({ freshness: 'unknown', upstreamUpdatedAt: null, upstreamFreshness: 'unknown' });
  });
  it('trata evaluación futura, parcial o normalizada como desconocida', () => {
    const now = new Date('2026-10-08T10:30:00.000Z');
    for (const evaluatedAt of ['2026-10-09T10:00:00.000Z', '2026-10-08', '2026-02-30T00:00:00.000Z']) {
      expect(hydrateCachedPrice({ ...cached, evaluatedAt } as unknown as CardPriceView, 'tcgdex', now)).toMatchObject({
        freshness: 'unknown', evaluatedAt: now.toISOString(), upstreamFreshness: 'unknown', upstreamUpdatedAt: null,
      });
    }
    expect(hydrateCachedPrice({ ...cached, fetchedAt: '2026-10-08T10:01:00.000Z' } as unknown as CardPriceView, 'tcgdex', now).freshness).toBe('unknown');
    expect(hydrateCachedPrice(cached as unknown as CardPriceView, 'tcgdex', new Date('2026-10-10T12:00:00.000Z'))).toMatchObject({
      evaluatedAt, freshness: 'fresh', isStale: true,
    });
  });

});
