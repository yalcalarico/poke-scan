import { PortfolioService } from './portfolio.service.js';
import type { PrismaService } from '../../prisma/index.js';
import type { PriceProvider } from '../providers/card-provider.interface.js';
import type { CollectionComparisonService } from '../../jobs/collection-comparison.service.js';

const provider: PriceProvider = {
  id: 'tcgcsv', defaultSource: 'tcgplayer', defaultCurrency: 'USD',
};

describe('PortfolioService valuation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it('agrega cobertura y recencia por copias y conserva la cobertura propia del snapshot', async () => {
    const fetched = new Date('2026-10-08T11:00:00.000Z');
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ totalCards: 4, unpricedCards: 1, valueUsd: 24, pricedCopies: 3, freshCopies: 2, staleCopies: 1,
          oldestFetchedAt: new Date('2026-10-07T11:00:00.000Z'), newestFetchedAt: fetched }])
        .mockResolvedValueOnce([{ cardId: 'sv1-1', name: 'Pikachu', imageSmall: 'small', setName: 'Base', number: '1', variant: 'normal', quantity: 2, marketUsd: 12, valueUsd: 24, fetchedAt: fetched, provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD' }]),
      portfolioSnapshot: {
        upsert: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ day: new Date('2026-10-07T00:00:00.000Z'), valueUsd: 10, totalCards: 3, unpricedCards: 0 }]),
      },
    } as unknown as PrismaService;
    const snapshots = { comparison: vi.fn().mockResolvedValue({ series: [{ provider: 'tcgcsv', points: [
      { date: '2026-10-07', valueUsd: 10, totalCopies: 3, unpricedCopies: 0 },
    ] }] }) } as unknown as CollectionComparisonService;
    const service = new PortfolioService(prisma, provider, undefined, snapshots);
    const result = await service.summary('user-test');
    expect(result.valuation).toMatchObject({ amount: 24, coverage: { totalCopies: 4, pricedCopies: 3, unpricedCopies: 1, coverageRatio: 0.75 }, recency: { freshness: 'mixed', freshCopies: 2, staleCopies: 1, unknownFreshnessCopies: 0 } });
    expect(result.topCards[0]?.reference).toMatchObject({ provider: 'tcgcsv', source: 'tcgplayer', freshness: 'fresh', upstreamUpdatedAt: null, upstreamFreshness: 'unknown' });
    expect(result.history[0]?.valuation).toEqual({ amount: 10, currency: 'USD', evaluatedAt: null,
      coverage: { totalCopies: 3, pricedCopies: 3, unpricedCopies: 0, coverageRatio: 1 }, recency: null });
    expect(result).not.toHaveProperty('freshCopies');
    expect(prisma.portfolioSnapshot.upsert).not.toHaveBeenCalled();
    expect(prisma.portfolioSnapshot.findMany).not.toHaveBeenCalled();
  });

  it('mantiene desconocido el valor de un portfolio no vacío sin precios', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ totalCards: 3, unpricedCards: 3, valueUsd: 0, pricedCopies: 0, freshCopies: 0, staleCopies: 0, oldestFetchedAt: null, newestFetchedAt: null }]).mockResolvedValueOnce([]),
      portfolioSnapshot: { upsert: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const result = await new PortfolioService(prisma, provider).summary('user-test');
    expect(result.valuation.amount).toBeNull();
    expect(result.valuation.coverage).toMatchObject({ totalCopies: 3, pricedCopies: 0, unpricedCopies: 3, coverageRatio: 0 });
  });

  it('el corte diario usa las observaciones actuales y respeta su flag', async () => {
    const capture = vi.fn().mockResolvedValue(undefined);
    const writeLegacy = vi.fn();
    const service = new PortfolioService({ $executeRaw: writeLegacy } as unknown as PrismaService, provider,
      undefined, { capture } as unknown as CollectionComparisonService);
    vi.stubEnv('ENABLE_PORTFOLIO_SNAPSHOTS_CRON', 'false');
    await service.captureDaily();
    expect(capture).not.toHaveBeenCalled();
    vi.stubEnv('ENABLE_PORTFOLIO_SNAPSHOTS_CRON', 'true');
    await service.captureDaily();
    expect(capture).toHaveBeenCalledOnce();
    expect(writeLegacy).not.toHaveBeenCalled();
  });
});
