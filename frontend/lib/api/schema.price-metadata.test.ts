import { describe, expect, it, vi } from 'vitest';
import { toCollectionDto, toPortfolioDto, toPriceHistory, toCollectionItemDto, toCollectionStatsDto, toPriceDto } from './schema';

const legacy = { cardId: 'sv1-1', variant: 'normal', low: null, mid: null, high: null, market: 0, provider: 'tcgdex', currency: 'USD', source: 'tcgplayer', fetchedAt: '2026-10-08T12:00:00.000Z' };

describe('price metadata schema compatibility', () => {
  it('preserves legacy entries without inventing metadata', () => {
    const parsed = toPriceDto(legacy);
    expect(parsed?.market).toBe(0);
    expect(parsed).not.toHaveProperty('freshness');
    expect(parsed).not.toHaveProperty('evaluatedAt');
  });

  it('accepts complete metadata and rejects a partial or invalid present block', () => {
    const metadata = { evaluatedAt: '2026-10-08T12:00:00.000Z', freshness: 'fresh', upstreamUpdatedAt: null, upstreamFreshness: 'unknown' };
    expect(toPriceDto({ ...legacy, ...metadata })?.upstreamFreshness).toBe('unknown');
    expect(toPriceDto({ ...legacy, evaluatedAt: metadata.evaluatedAt })).toBeNull();
    expect(toPriceDto({ ...legacy, ...metadata, freshness: 'recent' })).toBeNull();
  });

  it('accepts old aggregates without valuation and rejects invalid present coverage', () => {
    const legacyStats = { totalCards: 0, uniqueCards: 0, duplicateCards: 0, setsCount: 0, totalValueUsd: 0, totalValueArs: null };
    expect(toCollectionStatsDto(legacyStats)).not.toBeNull();
    const valuation = { amount: 0, currency: 'USD', evaluatedAt: '2026-10-08T12:00:00.000Z',
      coverage: { totalCopies: 2, pricedCopies: 2, unpricedCopies: 0, coverageRatio: 1 },
      recency: { freshness: 'fresh', freshCopies: 2, staleCopies: 0, unknownFreshnessCopies: 0,
        upstreamFreshness: 'unknown', oldestFetchedAt: '2026-10-08T11:00:00.000Z', newestFetchedAt: '2026-10-08T11:00:00.000Z' } };
    const populatedStats = { ...legacyStats, totalCards: 2, uniqueCards: 2 };
    expect(toCollectionStatsDto({ ...populatedStats, valuation })).not.toBeNull();
    expect(toCollectionStatsDto({ ...populatedStats, valuation: { ...valuation, amount: null } })).toBeNull();
    expect(toCollectionStatsDto({ ...populatedStats, valuation: { ...valuation, coverage: { ...valuation.coverage, pricedCopies: 1 } } })).toBeNull();
  });
});


const metadata = { evaluatedAt: '2026-10-08T12:00:00.000Z', freshness: 'fresh', upstreamUpdatedAt: null, upstreamFreshness: 'unknown' };
const current = { amount: 0, currency: 'USD', evaluatedAt: metadata.evaluatedAt,
  coverage: { totalCopies: 2, pricedCopies: 2, unpricedCopies: 0, coverageRatio: 1 },
  recency: { freshness: 'fresh', freshCopies: 2, staleCopies: 0, unknownFreshnessCopies: 0, upstreamFreshness: 'unknown',
    oldestFetchedAt: legacy.fetchedAt, newestFetchedAt: legacy.fetchedAt } };
const collection = { id: 'collection-test', userId: 'user-test', name: 'Colección', isDefault: true, itemCount: 2, uniqueCount: 1, duplicateCount: 1,
  totalValueUsd: 0, totalValueArs: null, cover: [], createdAt: metadata.evaluatedAt, valuation: current };
