// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PortfolioDto } from '@/types/api';
const mocks = vi.hoisted(() => ({ getPortfolio: vi.fn(), currency: 'USD' }));
vi.mock('@/lib/api/collections', () => ({ getPortfolio: mocks.getPortfolio }));
vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ currency: mocks.currency, activeRate: mocks.currency === 'ARS' ? { rate: 1500, rateType: 'blue' } : null, isStale: false, formatMoney: (usd: number) => `USD ${usd}` }) }));
vi.mock('next/image', () => ({ default: () => null }));
import { PortfolioOverview } from '../portfolio-overview';
const today = new Date().toISOString().slice(0, 10);
const recency = { freshness: 'unknown' as const, freshCopies: 0, staleCopies: 0, unknownFreshnessCopies: 0, upstreamFreshness: 'unknown' as const, oldestFetchedAt: null, newestFetchedAt: null };
const empty: PortfolioDto = { valueUsd: null, totalCards: 2, unpricedCards: 2, topCards: [], valuation: { amount: null, currency: 'USD', evaluatedAt: `${today}T10:00:00.000Z`, coverage: { totalCopies: 2, pricedCopies: 0, unpricedCopies: 2, coverageRatio: 0 }, recency },
  history: [{ date: today, valueUsd: null, totalCards: 2, unpricedCards: 2 }] };
beforeEach(() => { vi.clearAllMocks(); mocks.currency = 'USD'; });

it('sin cotizaciones muestra valor desconocido y no inventa una gráfica', async () => {
  mocks.getPortfolio.mockResolvedValue(empty);
  render(<PortfolioOverview />);
  expect(await screen.findByText('Sin referencia de precio para estas 2 copias.')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getAllByLabelText('Sin precio')).toHaveLength(1);
});

it('grafica observaciones reales y permite consultar otro período', async () => {
  const old = new Date(); old.setUTCDate(old.getUTCDate() - 10);
  const complete = (amount: number) => ({ amount, currency: 'USD' as const, evaluatedAt: null, coverage: { totalCopies: 2, pricedCopies: 2, unpricedCopies: 0, coverageRatio: 1 }, recency: null });
  mocks.getPortfolio.mockResolvedValue({ ...empty, valueUsd: 25, unpricedCards: 0, valuation: { ...empty.valuation!, amount: 25, coverage: { totalCopies: 2, pricedCopies: 2, unpricedCopies: 0, coverageRatio: 1 } },
    history: [{ date: old.toISOString().slice(0, 10), valueUsd: 20, totalCards: 2, unpricedCards: 0, valuation: complete(20) }, { date: today, valueUsd: 25, totalCards: 2, unpricedCards: 0, valuation: complete(25) }] });
  render(<PortfolioOverview />);
  expect(await screen.findByRole('img', { name: /Valor observado de tus colecciones/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '7 días' }));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText(/Falta otra valoración en este período/)).toBeInTheDocument();
});

it('conserva orden y máximo cinco del ranking por copia, sin ordenar por subtotal', async () => {
  const topCards = Array.from({ length: 6 }, (_, i) => ({ cardId: `card-${i}`, name: `Carta ${i}`, imageSmall: '/card.png', setName: 'Set', number: String(i), variant: 'normal' as const, quantity: i + 1, marketUsd: 10 - i, valueUsd: (10 - i) * (i + 1) }));
  mocks.getPortfolio.mockResolvedValue({ ...empty, topCards });
  render(<PortfolioOverview />);
  await screen.findByText('Carta 0');
  const links = screen.getAllByRole('link');
  expect(links).toHaveLength(5);
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['/carta/card-0','/carta/card-1','/carta/card-2','/carta/card-3','/carta/card-4']);
  expect(links[0]).toHaveTextContent('USD 10');
  expect(links[4]).toHaveTextContent('Total USD 30');
  expect(screen.getAllByText('Antigüedad no disponible.')).toHaveLength(5);
});

it('la observación histórica conserva su cobertura y aclara conversión ARS actual', async () => {
  mocks.currency = 'ARS';
  mocks.getPortfolio.mockResolvedValue({ ...empty, history: [{ date: today, valueUsd: 10, totalCards: 4, unpricedCards: 3, valuation: { amount: 10, currency: 'USD', evaluatedAt: null, recency: null, coverage: { totalCopies: 4, pricedCopies: 1, unpricedCopies: 3, coverageRatio: .25 } } }] });
  render(<PortfolioOverview />);
  const summary = await screen.findByText('Ver valoraciones registradas (1)');
  fireEvent.click(summary);
  expect(screen.getByText('Valor parcial · 1 de 4 copias con precio.')).toBeInTheDocument();
  expect(screen.getByText('Antigüedad de las referencias no registrada.')).toBeInTheDocument();
  expect(screen.getByText(/Historial en USD convertido al cambio actual/)).toBeInTheDocument();
  expect(screen.getByText('Sin referencia de precio para estas 2 copias.')).toBeInTheDocument();
});

it('cambia la escala temporal aunque los períodos tengan las mismas observaciones', async () => {
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const value = { ...empty.valuation!, amount: 10 };
  mocks.getPortfolio.mockResolvedValue({ ...empty, valuation: value, history: [
    { date: yesterday.toISOString().slice(0, 10), valueUsd: 10, totalCards: 2, unpricedCards: 0, valuation: value },
    { date: today, valueUsd: 10, totalCards: 2, unpricedCards: 0, valuation: value },
  ] });
  render(<PortfolioOverview />);
  const graph = await screen.findByRole('img', { name: /Valor observado de tus colecciones/ });
  const initialX = Number(graph.querySelector('circle')!.getAttribute('cx'));
  fireEvent.click(screen.getByRole('button', { name: '7 días' }));
  expect(Number(graph.querySelector('circle')!.getAttribute('cx'))).toBeLessThan(initialX);
  expect(graph.querySelectorAll('circle')).toHaveLength(2);
});
