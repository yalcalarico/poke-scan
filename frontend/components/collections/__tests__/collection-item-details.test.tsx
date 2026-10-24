// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { CollectionItemDto } from '@/types/api';
import { ItemSheet, AddToCollectionSheet } from '../item-sheet';
import { CollectionItemDetails } from '../collection-item-details';

vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ currency: 'USD', formatMoney: (value: number | null | undefined) => value == null ? '—' : `USD ${value.toFixed(2)}` }) }));
vi.mock('@/components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui')>();
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
const getCardPrices = vi.fn();
const addItem = vi.fn();
vi.mock('@/lib/api/collections', () => ({ listCollections: async () => [{ id: 'collection', name: 'Prueba', isDefault: true }], addItem: (...args: unknown[]) => addItem(...args) }));
vi.mock('@/lib/api/cards', () => ({ getCardPrices: (...args: unknown[]) => getCardPrices(...args) }));
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
  getCardPrices.mockResolvedValue({ prices: [{ variant: 'normal' }, { variant: 'holofoil' }] });
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

it('muestra la referencia TCGCSV por copia y conserva Holofoil sin selector innecesario', async () => {
  getCardPrices.mockResolvedValue({ prices: [{ variant: 'holofoil' }] });
  const alternate = { ...item, price: { ...item.price!, provider: 'tcgcsv', market: 1.09 } };
  const { unmount } = render(<CollectionItemDetails item={alternate} />);
  expect(screen.getByText('Por copia: USD 1.09')).toBeInTheDocument();
  expect(screen.getByText('Total: USD 3.27')).toBeInTheDocument();
  expect(screen.queryByText(/Sin referencia de precio/)).not.toBeInTheDocument();
  unmount();
  render(<ItemSheet item={alternate} open onClose={vi.fn()} />);
  await screen.findByText('Holofoil');
  expect(screen.queryByRole('combobox', { name: 'Variante' })).not.toBeInTheDocument();
  expect(screen.getByText('USD 1.09')).toBeInTheDocument();
});

it('el alta guarda Holofoil automáticamente cuando es la única variante conocida', async () => {
  getCardPrices.mockResolvedValue({ prices: [{ variant: 'holofoil', market: 1.09 }] });
  addItem.mockResolvedValue(item);
  render(<AddToCollectionSheet cardId="card" open onClose={vi.fn()} />);
  await screen.findByText('Holofoil');
  expect(screen.queryByRole('combobox', { name: 'Variante' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Añadir' }));
  await waitFor(() => expect(addItem).toHaveBeenCalledWith('collection', expect.objectContaining({ cardId: 'card', variant: 'holofoil' })));
});