const snapshot = { amount: 12, currency: 'USD', evaluatedAt: null, recency: null, coverage: { totalCopies: 3, pricedCopies: 2, unpricedCopies: 1, coverageRatio: 2 / 3 } };
const portfolio = { totalCards: 2, unpricedCards: 0, valueUsd: 0, valuation: current,
  history: [{ date: '2026-10-07', valueUsd: 12, totalCards: 3, unpricedCards: 1, valuation: snapshot }],
  topCards: [{ cardId: 'sv1-1', name: 'Pikachu', imageSmall: 'small', setName: 'Base', number: '1', variant: 'normal', quantity: 2, marketUsd: 0, valueUsd: 0,
    reference: { provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', fetchedAt: legacy.fetchedAt, ...metadata } }] };

describe('BE-04 límites de parsers', () => {
  it('valida fechas ISO UTC reales y acepta consulta inválida sólo como unknown', () => {
    for (const evaluatedAt of ['2026-10-08', '2026-02-30T00:00:00.000Z', '10/08/2026']) expect(toPriceDto({ ...legacy, ...metadata, evaluatedAt })).toBeNull();
    expect(toPriceDto({ ...legacy, ...metadata, fetchedAt: 'inválida', freshness: 'unknown' })?.freshness).toBe('unknown');
    expect(toPriceDto({ ...legacy, ...metadata, fetchedAt: 'inválida' })).toBeNull();
    expect(toPriceDto({ ...legacy, ...metadata, upstreamUpdatedAt: '2026-02-30T00:00:00.000Z', upstreamFreshness: 'stale' })).toBeNull();
  });
  it('conserva ambas formas de ARS sin transformarlas entre endpoints', () => {
    const ars = { low: 1, mid: 2, high: null, market: 0 };
    expect(toPriceDto({ ...legacy, priceArs: ars })?.priceArs).toEqual(ars);
    expect(toPriceDto({ ...legacy, priceArs: 0 })?.priceArs).toBe(0);
  });
  it('conserva valuación de colección y rechaza bloques presentes incompletos', () => {
    expect(toCollectionDto(collection)?.valuation).toEqual(current);
    expect(toCollectionDto({ ...collection, valuation: { amount: 0 } })).toBeNull();
    expect(toCollectionDto({ ...collection, valuation: { ...current, recency: null, evaluatedAt: null } })).toBeNull();
    expect(toCollectionDto({ ...collection, valuation: undefined })).not.toHaveProperty('valuation');
  });
  it('preserva cobertura histórica y referencia del ranking, valida su scope y temporalidad', () => {
    const result = toPortfolioDto(portfolio);
    expect(result?.history[0]?.valuation).toEqual(snapshot);
    expect(result?.topCards[0]?.reference).toEqual(portfolio.topCards[0]?.reference);
    expect(toPortfolioDto({ ...portfolio, history: [{ ...portfolio.history[0], valuation: current }] })).toBeNull();
    expect(toPortfolioDto({ ...portfolio, topCards: [{ ...portfolio.topCards[0], reference: { freshness: 'fresh' } }] })).toBeNull();
    expect(toPortfolioDto({ ...portfolio, topCards: [{ ...portfolio.topCards[0], reference: { provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', fetchedAt: legacy.fetchedAt } }] })).toBeNull();
    expect(toPortfolioDto({ ...portfolio, valuation: { ...current, coverage: { ...current.coverage, totalCopies: 3 } } })).toBeNull();
  });
  it('conserva variant:null del historial y no pierde silenciosamente metadata inválida', () => {
    const history = { cardId: 'sv1-1', variant: null, provider: 'tcgdex', source: 'tcgplayer', currency: 'USD', points: [{ date: '2026-10-08', fetchedAt: legacy.fetchedAt, market: 0, ...metadata }] };
    expect(toPriceHistory(history)?.variant).toBeNull();
    expect(toPriceHistory(history)?.points[0]?.freshness).toBe('fresh');
    expect(toPriceHistory({ ...history, points: [{ ...history.points[0], evaluatedAt: 'inválida' }] })).toBeNull();
    expect(toCollectionItemDto({ id: 'item', collectionId: 'collection', card: { id: 'sv1-1', name: 'Pikachu', setId: 'sv1' }, variant: 'normal', condition: 'NM', quantity: 1, isForTrade: false, addedAt: legacy.fetchedAt,
      price: { ...legacy, evaluatedAt: 'inválida' } })).toBeNull();
  });
});

vi.mock('./api-client', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api-client')>()), apiFetch: vi.fn() }));
import { apiFetch } from './api-client';
import { getPortfolio, getCollection, listCollections, createCollection, updateCollection, getStats, addItem } from './collections';
import { getCardPrices, getCardPriceHistory } from './cards';

describe('BE-04 adaptadores HTTP', () => {
  it('valida bloques nuevos en todas las respuestas de colección', async () => {
    for (const read of [() => getCollection('id'), () => createCollection({ name: 'Nueva' }), () => updateCollection('id', { name: 'Renombrada' })]) {
      vi.mocked(apiFetch).mockResolvedValueOnce(collection);
      await expect(read()).resolves.toMatchObject({ valuation: current });
      vi.mocked(apiFetch).mockResolvedValueOnce({ ...collection, valuation: { amount: 0 } });
      await expect(read()).rejects.toMatchObject({ status: 502 });
    }
    vi.mocked(apiFetch).mockResolvedValueOnce([collection]);
    await expect(listCollections()).resolves.toMatchObject([{ valuation: current }]);
    vi.mocked(apiFetch).mockResolvedValueOnce({ totalCards: 2, uniqueCards: 1, duplicateCards: 1, setsCount: 1, totalValueUsd: 0, cardsMissingPrice: 0, valuation: current });
    await expect(getStats('id')).resolves.toMatchObject({ valuation: current, cardsMissingPrice: 0 });
  });
  it('valida portfolio, ficha, historia y precios presentes de altas', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(portfolio);
    await expect(getPortfolio()).resolves.toMatchObject({ valuation: current, history: [{ valuation: snapshot }] });
    vi.mocked(apiFetch).mockResolvedValueOnce({ ...portfolio, valuation: { amount: 0 } });
    await expect(getPortfolio()).rejects.toMatchObject({ status: 502 });
    vi.mocked(apiFetch).mockResolvedValueOnce({ card: {}, prices: [{ ...legacy, ...metadata, priceArs: { low: 1, mid: 2, high: null, market: 0 } }] });
    await expect(getCardPrices('id')).resolves.toMatchObject({ prices: [{ freshness: 'fresh', priceArs: { market: 0 } }] });
    vi.mocked(apiFetch).mockResolvedValueOnce({ card: {}, prices: [{ ...legacy, evaluatedAt: 'inválida' }] });
    await expect(getCardPrices('id')).rejects.toMatchObject({ status: 502 });
    vi.mocked(apiFetch).mockResolvedValueOnce({ cardId: 'sv1-1', points: [{ date: '2026-10-08', ...legacy, evaluatedAt: 'inválida' }] });
    await expect(getCardPriceHistory('id')).rejects.toMatchObject({ status: 502 });
    vi.mocked(apiFetch).mockResolvedValueOnce({ price: { ...legacy, evaluatedAt: 'inválida' } });
    await expect(addItem('id', { cardId: 'sv1-1' })).rejects.toMatchObject({ status: 502 });
  });
});
