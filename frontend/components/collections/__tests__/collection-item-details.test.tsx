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
const updateItem = vi.fn();
vi.mock('@/lib/api/collections', () => ({ listCollections: async () => [{ id: 'collection', name: 'Prueba', isDefault: true }], addItem: (...args: unknown[]) => addItem(...args), updateItem: (...args: unknown[]) => updateItem(...args) }));
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
  expect(screen.queryByText(/La condición.*no ajusta este valor/)).not.toBeInTheDocument();
});
it('una fila con market null conserva procedencia y explica ausencia de referencia', () => {
  render(<CollectionItemDetails item={{ ...item, price: { ...item.price!, market: null } }} />);
  expect(screen.getByText('Sin referencia de precio para esta variante.')).toBeInTheDocument();
  expect(screen.getByText(/Mercado: tcgplayer · API: tcgdex/)).not.toBeVisible();
  fireEvent.click(screen.getByText('Ver referencia del precio'));
  expect(screen.getByText(/Mercado: tcgplayer · API: tcgdex/)).toBeVisible();
  expect(screen.queryByText(/USD 0/)).not.toBeInTheDocument();
});

it('el sheet muestra el precio exacto de la variante elegida sin tener que guardar', async () => {
  getCardPrices.mockResolvedValue({ prices: [{ ...item.price, variant: 'normal', market: 1 }, item.price] });
  render(<ItemSheet item={item} open onClose={vi.fn()} />);
  expect(await screen.findByRole('combobox', { name: 'Variante' })).toHaveTextContent('Holofoil');
  expect(screen.queryByRole('combobox', { name: 'Condición' })).not.toBeInTheDocument();
  expect(screen.getByText('USD 15.00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('combobox', { name: 'Variante' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Normal' }));
  expect(screen.getByText('USD 1.00')).toBeInTheDocument();
  expect(screen.getByText('USD 3.00')).toBeInTheDocument();
  expect(screen.queryByText('USD 5.00')).not.toBeInTheDocument();
  expect(screen.queryByText('USD 15.00')).not.toBeInTheDocument();
});

it('muestra la referencia TCGCSV por copia y conserva Holofoil sin selector innecesario', async () => {
  getCardPrices.mockResolvedValue({ prices: [{ ...item.price, variant: 'holofoil', market: 1.09, provider: 'tcgcsv' }] });
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

it('Reverse Holofoil conserva su precio, incluye cero y guarda NM incluso al editar una fila legacy', async () => {
  const saved = { ...item, variant: 'reverseHolofoil' as const, condition: 'NM' as const, price: { ...item.price!, variant: 'reverseHolofoil' as const, market: 0 } };
  getCardPrices.mockResolvedValue({ prices: [item.price, saved.price] });
  updateItem.mockResolvedValue(saved);
  const onUpdated = vi.fn();
  render(<ItemSheet item={item} open onClose={vi.fn()} onUpdated={onUpdated} />);
  fireEvent.click(await screen.findByRole('combobox', { name: 'Variante' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Reversa holofoil' }));
  expect(screen.getAllByText('USD 0.00')).toHaveLength(2);
  expect(screen.queryByText(/Sin referencia de precio/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(updateItem).toHaveBeenCalledWith(item.id, expect.objectContaining({ variant: 'reverseHolofoil', condition: 'NM' })));
  expect(onUpdated).toHaveBeenCalledWith(saved);
});

it('no usa el precio normal si la variante seleccionada no tiene cotización', async () => {
  getCardPrices.mockResolvedValue({ prices: [{ ...item.price!, variant: 'normal', market: 4 }, { ...item.price!, variant: 'reverseHolofoil', market: null }] });
  render(<ItemSheet item={{ ...item, variant: 'normal', price: { ...item.price!, variant: 'normal', market: 4 } }} open onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole('combobox', { name: 'Variante' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Reversa holofoil' }));
  expect(screen.getByText('Sin referencia de precio para esta variante.')).toBeInTheDocument();
  expect(screen.queryByText('USD 4.00')).not.toBeInTheDocument();
  expect(screen.queryByText('USD 12.00')).not.toBeInTheDocument();
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
