// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PortfolioDto } from '@/types/api';
const mocks = vi.hoisted(() => ({ getPortfolio: vi.fn() }));
vi.mock('@/lib/api/collections', () => ({ getPortfolio: mocks.getPortfolio }));
vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ formatMoney: (usd: number) => `USD ${usd}` }) }));
import { PortfolioOverview } from '../portfolio-overview';
const today = new Date().toISOString().slice(0, 10);
const empty: PortfolioDto = { valueUsd: null, totalCards: 2, unpricedCards: 2, topCards: [],
  history: [{ date: today, valueUsd: null, totalCards: 2, unpricedCards: 2 }] };
beforeEach(() => vi.clearAllMocks());

it('sin cotizaciones muestra valor desconocido y no inventa una gráfica', async () => {
  mocks.getPortfolio.mockResolvedValue(empty);
  render(<PortfolioOverview />);
  expect(await screen.findByText('Valor parcial: 2 cartas sin precio')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getAllByLabelText('Sin precio')).toHaveLength(2);
});

it('grafica observaciones reales y permite consultar otro período', async () => {
  const old = new Date(); old.setUTCDate(old.getUTCDate() - 10);
  mocks.getPortfolio.mockResolvedValue({ ...empty, valueUsd: 25, unpricedCards: 0,
    history: [{ date: old.toISOString().slice(0, 10), valueUsd: 20, totalCards: 2, unpricedCards: 0 }, { date: today, valueUsd: 25, totalCards: 2, unpricedCards: 0 }] });
  render(<PortfolioOverview />);
  expect(await screen.findByRole('img', { name: /Valor del portafolio/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '7 días' }));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText(/Falta otra valoración en este período/)).toBeInTheDocument();
});
