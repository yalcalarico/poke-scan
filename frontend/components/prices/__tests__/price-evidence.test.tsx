// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PriceDto, ValueAggregateDto } from '@/types/api';
import { PriceReferenceDetails, ValuationEvidence } from '../price-evidence';

vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ currency: 'USD', activeRate: null, isStale: false }) }));

const coverage = (totalCopies: number, pricedCopies: number) => ({ totalCopies, pricedCopies, unpricedCopies: totalCopies - pricedCopies, coverageRatio: totalCopies === 0 ? null : pricedCopies / totalCopies });
const recency = { freshness: 'fresh' as const, freshCopies: 2, staleCopies: 0, unknownFreshnessCopies: 0, upstreamFreshness: 'unknown' as const, oldestFetchedAt: '2026-10-08T10:00:00.000Z', newestFetchedAt: '2026-10-08T10:00:00.000Z' };
const valuation = (amount: number | null, totalCopies: number, pricedCopies: number): ValueAggregateDto => ({ amount, currency: 'USD', evaluatedAt: '2026-10-08T10:01:00.000Z', coverage: coverage(totalCopies, pricedCopies), recency });

describe('PriceEvidence', () => {
  it('explica consulta reciente sin fingir fecha upstream', () => {
    const reference: PriceDto = { cardId: 'c', variant: 'normal', low: null, mid: null, high: null, market: 0, provider: 'tcgdex', currency: 'USD', source: 'tcgplayer', fetchedAt: '2026-10-08T10:00:00.000Z', evaluatedAt: '2026-10-08T10:01:00.000Z', freshness: 'fresh', upstreamUpdatedAt: null, upstreamFreshness: 'unknown' };
    const { rerender } = render(<PriceReferenceDetails reference={reference} />);
    expect(screen.getByText(/Mercado: tcgplayer · API: tcgdex/)).toBeInTheDocument();
    expect(screen.getByText(/Consulta reciente al evaluar/)).toBeInTheDocument();
    expect(screen.getByText('Fecha de actualización de la fuente no disponible')).toBeInTheDocument();
    rerender(<PriceReferenceDetails reference={{ ...reference, freshness: 'stale', upstreamUpdatedAt: '2026-10-01T10:00:00.000Z', upstreamFreshness: 'stale' }} />);
    expect(screen.getByText(/Consulta anterior o de otra API al evaluar/)).toBeInTheDocument();
    expect(screen.getAllByText(/referencia anterior/i).length).toBeGreaterThan(0);
    rerender(<PriceReferenceDetails reference={{ ...reference, freshness: 'unknown', upstreamUpdatedAt: null, upstreamFreshness: 'unknown' }} />);
    expect(screen.getAllByText(/Antigüedad no disponible/).length).toBeGreaterThan(0);
  });

  it('separa vacío, cero conocido, desconocido y subtotal parcial', () => {
    const { rerender } = render(<ValuationEvidence valuation={valuation(0, 0, 0)} />);
    expect(screen.getByText('Todavía no hay cartas en esta colección.')).toBeInTheDocument();
    rerender(<ValuationEvidence valuation={valuation(0, 2, 2)} />);
    expect(screen.getByText('2 de 2 copias con precio.')).toBeInTheDocument();
    rerender(<ValuationEvidence valuation={valuation(null, 3, 0)} />);
    expect(screen.getByText('Sin referencia de precio para estas 3 copias.')).toBeInTheDocument();
    rerender(<ValuationEvidence valuation={valuation(24, 4, 3)} />);
    expect(screen.getByText('Valor parcial · 3 de 4 copias con precio.')).toBeInTheDocument();
  });

  it('explica que la valuación y la cobertura legacy ausentes no se conocen', () => {
    render(<ValuationEvidence valuation={undefined} />);
    expect(screen.getByText('Valuación, cobertura y antigüedad no disponibles.')).toBeInTheDocument();
  });
});

it('conserva la hora exacta de evaluación cacheada sin usar el reloj del browser', () => {
  render(<ValuationEvidence valuation={valuation(24, 4, 3)} />);
  expect(screen.getAllByText(/10:01:00\.000 UTC/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Consultas incluidas entre/)).toHaveTextContent('10:00:00.000 UTC');
});

it('una fecha legacy imposible no se normaliza a una consulta de otro día', () => {
  render(<PriceReferenceDetails reference={{ provider: null, source: 'tcgplayer', currency: 'USD', fetchedAt: '2026-02-31T10:00:00.000Z' }} />);
  expect(screen.getByText(/Consulta: fecha no disponible/)).toHaveTextContent('Antigüedad no disponible');
  expect(screen.getByText(/Mercado: tcgplayer · API: origen no identificado/)).toHaveTextContent('referencia legacy');
});
