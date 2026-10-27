// @vitest-environment jsdom
import { formatPrice } from '@/lib/format';
import { createSessionDraft } from '../session-draft';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { AddItemPayload } from '@/lib/api/collections';
import type { CollectionDto, PriceDto } from '@/types/api';
import { OrganizeSheet } from '../organize-sheet';
import type { SessionEntry } from '../types';

const { auth, getCardPrices, searchCards, addItem, listCollections, success } = vi.hoisted(() => ({ auth: { userId: 'user-1' }, getCardPrices: vi.fn(), searchCards: vi.fn(), addItem: vi.fn<(id: string, payload: AddItemPayload, key?: string) => Promise<unknown>>(), listCollections: vi.fn<() => Promise<CollectionDto[]>>(), success: vi.fn() }));
vi.mock('@/lib/api/collections', () => ({ addItem, listCollections }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: auth.userId } }) }));
vi.mock('@/components/ui', async (original) => ({ ...(await original<typeof import('@/components/ui')>()), useToast: () => ({ success }) }));
vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ formatMoney: (usd: number | null) => formatPrice(usd, 'USD') }) }));
vi.mock('@/lib/api/cards', () => ({ getCardPrices, searchCards }));
vi.mock('../card-thumb', () => ({ CardThumb: () => null }));

function entry(runId = 1, cardId = `card-${runId}`, priced = true): SessionEntry {
  const price: PriceDto = { cardId, variant: 'holofoil', low: null, mid: null, high: null, market: 10, currency: 'USD', provider: 'tcgcsv', source: 'tcgplayer', fetchedAt: '2026-10-07T12:00:00Z' };
  return { runId, candidate: { card: { id: cardId, name: `Carta ${runId}`, setId: 'set', number: String(runId), supertype: 'pokemon', subtypes: [], hp: null, types: [], rarity: null, artist: null, imageSmall: '', imageLarge: '' }, score: 1, rawScore: 1, price: priced ? price : null, prices: priced ? [price] : [] } };
}
function collection(): CollectionDto { return { id: 'collection-1', userId: 'user-1', name: 'Mi colección', isDefault: true, itemCount: 0, uniqueCount: 0, duplicateCount: 0, totalValueUsd: 0, totalValueArs: null, cover: [], createdAt: '2026-10-01' }; }
function mount(entries = [entry()]) {
  const props = { open: true, entries, onClose: vi.fn(), onSaved: vi.fn(), onRemove: vi.fn() };
  const view = render(<OrganizeSheet {...props} />);
  return { ...props, view };
}
async function chooseCollection() {
  const user = userEvent.setup();
  const combo = screen.getByRole('combobox', { name: 'Destino del lote' });
  await user.click(combo);
  await waitFor(() => expect(combo.getAttribute('aria-controls')).toBeTruthy());
  const list = document.getElementById(combo.getAttribute('aria-controls') ?? '');
  const target = [...(list?.querySelectorAll('[role="option"]') ?? [])].find((node) => node.textContent?.includes('Mi colección'));
  expect(target).toBeTruthy();
  fireEvent.click(target as HTMLElement);
}

beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks(); auth.userId = 'user-1';
  getCardPrices.mockResolvedValue({ prices: [] });
  searchCards.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
  listCollections.mockResolvedValue([collection()]);
  addItem.mockResolvedValue({ id: 'item', card: { id: 'card-1' }, quantity: 1 });
});

