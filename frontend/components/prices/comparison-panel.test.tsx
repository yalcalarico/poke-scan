// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardComparisonPanel } from './comparison-panel';

const getCardComparison = vi.fn();
vi.mock('@/lib/api/comparison', () => ({ getCardComparison: (...args: unknown[]) => getCardComparison(...args) }));

const response = {
  cardId: 'base1-1', variant: 'normal', currency: 'USD', windowDays: 30, activeProvider: 'tcgdex', evaluatedAt: '2026-10-13T01:00:00.000Z',
  tcgcsv: { enabled: true, state: 'ready', groupId: 24722, nextAttemptAt: null },
  series: ['tcgdex', 'tcgcsv'].map((provider) => ({ provider, source: 'tcgplayer', currency: 'USD', current: { date: '2026-10-12', market: provider === 'tcgdex' ? 12 : 13, low: null, mid: null, high: null, fetchedAt: '2026-10-12T20:00:00.000Z', feedPublishedAt: null, upstreamUpdatedAt: null, freshness: 'fresh' }, points: [] })),
};

beforeEach(() => getCardComparison.mockReset());

describe('CardComparisonPanel', () => {
  it('no muestra el precio de la variante anterior mientras carga la nueva', async () => {
    let finish!: (data: typeof response) => void;
    getCardComparison.mockResolvedValueOnce(response).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<CardComparisonPanel cardId="base1-1" variants={['normal', 'holofoil']} />);
    const oldPrice = () => screen.queryByText((_, element) => element !== null && element.tagName === 'P' && element.className.includes('text-positive') && element.textContent.includes('13'));
    await waitFor(() => expect(oldPrice()).toBeInTheDocument());
    fireEvent.click(screen.getByRole('combobox', { name: 'Variante de la carta del historial' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Holofoil' }));
    expect(await screen.findByRole('status', { name: 'Cargando historial' })).toBeInTheDocument();
    expect(oldPrice()).not.toBeInTheDocument();
    await waitFor(() => expect(getCardComparison).toHaveBeenCalledTimes(2));
    finish({ ...response, variant: 'holofoil' });
  });
});


describe('Variantes reales de la carta', () => {
  beforeEach(() => getCardComparison.mockImplementation(async (cardId: string, variant: string, days: number) => ({ ...response, cardId, variant, windowDays: days })));

  it('elige Holofoil automáticamente y no muestra selector si sólo existe esa variante', async () => {
    render(<CardComparisonPanel cardId="me55-18" variants={['holofoil']} />);
    await waitFor(() => expect(getCardComparison).toHaveBeenCalled());
    expect(getCardComparison.mock.calls[0].slice(0, 3)).toEqual(['me55-18', 'holofoil', 30]);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Holofoil')).toBeInTheDocument();
  });

  it('deduplica la misma variante recibida de dos fuentes sin crear un selector', async () => {
    render(<CardComparisonPanel cardId="me55-18" variants={['holofoil', 'holofoil']} />);
    await waitFor(() => expect(getCardComparison).toHaveBeenCalled());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('ofrece sólo las variantes conocidas y arranca con la referencia de precio', async () => {
    render(<CardComparisonPanel cardId="base1-1" variants={['normal', 'holofoil']} preferredVariant="holofoil" />);
    await waitFor(() => expect(getCardComparison).toHaveBeenCalled());
    expect(getCardComparison.mock.calls[0][1]).toBe('holofoil');
    fireEvent.click(screen.getByRole('combobox', { name: 'Variante de la carta del historial' }));
    expect(await screen.findAllByRole('option')).toHaveLength(2);
    expect(screen.queryByRole('option', { name: 'Reversa holofoil' })).not.toBeInTheDocument();
  });

  it('no inventa Normal cuando todavía no hay variantes conocidas', () => {
    render(<CardComparisonPanel cardId="me55-R" variants={[]} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Todavía no hay variantes conocidas del historial.')).toBeInTheDocument();
    expect(getCardComparison).not.toHaveBeenCalled();
  });

  it('espera la carga de variantes antes de consultar la comparación', async () => {
    const { rerender } = render(<CardComparisonPanel cardId="me55-18" variants={[]} loadingVariants />);
    expect(screen.getByRole('status', { name: 'Cargando variantes' })).toBeInTheDocument();
    expect(getCardComparison).not.toHaveBeenCalled();
    rerender(<CardComparisonPanel cardId="me55-18" variants={['holofoil']} />);
    await waitFor(() => expect(getCardComparison).toHaveBeenCalled());
    expect(getCardComparison.mock.calls[0][1]).toBe('holofoil');
  });

  it('descarta una selección anterior si cambia la carta o desaparece la variante', async () => {
    const { rerender } = render(<CardComparisonPanel cardId="base1-1" variants={['normal', 'holofoil']} />);
    await waitFor(() => expect(getCardComparison).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('combobox', { name: 'Variante de la carta del historial' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Holofoil' }));
    await waitFor(() => expect(getCardComparison.mock.calls.at(-1)?.[1]).toBe('holofoil'));
    rerender(<CardComparisonPanel cardId="base1-1" variants={['normal']} />);
    await waitFor(() => expect(getCardComparison.mock.calls.at(-1)?.[1]).toBe('normal'));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    rerender(<CardComparisonPanel cardId="me55-18" variants={['holofoil']} />);
    await waitFor(() => expect(getCardComparison.mock.calls.at(-1)?.slice(0,2)).toEqual(['me55-18','holofoil']));
  });
});
