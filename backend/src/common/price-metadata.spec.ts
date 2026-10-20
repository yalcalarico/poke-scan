import { aggregateFreshness, validDate, freshnessAt, priceMetadata, snapshotValuation, valuation, valuationFromCounts } from './price-metadata.js';

describe('price metadata', () => {
  const now = new Date('2026-10-08T12:00:00.000Z');

  it('separa vacíos, ceros válidos y subtotales desconocidos por copias', () => {
    expect(valuation({ totalCopies: 0, pricedCopies: 0, amount: 0, freshness: [], evaluatedAt: now }).amount).toBe(0);
    expect(valuation({ totalCopies: 3, pricedCopies: 0, amount: 0, freshness: [], evaluatedAt: now })).toMatchObject({ amount: null, coverage: { pricedCopies: 0, unpricedCopies: 3, coverageRatio: 0 } });
    expect(valuation({ totalCopies: 4, pricedCopies: 3, amount: 24, freshness: [{ state: 'fresh', upstream: 'unknown', copies: 2, fetchedAt: now }, { state: 'stale', upstream: 'unknown', copies: 1, fetchedAt: '2026-10-07T00:00:00Z' }], evaluatedAt: now })).toMatchObject({ amount: 24, coverage: { totalCopies: 4, pricedCopies: 3, unpricedCopies: 1, coverageRatio: 0.75 }, recency: { freshness: 'mixed', freshCopies: 2, staleCopies: 1, unknownFreshnessCopies: 0, upstreamFreshness: 'unknown' } });
  });

  it('clasifica el límite de 24 h y fechas futuras como unknown', () => {
    expect(freshnessAt(new Date(now.getTime() - 86_399_999), now)).toBe('fresh');
    expect(freshnessAt(new Date(now.getTime() - 86_400_000), now)).toBe('stale');
    expect(freshnessAt(new Date(now.getTime() + 1), now)).toBe('unknown');
    expect(priceMetadata(now, 'tcgdex', 'tcgdex', now)).toMatchObject({ freshness: 'fresh', upstreamUpdatedAt: null, upstreamFreshness: 'unknown' });
    expect(valuationFromCounts({ totalCopies: 2, pricedCopies: 2, amount: 2, evaluatedAt: now, freshCopies: 1, staleCopies: 0, unknownFreshnessCopies: 1,
      oldestFetchedAt: new Date('2026-10-08T10:00:00.000Z'), newestFetchedAt: now }).recency).toMatchObject({ freshness: 'mixed', freshCopies: 1, unknownFreshnessCopies: 1, oldestFetchedAt: '2026-10-08T10:00:00.000Z' });
  });

  it('deriva cobertura histórica de contadores guardados y deja recencia sin datos', () => {
    expect(snapshotValuation(3, 0, 12)).toEqual({ amount: 12, currency: 'USD', evaluatedAt: null, coverage: { totalCopies: 3, pricedCopies: 3, unpricedCopies: 0, coverageRatio: 1 }, recency: null });
  });
  it('rechaza fechas no ISO UTC reales y no normaliza días inexistentes', () => {
    for (const date of ['2026-10-08', '2026-02-30T00:00:00.000Z', '10/08/2026', '2026-10-08T10:00:00+00:00', 'inválida']) {
      expect(validDate(date, now)).toBeNull();
      expect(freshnessAt(date, now)).toBe('unknown');
    }
    expect(freshnessAt('2026-10-08T10:00:00Z', now)).toBe('fresh');
    expect(priceMetadata(now, null, 'tcgdex', now).freshness).toBe('stale');
    expect(priceMetadata(new Date(now.getTime() + 1), 'legacy', 'tcgdex', now).freshness).toBe('unknown');
  });

  it('incluye unknown en mezclas y excluye fechas de entradas que no contribuyen', () => {
    for (const states of [['fresh', 'unknown'], ['stale', 'unknown'], ['fresh', 'stale', 'unknown']] as const) expect(aggregateFreshness(states)).toBe('mixed');
    expect(aggregateFreshness([])).toBe('unknown');
    const result = valuation({ totalCopies: 1, pricedCopies: 1, amount: 0, evaluatedAt: now, freshness: [
      { state: 'fresh', upstream: 'unknown', copies: 1, fetchedAt: now },
      { state: 'stale', upstream: 'unknown', copies: 0, fetchedAt: '2024-01-01T00:00:00.000Z' },
    ] });
    expect(result).toMatchObject({ amount: 0, recency: { oldestFetchedAt: now.toISOString(), newestFetchedAt: now.toISOString() } });
  });

});
