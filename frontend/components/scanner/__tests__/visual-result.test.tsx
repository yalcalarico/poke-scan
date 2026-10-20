// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SessionEntry } from '../types';

const mode = vi.hoisted(() => ({ active: true }));
vi.mock('@/components/visual-preview/visual-preview', () => ({ useVisualPreview: () => mode.active, useVisualGridMemory: () => null }));
vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ formatMoney: (value: number | null | undefined) => value == null ? '—' : `USD ${value}` }) }));
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) =>
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt={alt} /> }));
import { VisualScanResult } from '../visual-result';

const entry: SessionEntry = { runId: 7, candidate: {
  card: { id: 'base1-58', name: 'Pikachu', setId: 'base1', number: '58', imageSmall: '/pikachu.png', imageLarge: '/pikachu.png', supertype: 'Pokémon', subtypes: [], hp: '40', types: ['Lightning'], rarity: 'Common', artist: null },
  score: .8, rawScore: .8, price: null, prices: [],
} };
beforeEach(() => { mode.active = true; });
it('Actual no incorpora la presentación experimental del resultado', () => {
  mode.active = false;
  const { container } = render(<VisualScanResult entry={entry} onReview={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});
it('V2 presenta la propuesta existente sin inventar precio ni confirmación', () => {
  const review = vi.fn();
  render(<VisualScanResult entry={entry} onReview={review} />);
  expect(screen.getByText('Coincidencia propuesta')).toBeInTheDocument();
  expect(screen.getByText('Sin referencia de precio disponible.')).toBeInTheDocument();
  expect(screen.queryByText('USD 0')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver detalle de la carta' })).toHaveAttribute('href', '/carta/base1-58?visual=v2');
  fireEvent.click(screen.getByRole('button', { name: 'Revisar coincidencia' }));
  expect(review).toHaveBeenCalledOnce();
});

it('muestra el total impreso de la expansión aunque tenga cartas adicionales', () => {
  const proposal: SessionEntry = { ...entry, candidate: { ...entry.candidate, card: { ...entry.candidate.card,
    number: '92', set: { id: 'me55', name: '30th Celebration', printedTotal: 128, total: 161,
      series: null, releaseDate: null, logoUrl: null, symbolUrl: null },
  } } };
  render(<VisualScanResult entry={proposal} onReview={vi.fn()} />);
  expect(screen.getByText('30th Celebration · 92 / 128')).toBeInTheDocument();
  expect(screen.queryByText(/92 \/ 161/)).not.toBeInTheDocument();
});
