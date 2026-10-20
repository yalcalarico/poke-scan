// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { CollectionItemDto } from '@/types/api';
import { ItemSheet } from '../item-sheet';
import { CollectionItemDetails } from '../collection-item-details';

vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ currency: 'USD', formatMoney: (value: number | null | undefined) => value == null ? '—' : `USD ${value.toFixed(2)}` }) }));
vi.mock('@/components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui')>();
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
const item: CollectionItemDto = {
  id: 'item', collectionId: 'collection', variant: 'holofoil', condition: 'LP', quantity: 3, isForTrade: false, notes: null,
  addedAt: '2026-10-08T10:00:00.000Z',
  card: { id: 'card', name: 'Pikachu', number: '1', setId: 'set', supertype: 'Pokémon', subtypes: [], hp: null, types: [], rarity: null, artist: null, imageSmall: '/card.png', imageLarge: '/card.png' },
  price: { cardId: 'card', variant: 'holofoil', low: null, mid: null, high: null, market: 5, currency: 'USD', provider: 'tcgdex', source: 'tcgplayer', fetchedAt: '2026-10-08T10:00:00.000Z' },
};
it('asocia cantidad, market unitario y subtotal de la variante exacta sin ajustar condición', () => {
  render(<CollectionItemDetails item={item} />);
  expect(screen.getByText('Por copia: USD 5.00')).toBeInTheDocument();
  expect(screen.getByText('Total: USD 15.00')).toBeInTheDocument();
  expect(screen.getByText(/La condición.*no ajusta este valor/)).toBeInTheDocument();
});
it('una fila con market null conserva procedencia y explica ausencia de referencia', () => {
  render(<CollectionItemDetails item={{ ...item, price: { ...item.price!, market: null } }} />);
  expect(screen.getByText('Sin referencia de precio para esta variante.')).toBeInTheDocument();
  expect(screen.getByText(/Mercado: tcgplayer · API: tcgdex/)).toBeInTheDocument();
  expect(screen.queryByText(/USD 0/)).not.toBeInTheDocument();
});

it('el sheet empieza con los atributos guardados y retira la referencia al editar variante', async () => {
  render(<ItemSheet item={item} open onClose={vi.fn()} />);
  expect(await screen.findByRole('combobox', { name: 'Variante' })).toHaveTextContent('Holofoil');
  expect(screen.getByRole('combobox', { name: 'Condición' })).toHaveTextContent('Lightly Played');
  expect(screen.getByText('USD 15.00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('combobox', { name: 'Variante' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Normal' }));
  expect(screen.getByText('Guardá el cambio de variante para ver su referencia de precio.')).toBeInTheDocument();
  expect(screen.queryByText('USD 5.00')).not.toBeInTheDocument();
  expect(screen.queryByText('USD 15.00')).not.toBeInTheDocument();
  expect(screen.queryByText(/Mercado: tcgplayer/)).not.toBeInTheDocument();
});
