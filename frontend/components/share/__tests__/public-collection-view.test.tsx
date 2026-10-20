// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PublicSharedCollection } from '@/lib/api/share';

vi.mock('@/components/share/public-card-grid', () => ({
  PublicCardGrid: () => <div aria-label="grilla de cartas" />,
}));
vi.mock('@/components/share/install-cta', () => ({ InstallCta: () => null }));

import { PublicCollectionView } from '../public-collection-view';

function sharedCollection(overrides: Partial<PublicSharedCollection['stats']>): PublicSharedCollection {
  return {
    ownerDisplayName: 'Ada',
    collectionName: 'Binder',
    sharedAt: '2026-10-07T00:00:00.000Z',
    truncated: true,
    items: [],
    stats: {
      totalGroups: 520,
      totalCards: 700,
      uniqueCards: 400,
      duplicateCards: 25,
      setsCount: 12,
      totalValueUsd: 125.5,
      pricedGroups: 500,
      cardsMissingPrice: 20,
      valuation: { amount: 125.5, currency: 'USD', evaluatedAt: '2026-10-07T10:00:00.000Z', coverage: { totalCopies: 700, pricedCopies: 680, unpricedCopies: 20, coverageRatio: 680 / 700 }, recency: { freshness: 'mixed', freshCopies: 400, staleCopies: 200, unknownFreshnessCopies: 80, upstreamFreshness: 'unknown', oldestFetchedAt: null, newestFetchedAt: null } },
      ...overrides,
    },
  };
}

describe('PublicCollectionView', () => {
  it('distingue grupos, copias y grupos duplicados, con truncamiento exacto', () => {
    render(<PublicCollectionView data={sharedCollection({})} />);

    expect(screen.getByText('Grupos')).toBeInTheDocument();
    expect(screen.getByText('Copias')).toBeInTheDocument();
    expect(screen.getByText('Grupos con duplicadas')).toBeInTheDocument();
    expect(screen.getByText(/Mostramos 0 de 520 grupos/)).toBeInTheDocument();
    expect(screen.getByText(/680 de 700 copias con precio/)).toBeInTheDocument();
    expect(screen.getByText(/hasta 500 grupos visibles/i)).toBeInTheDocument();
    expect(screen.getByText(/Valor parcial/)).toBeInTheDocument();
    expect(screen.getByText(/sin ajuste por condición. No son precios de venta/)).toBeInTheDocument();
  });

  it('presenta valor desconocido cuando hay grupos sin precio y cero solo para scope vacío', () => {
    const { rerender } = render(<PublicCollectionView data={sharedCollection({ totalValueUsd: null, pricedGroups: 0, cardsMissingPrice: 520, valuation: { amount: null, currency: 'USD', evaluatedAt: '2026-10-07T10:00:00.000Z', coverage: { totalCopies: 700, pricedCopies: 0, unpricedCopies: 700, coverageRatio: 0 }, recency: { freshness: 'unknown', freshCopies: 0, staleCopies: 0, unknownFreshnessCopies: 0, upstreamFreshness: 'unknown', oldestFetchedAt: null, newestFetchedAt: null } } })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Sin referencia de precio para estas 700 copias/)).toBeInTheDocument();

    rerender(<PublicCollectionView data={sharedCollection({ totalGroups: 0, totalCards: 0, uniqueCards: 0, duplicateCards: 0, setsCount: 0, totalValueUsd: 0, pricedGroups: 0, cardsMissingPrice: 0, valuation: { amount: 0, currency: 'USD', evaluatedAt: '2026-10-07T10:00:00.000Z', coverage: { totalCopies: 0, pricedCopies: 0, unpricedCopies: 0, coverageRatio: null }, recency: { freshness: 'unknown', freshCopies: 0, staleCopies: 0, unknownFreshnessCopies: 0, upstreamFreshness: 'unknown', oldestFetchedAt: null, newestFetchedAt: null } } })} />);
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.getByText('Todavía no hay cartas en esta colección.')).toBeInTheDocument();
  });
});

it('muestra el instante cacheado, el rango de consulta y upstream anterior sin inferir fuentes', () => {
  const data = sharedCollection({});
  data.stats.valuation!.recency!.upstreamFreshness = 'stale';
  data.stats.valuation!.recency!.oldestFetchedAt = '2026-10-01T10:00:00.000Z';
  data.stats.valuation!.recency!.newestFetchedAt = '2026-10-07T09:59:00.000Z';
  render(<PublicCollectionView data={data} />);
  expect(screen.getAllByText(/10:00:00\.000 UTC/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Consultas incluidas entre/)).toHaveTextContent('09:59:00.000 UTC');
  expect(screen.getByText(/Hay referencias con fecha de fuente anterior/)).toBeInTheDocument();
});
