import { describe, expect, it } from 'vitest';
import { toCardComparison, toCollectionComparison } from './comparison';

const price = { date: '2026-10-12', market: 0, low: null, mid: null, high: null, fetchedAt: '2026-10-12T21:00:00.000Z', feedPublishedAt: '2026-10-12T20:00:00.000Z', upstreamUpdatedAt: null, freshness: 'unknown' };
const card = { cardId: 'base1-1', variant: 'normal', currency: 'USD', windowDays: 30, activeProvider: 'tcgdex', evaluatedAt: '2026-10-13T01:00:00.000Z', tcgcsv: { enabled: true, state: 'ready', groupId: 24722, nextAttemptAt: null }, series: [{ provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', current: price, points: [price] }, { provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD', current: null, points: [{ ...price, market: null }] }] };
const point = { date: '2026-10-12', valueUsd: 0, totalCopies: 2, pricedCopies: 1, unpricedCopies: 1, freshCopies: 0, staleCopies: 0, unknownFreshnessCopies: 1, oldestFetchedAt: null, newestFetchedAt: '2026-10-13T01:00:00.000Z', feedPublishedAt: null, compositionFingerprint: 'abc', compositionChanged: true, provisional: false, evaluatedAt: '2026-10-13T01:00:00.000Z', cutAt: '2026-10-12T23:59:59.999Z' };
const collection = { collectionId: 'c1', activeProvider: 'tcgdex', currency: 'USD', windowDays: 30, evaluatedAt: '2026-10-13T01:00:00.000Z', series: [{ provider: 'tcgdex', policy: 'exact-variant-market-usd-v1', current: point, points: [point] }, { provider: 'tcgcsv', policy: 'exact-variant-market-usd-v1', current: point, points: [point] }] };

describe('comparison DTO guards', () => {
  it('preserva cero, las fuentes fijas y las fechas separadas del feed', () => {
    expect(toCardComparison(card)?.series[0]?.current?.market).toBe(0);
    expect(toCardComparison(card)?.series[0]?.source).toBe('tcgplayer');
    expect(toCardComparison(card)?.series[0]?.current?.feedPublishedAt).not.toBe(toCardComparison(card)?.series[0]?.current?.fetchedAt);
  });
  it('rechaza observaciones mal formadas y cobertura inconsistente', () => {
    expect(toCardComparison({ ...card, series: card.series.map((s, i) => i === 0 ? { ...s, points: [{ ...price, market: Infinity }] } : s) })).toBeNull();
    expect(toCollectionComparison({ ...collection, series: collection.series.map((s, i) => i === 0 ? { ...s, current: { ...point, totalCopies: 4 } } : s) })).toBeNull();
  });
  it('rechaza identidades de mercado o variantes desconocidas', () => {
    expect(toCardComparison({ ...card, series: card.series.map((s, i) => i === 0 ? { ...s, source: 'other' } : s) })).toBeNull();
    expect(toCardComparison({ ...card, variant: 'shiny' })).toBeNull();
  });
  it.each([
    { date: '2026-02-30' }, { date: '2026-10-11' }, { market: -1 },
    { fetchedAt: '2026-10-12T21:00:00' }, { feedPublishedAt: '2026' },
  ])('rechaza fecha o importe incompatible sin omitir la otra fuente: %j', (delta) => {
    expect(toCardComparison({ ...card, series: card.series.map((s, i) => i === 0 ? { ...s, current: { ...price, ...delta } } : s) })).toBeNull();
  });
  it.each([
    { freshCopies: 2 }, { valueUsd: null }, { totalCopies: 0, pricedCopies: 0, unpricedCopies: 0, unknownFreshnessCopies: 0, valueUsd: 9 },
    { totalCopies: 2, pricedCopies: 0, unpricedCopies: 2, unknownFreshnessCopies: 0, valueUsd: 0 },
  ])('rechaza una valoración inconsistente con sus copias: %j', (delta) => {
    expect(toCollectionComparison({ ...collection, series: collection.series.map((s, i) => i === 0 ? { ...s, current: { ...point, ...delta } } : s) })).toBeNull();
  });
  it('acepta valoración desconocida y cero conocido sin confundirlos', () => {
    const unknown = { ...point, totalCopies: 2, pricedCopies: 0, unpricedCopies: 2, unknownFreshnessCopies: 0, valueUsd: null };
    expect(toCollectionComparison({ ...collection, series: collection.series.map(s => ({ ...s, current: unknown })) })?.series[0]?.current.valueUsd).toBeNull();
    expect(toCollectionComparison(collection)?.series[0]?.current.valueUsd).toBe(0);
  });
  it('rechaza días duplicados, proveedor ausente y políticas mezcladas', () => {
    expect(toCardComparison({ ...card, series: card.series.map((s, i) => i === 0 ? { ...s, points: [price, price] } : s) })).toBeNull();
    expect(toCardComparison({ ...card, series: [card.series[0]] })).toBeNull();
    expect(toCollectionComparison({ ...collection, series: collection.series.map((s, i) => i === 0 ? { ...s, policy: 'other' } : s) })).toBeNull();
  });
});

it('acepta una sola fuente TCGCSV y rechaza mezclarle la serie retirada', () => {
  const onlyCard = { ...card, activeProvider: 'tcgcsv', series: card.series.filter((series) => series.provider === 'tcgcsv') };
  const onlyCollection = { ...collection, activeProvider: 'tcgcsv', series: collection.series.filter((series) => series.provider === 'tcgcsv') };
  expect(toCardComparison(onlyCard)?.series).toHaveLength(1);
  expect(toCollectionComparison(onlyCollection)?.series).toHaveLength(1);
  expect(toCardComparison({ ...card, activeProvider: 'tcgcsv' })).toBeNull();
  expect(toCollectionComparison({ ...collection, activeProvider: 'tcgcsv' })).toBeNull();
});