describe('OrganizeSheet', () => {
  it('guarda con identidad aceptada, NM y la variante de la referencia mostrada, sin pedir datos por copia', async () => {
    mount();
    await screen.findAllByText('Carta 1');
    expect(screen.queryByRole('combobox', { name: 'Variante' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Condición' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar carta propuesta' })).not.toBeInTheDocument();
    expect(screen.getByText('Propuesta aceptada · podés corregirla')).toBeInTheDocument();
    await chooseCollection();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar listas (1)' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0]?.[1]).toEqual({ cardId: 'card-1', variant: 'holofoil', condition: 'NM', quantity: 1 });
    expect(addItem.mock.calls[0]?.[2]).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('resuelve un intento incierto con el mismo UUID y payload', async () => {
    addItem.mockRejectedValueOnce(new TypeError('network failed')).mockResolvedValueOnce({ id: 'item', card: { id: 'card-1' }, quantity: 1 });
    mount();
    await screen.findAllByText('Carta 1');
    await chooseCollection();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar listas (1)' }));
    await screen.findByText('Resultado incierto');
    const original = addItem.mock.calls[0];
    expect(original).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Verificar este intento' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(2));
    expect(addItem.mock.calls[1]).toEqual(original);
  });

  it('suma dos capturas intencionales de la misma carta en un único incremento', async () => {
    mount([entry(1, 'same-card'), entry(2, 'same-card')]);
    await screen.findAllByText('Carta 1');
    await chooseCollection();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar listas (1)' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0]?.[1]).toEqual({ cardId: 'same-card', variant: 'holofoil', condition: 'NM', quantity: 2 });
  });

  it('guarda un grupo de 1002 en partes idempotentes y conserva el reintento de la parte incierta', async () => {
    const scan = entry(7, 'same-card');
    const draft = createSessionDraft([scan], 'large-group');
    draft.ownerUserId = 'user-1'; draft.selectedCollectionId = 'collection-1'; draft.destinationConfirmed = true;
    draft.allocations = [
      { ...draft.allocations[0]!, id: 'allocation-999', quantity: 999 },
      { ...draft.allocations[0]!, id: 'allocation-3', quantity: 3 },
    ];
    sessionStorage.setItem('pcs.scanDraft', JSON.stringify(draft));
    addItem.mockResolvedValueOnce({ id: 'item', card: { id: 'same-card' }, quantity: 999 })
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce({ id: 'item', card: { id: 'same-card' }, quantity: 3 });
    mount([scan]);
    await screen.findAllByText('Carta 7');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar listas (2)' }));
    await screen.findByText('Resultado incierto');
    expect(addItem.mock.calls.map((call) => call[1]?.quantity)).toEqual([999, 3]);
    const uncertain = addItem.mock.calls[1];
    fireEvent.click(screen.getByRole('button', { name: 'Verificar este intento' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(3));
    expect(addItem.mock.calls[2]).toEqual(uncertain);
    await waitFor(() => expect(success).toHaveBeenCalledWith('Guardamos 3 copias.'));
    const savedDraft = JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}') as { allocations: unknown[]; operations: Array<{ status: string; payload: { quantity: number } }> };
    expect(savedDraft.allocations).toHaveLength(0);
    expect(savedDraft.operations.map((operation) => [operation.status, operation.payload.quantity])).toEqual([['confirmed', 999], ['confirmed', 3]]);
  });

  it('guarda lecturas con referencia y conserva pendientes sin variante respaldada', async () => {
    const reads = [entry(1, 'no-price', false), entry(2, 'priced-card')];
    const { onSaved } = mount(reads);
    await screen.findAllByText('Carta 1');
    expect(screen.getByText('Sin variante respaldada: esta lectura queda pendiente.')).toBeInTheDocument();
    await chooseCollection();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar listas (1)' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0]?.[1]).toEqual({ cardId: 'priced-card', variant: 'holofoil', condition: 'NM', quantity: 1 });
    expect(onSaved).toHaveBeenCalledWith([2]);
    expect(screen.getByText('Carta 1')).toBeInTheDocument();
  });

  it('un 4xx confirmado como rechazo libera la lectura para corrección sin enviarla al guardar', async () => {
    addItem.mockRejectedValueOnce(new ApiError(404, 'Colección no encontrada.'));
    mount();
    await screen.findAllByText('Carta 1');
    await chooseCollection();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar listas (1)' }));
    await screen.findByText('No se guardó esta parte');
    expect(screen.getByText('Carta 1')).toBeInTheDocument();
    expect(addItem).toHaveBeenCalledTimes(1);
  });
});
