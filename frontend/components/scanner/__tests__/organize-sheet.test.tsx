// @vitest-environment jsdom
import { StrictMode } from 'react';
import { formatPrice } from '@/lib/format';
import { readSession } from '../session-storage';
import { createSessionDraft, writeSessionDraft } from '../session-draft';
import { uxTwentyDraft } from './draft-fixture';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { AddItemPayload } from '@/lib/api/collections';
import type { CollectionDto } from '@/types/api';
import { OrganizeSheet } from '../organize-sheet';
import type { SessionEntry } from '../types';

const { auth, getCardPrices, searchCards, addItem, listCollections, success } = vi.hoisted(() => ({ auth: { userId: 'user-1' }, getCardPrices: vi.fn(), searchCards: vi.fn(), addItem: vi.fn<(id: string, payload: AddItemPayload, key?: string) => Promise<unknown>>(), listCollections: vi.fn<() => Promise<CollectionDto[]>>(), success: vi.fn() }));
vi.mock('@/lib/api/collections', () => ({ addItem, listCollections }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: auth.userId } }) }));
vi.mock('@/components/ui', async (original) => ({ ...(await original<typeof import('@/components/ui')>()), useToast: () => ({ success }) }));
vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ formatMoney: (usd: number | null) => formatPrice(usd, 'USD') }) }));
vi.mock('@/lib/api/cards', () => ({ getCardPrices, searchCards }));
vi.mock('../card-thumb', () => ({ CardThumb: () => null }));

function entry(runId = 1, cardId = `card-${runId}`): SessionEntry {
  return { runId, candidate: { card: { id: cardId, name: `Carta ${runId}`, setId: 'set', number: String(runId), supertype: 'pokemon', subtypes: [], hp: null, types: [], rarity: null, artist: null, imageSmall: '', imageLarge: '' }, score: 1, rawScore: 1, price: null, prices: [] } };
}
function collection(): CollectionDto { return { id: 'collection-1', userId: 'user-1', name: 'Mi colección', isDefault: true, itemCount: 0, uniqueCount: 0, duplicateCount: 0, totalValueUsd: 0, totalValueArs: null, cover: [], createdAt: '2026-10-01' }; }
function mount(entries = [entry()]) {
  const props = { open: true, entries, onClose: vi.fn(), onSaved: vi.fn(), onRemove: vi.fn() };
  const view = render(<OrganizeSheet {...props} />);
  return { ...props, view };
}
async function select(label: string, option: string) {
  const user = userEvent.setup();
  const combo = screen.getByRole('combobox', { name: label });
  await user.click(combo);
  await waitFor(() => expect(combo.getAttribute('aria-controls')).toBeTruthy());
  const list = document.getElementById(combo.getAttribute('aria-controls') ?? '');
  const target = [...(list?.querySelectorAll('[role="option"]') ?? [])].find((node) => node.textContent?.includes(option));
  expect(target).toBeTruthy();
  fireEvent.click(target as HTMLElement);
  await waitFor(() => expect(combo).toHaveTextContent(option));
}
async function completeRow() {
  await select('Destino del lote', 'Mi colección');
  await select('Variante', 'Holofoil');
  await select('Condición', 'NM · Near Mint');
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar carta propuesta' }));
}

beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks(); auth.userId = 'user-1';
  getCardPrices.mockResolvedValue({ prices: [] });
  searchCards.mockResolvedValue({ data: [entry(99, 'outside-top-eight').candidate.card], total: 1, page: 1, pageSize: 20, totalPages: 1 });
  listCollections.mockResolvedValue([collection()]);
  addItem.mockResolvedValue({ id: 'item', card: { id: 'card' }, quantity: 1 });
});

describe('OrganizeSheet FE-01', () => {
  it('exige confirmar destino, variante, condición e identidad antes del POST', async () => {
    mount();
    await screen.findAllByText('Carta 1');
    expect(screen.getByRole('button', { name: /Guardar listas/ })).toBeDisabled();
    expect(addItem).not.toHaveBeenCalled();
    await completeRow();
    expect(screen.getByText('1 grupo listo · 0 por completar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar listas (1)' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    const [destination, payload, key] = addItem.mock.calls[0] ?? [];
    expect(destination).toBe('collection-1');
    expect(payload).toEqual({ cardId: 'card-1', variant: 'holofoil', condition: 'NM', quantity: 1 });
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('mantiene el mismo UUID y payload para resolver una respuesta incierta, sin POST al montar', async () => {
    addItem.mockRejectedValueOnce(new TypeError('network failed')).mockRejectedValueOnce(new ApiError(404, 'Colección no encontrada.'));
    mount();
    await screen.findAllByText('Carta 1');
    await completeRow();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar listas (1)' }));
    await screen.findByText('Resultado incierto');
    const original = addItem.mock.calls[0];
    expect(original).toBeDefined();
    expect(screen.getByRole('button', { name: 'Verificar este intento' })).toBeInTheDocument();
    await waitFor(() => expect(sessionStorage.getItem('pcs.scanDraft')).toContain('"status":"uncertain"'));
    fireEvent.click(screen.getByRole('button', { name: 'Verificar este intento' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(2));
    expect(addItem.mock.calls[1]).toEqual(original);
    expect(await screen.findByText('Resultado incierto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar este intento' })).toBeInTheDocument();
  });

  it('separa grupos por variante/condición y retira solo la parte confirmada', async () => {
    const first = entry(1, 'same-card');
    const second = entry(2, 'same-card');
    mount([first, second]);
    await screen.findByText('Carta 1');
    const variants = screen.getAllByRole('combobox', { name: 'Variante' });
    expect(variants).toHaveLength(2);
    expect(screen.getByText('2 lecturas · 2 copias · 1 grupo')).toBeInTheDocument();
    await select('Destino del lote', 'Mi colección');
    const row = screen.getAllByRole('button', { name: 'Confirmar carta propuesta' })[0]?.closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Propuesta por revisar')).toBeInTheDocument();
  });

  it('persiste una separación qty 3 → 2+1 del mismo runId y guarda solo el grupo listo', async () => {
    let confirmResponse!: (response: unknown) => void;
    addItem.mockImplementationOnce(() => new Promise((resolve) => { confirmResponse = resolve; }));
    const scan = entry(7, 'same-card');
    const allocation = { id: 'allocation-original', runId: 7, cardId: 'same-card', variant: 'normal' as const, variantReviewed: true,
      condition: 'NM' as const, conditionReviewed: true, quantity: 3, reviewed: true };
    sessionStorage.setItem('pcs.scanDraft', JSON.stringify({ schemaVersion: 1, sessionId: 'session', ownerUserId: 'user-1',
      selectedCollectionId: 'collection-1', destinationConfirmed: true, allocations: [allocation], operations: [] }));
    const firstMount = mount([scan]);
    await screen.findAllByText('Carta 7');
    fireEvent.click(screen.getByRole('button', { name: 'Separar una copia' }));
    await waitFor(() => expect(screen.getAllByRole('spinbutton', { name: 'Copias de esta lectura' })).toHaveLength(2));
    expect(screen.getAllByRole('spinbutton', { name: 'Copias de esta lectura' }).map((input) => Number((input as HTMLInputElement).value)).sort()).toEqual([1, 2]);
    await waitFor(() => expect(sessionStorage.getItem('pcs.scanDraft')).toContain('"quantity":2'));
    firstMount.view.unmount();

    const remount = mount([scan]);
    await screen.findAllByText('Carta 7');
    expect(screen.getAllByRole('spinbutton', { name: 'Copias de esta lectura' })).toHaveLength(2);
    const conditions = screen.getAllByRole('combobox', { name: 'Condición' });
    const user = userEvent.setup();
    const secondCondition = conditions[1] as HTMLElement;
    await user.click(secondCondition);
    await waitFor(() => expect(secondCondition.getAttribute('aria-controls')).toBeTruthy());
    const conditionList = document.getElementById(secondCondition.getAttribute('aria-controls') ?? '');
    const noCondition = [...(conditionList?.querySelectorAll('[role="option"]') ?? [])].find((node) => node.textContent?.includes('No sé todavía'));
    expect(noCondition).toBeTruthy();
    fireEvent.click(noCondition as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar listas (1)' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0]?.[1]).toEqual({ cardId: 'same-card', variant: 'normal', condition: 'NM', quantity: 2 });
    expect(firstMount.onSaved).not.toHaveBeenCalled();
    // La llamada todavía no confirma el alta: conserva ambas partes mientras espera.
    const pendingDraft = JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}') as { allocations: Array<{ runId: number; quantity: number }>; operations: Array<{ status: string }> };
    expect(pendingDraft.allocations.map(({ runId, quantity }) => ({ runId, quantity }))).toEqual([{ runId: 7, quantity: 2 }, { runId: 7, quantity: 1 }]);
    expect(pendingDraft.operations[0]?.status).toBe('saving');
    expect(remount.onSaved).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();

    confirmResponse({ id: 'item', card: { id: 'same-card' }, quantity: 2 });
    await waitFor(() => {
      const savedDraft = JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}') as { allocations?: Array<{ runId: number; quantity: number }>; operations: Array<{ status: string }> };
      expect(savedDraft.allocations?.map(({ runId, quantity }) => ({ runId, quantity }))).toEqual([{ runId: 7, quantity: 1 }]);
      expect(savedDraft.operations[0]?.status).toBe('confirmed');
      expect(success).toHaveBeenCalledWith('Guardamos 2 copias.');
    });
  });

  it('guarda grupos sucesivos con claves propias y conserva ambas confirmaciones', async () => {
    const first = entry(11, 'same-card');
    const second = entry(12, 'same-card');
    sessionStorage.setItem('pcs.scanDraft', JSON.stringify({ schemaVersion: 1, sessionId: 'two-groups', ownerUserId: 'user-1',
      selectedCollectionId: 'collection-1', destinationConfirmed: true,
      allocations: [
        { id: 'alloc-11', runId: 11, cardId: 'same-card', variant: 'normal', variantReviewed: true, condition: 'NM', conditionReviewed: true, quantity: 1, reviewed: true },
        { id: 'alloc-12', runId: 12, cardId: 'same-card', variant: 'reverseHolofoil', variantReviewed: true, condition: 'LP', conditionReviewed: true, quantity: 1, reviewed: true },
      ], operations: [] }));
    const { onSaved } = mount([first, second]);
    await screen.findAllByText('Carta 11');
    expect(screen.getByText('2 grupos listos · 0 por completar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar listas (2)' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(2));
    const [firstCall, secondCall] = addItem.mock.calls;
    expect(firstCall?.[1]).toEqual({ cardId: 'same-card', variant: 'normal', condition: 'NM', quantity: 1 });
    expect(secondCall?.[1]).toEqual({ cardId: 'same-card', variant: 'reverseHolofoil', condition: 'LP', quantity: 1 });
    expect(firstCall?.[2]).not.toBe(secondCall?.[2]);
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}').operations).toHaveLength(2));
    expect(onSaved.mock.calls.flatMap((call) => call[0] ?? [])).toEqual(expect.arrayContaining([11, 12]));
  });

  it('cantidad vacía/decimal/negativa/sobre999 informa error y no envía el valor anterior', async () => {
    mount();
    await screen.findAllByText('Carta 1');
    await completeRow();
    const input = screen.getByRole('spinbutton', { name: 'Copias de esta lectura' });
    for (const value of ['', '1.5', '-2', '1000']) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByText('Ingresá un entero de 1 a 999. No modificamos la cantidad anterior.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Guardar listas/ })).toBeDisabled();
    }
    expect(addItem).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '3' } });
    expect(screen.queryByText(/Ingresá un entero/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Guardar listas/ }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0]?.[1]?.quantity).toBe(3);
  });

  it('una respuesta con cuerpo inválido queda incierta, no retira ni inventa éxito', async () => {
    addItem.mockResolvedValue({});
    const { onSaved } = mount();
    await screen.findAllByText('Carta 1');
    await completeRow();
    fireEvent.click(screen.getByRole('button', { name: /Guardar listas/ }));
    await screen.findByText('Resultado incierto');
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Guardar listas/ })).toBeDisabled();
  });

  it.each([400, 401, 404, 409, 410])('replay %i conserva identidad; 410 bloquea definitivamente el intento', async (status) => {
    addItem.mockRejectedValueOnce(new TypeError('Respuesta perdida')).mockRejectedValueOnce(new ApiError(status, 'No se puede recuperar.'));
    mount();
    await screen.findAllByText('Carta 1');
    await completeRow();
    fireEvent.click(screen.getByRole('button', { name: /Guardar listas/ }));
    await screen.findByText('Resultado incierto');
    const original = addItem.mock.calls[0];
    fireEvent.click(screen.getByRole('button', { name: 'Verificar este intento' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(2));
    expect(addItem.mock.calls[1]).toEqual(original);
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}').operations[0].status).toBe(status === 410 ? 'blocked' : 'uncertain'));
    expect(screen.getByRole('button', { name: /Guardar listas/ })).toBeDisabled();
    if (status === 410) expect(screen.queryByRole('button', { name: 'Verificar este intento' })).not.toBeInTheDocument();
  });

  it('StrictMode/restaurar no envía POST y changing cuenta/destino no libera un intento incierto', async () => {
    const { draft } = uxTwentyDraft();
    const group = draft.allocations.filter((allocation) => allocation.cardId === 'F');
    draft.operations = [{ id: crypto.randomUUID(), userId: 'user-1', collectionId: 'collection-1', allocationIds: group.map((allocation) => allocation.id), payload: { cardId: 'F', variant: 'normal', condition: 'HP', quantity: 3 }, status: 'saving' }];
    writeSessionDraft(draft);
    const props = { open: true, entries: draft.entries, onClose: vi.fn(), onSaved: vi.fn(), onRemove: vi.fn() };
    const view = render(<StrictMode><OrganizeSheet {...props} /></StrictMode>);
    await screen.findByText('Resultado incierto');
    expect(addItem).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Destino del lote' })).toBeDisabled();
    auth.userId = 'user-2';
    view.rerender(<StrictMode><OrganizeSheet {...props} /></StrictMode>);
    await screen.findByText('Intento de otra cuenta');
    expect(screen.queryByRole('button', { name: 'Verificar este intento' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar listas/ })).toBeDisabled();
    expect(addItem).not.toHaveBeenCalled();
  });

  it('un destino que ya no figura en la cuenta no habilita nuevas altas', async () => {
    const draft = createSessionDraft([entry()]);
    draft.ownerUserId = 'user-1'; draft.selectedCollectionId = 'gone'; draft.destinationConfirmed = true;
    draft.allocations = draft.allocations.map((allocation) => ({ ...allocation, variant: 'normal', variantReviewed: true, condition: 'NM', conditionReviewed: true, reviewed: true }));
    writeSessionDraft(draft);
    mount();
    await screen.findAllByText('Carta 1');
    expect(screen.getByRole('button', { name: /Guardar listas/ })).toBeDisabled();
    expect(addItem).not.toHaveBeenCalled();
  });

  it('storage lleno mantiene el intento en memoria y no manda POST sin clave persistida', async () => {
    mount();
    await screen.findAllByText('Carta 1');
    await completeRow();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    fireEvent.click(screen.getByRole('button', { name: /Guardar listas/ }));
    await screen.findByText('El borrador dura mientras esta pantalla siga abierta');
    expect(addItem).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Guardar listas/ })).toBeDisabled();
    write.mockRestore();
  });

  it('corrección manual fuera top8 reemplaza el mismo runId, conserva cantidad y no agrega una captura', async () => {
    const scan = entry(10);
    const draft = createSessionDraft([scan]);
    draft.allocations[0]!.quantity = 3;
    writeSessionDraft(draft);
    const onCorrect = vi.fn();
    const props = { open: true, entries: [scan], onClose: vi.fn(), onSaved: vi.fn(), onRemove: vi.fn(), onCorrect };
    const view = render(<OrganizeSheet {...props} />);
    await screen.findAllByText('Carta 10');
    fireEvent.click(screen.getByRole('button', { name: 'Buscar carta a mano' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar carta' }), { target: { value: 'Carta corregida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en el catálogo' }));
    const choice = await screen.findByRole('button', { name: /Carta 99/ });
    fireEvent.click(choice);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reemplazo de lectura 10' }));
    expect(onCorrect).toHaveBeenCalledWith(10, expect.objectContaining({ id: 'outside-top-eight' }));
    view.rerender(<OrganizeSheet {...props} entries={[{ ...scan, candidate: { ...scan.candidate, card: entry(99, 'outside-top-eight').candidate.card } }]} />);
    await screen.findAllByText('Carta 99');
    const stored = JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}');
    expect(stored.allocations).toHaveLength(1);
    expect(stored.allocations[0]).toMatchObject({ runId: 10, cardId: 'outside-top-eight', quantity: 3, variant: null, condition: null });
    expect(addItem).not.toHaveBeenCalled();
  });

  it('selector de separar permite mover subconjunto con el mismo runId y atributos explícitos', async () => {
    const scan = entry(7);
    const draft = createSessionDraft([scan]);
    draft.allocations[0]!.quantity = 3;
    writeSessionDraft(draft);
    mount([scan]);
    await screen.findAllByText('Carta 7');
    fireEvent.click(screen.getByRole('button', { name: 'Separar copias / aplicar a varias' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar lectura 7, parte de 3 copias' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Copias a mover de lectura 7' }), { target: { value: '1' } });
    await select('Variante de la selección', 'Reversa holofoil');
    await select('Condición de la selección', 'MP');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar selección' }));
    await screen.findAllByText('Carta 7');
    const stored = JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}');
    expect(stored.allocations).toHaveLength(2);
    expect(stored.allocations.map((allocation: { runId: number; quantity: number }) => allocation.runId)).toEqual([7, 7]);
    expect(stored.allocations.map((allocation: { quantity: number }) => allocation.quantity)).toEqual([2, 1]);
    expect(stored.allocations[1]).toMatchObject({ variant: 'reverseHolofoil', condition: 'MP', reviewed: true });
  });

  it('precio singular de otra variante no sustituye una referencia exacta ausente', async () => {
    const scan = entry(1);
    const price = { cardId: 'card-1', variant: 'normal' as const, low: null, mid: null, high: null, market: 123, currency: 'USD', provider: null, source: 'tcgplayer', fetchedAt: '2026-10-07' };
    scan.candidate.price = price; scan.candidate.prices = [price];
    getCardPrices.mockResolvedValue({ prices: [price] });
    mount([scan]);
    await screen.findAllByText('Carta 1');
    await completeRow();
    expect(screen.getByText('Sin precio para esta variante')).toBeInTheDocument();
    expect(screen.getByText(/0 de 1 copias con referencia/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar listas/ })).toBeEnabled();
  });


  it('market0 cuenta como referencia y la condición no aplica ajustes al precio', async () => {
    const scan = entry(1);
    const price = { cardId: 'card-1', variant: 'holofoil' as const, low: null, mid: null, high: null, market: 0, currency: 'USD', provider: null, source: 'tcgplayer', fetchedAt: '2026-10-07' };
    scan.candidate.prices = [price];
    getCardPrices.mockResolvedValue({ prices: [price] });
    mount([scan]);
    await screen.findAllByText('Carta 1');
    await completeRow();
    await waitFor(() => expect(screen.getByText(/1 de 1 copias con referencia/)).toBeInTheDocument());
    await select('Condición', 'LP');
    expect(screen.getByText(/1 de 1 copias con referencia/)).toBeInTheDocument();
    expect(screen.getByText(/La condición no modifica el precio/)).toBeInTheDocument();
    expect(screen.queryByText('Sin precio para esta variante')).not.toBeInTheDocument();
  });


  it('restore canónico mantiene referencias exactas y cobertura del footer sin pedir otros precios', async () => {
    const variants = ['normal', 'holofoil', 'reverseHolofoil', 'normal', 'normal'] as const;
    const scans = [entry(1, 'A'), entry(2, 'A'), entry(3, 'A'), entry(4, 'G'), entry(5, 'F')];
    const prices = (cardId: string) => (cardId === 'A'
      ? [{ variant: 'normal' as const, market: 10 }, { variant: 'holofoil' as const, market: 100 }, { variant: 'reverseHolofoil' as const, market: 5 }]
      : [{ variant: 'normal' as const, market: cardId === 'G' ? 0 : null }]).map((price) => ({ ...price, cardId, low: null, mid: null, high: null, currency: 'USD', provider: 'tcgdex', source: 'tcgplayer', fetchedAt: '2026-10-07T12:00:00Z' }));
    scans.forEach((scan) => { scan.candidate.prices = prices(scan.candidate.card.id); });
    const draft = createSessionDraft(scans);
    draft.ownerUserId = 'user-1'; draft.selectedCollectionId = 'collection-1'; draft.destinationConfirmed = true;
    draft.allocations = draft.allocations.map((allocation, index) => ({ ...allocation, variant: variants[index]!, variantReviewed: true, condition: 'HP', conditionReviewed: true, reviewed: true }));
    expect(writeSessionDraft(draft)).toBe(true);
    const mounted = mount(readSession());
    await screen.findAllByText('Carta 1');
    expect(screen.getByText(/4 de 5 copias con referencia/)).toBeInTheDocument();
    expect(screen.getByText(/Valor conocido por variante:/)).toHaveTextContent(formatPrice(115, 'USD'));
    for (const [index, market] of [10, 100, 5, 0].entries()) {
      const row = screen.getAllByRole('spinbutton', { name: 'Copias de esta lectura' })[index]!.closest('li')!;
      expect(within(row).getByText(formatPrice(market, 'USD'))).toBeInTheDocument();
    }
    expect(screen.getAllByText('Sin precio para esta variante')).toHaveLength(1);
    expect(getCardPrices).not.toHaveBeenCalled();
    expect(addItem).not.toHaveBeenCalled();
    mounted.view.unmount();
    mount(readSession());
    await screen.findAllByText('Carta 1');
    expect(screen.getByText(/4 de 5 copias con referencia/)).toBeInTheDocument();
    expect(screen.getByText(/Valor conocido por variante:/)).toHaveTextContent(formatPrice(115, 'USD'));
  });

  it('fixture UX20 guarda15/errorseguro3/incierto3 y conserva2 incompletas + parte run7', async () => {
    const { draft } = uxTwentyDraft();
    writeSessionDraft(draft);
    addItem.mockImplementation(async (_id, payload) => {
      if (payload.cardId === 'B' && payload.variant === 'reverseHolofoil') throw new ApiError(400, 'Corregí estos atributos.');
      if (payload.cardId === 'F') throw new TypeError('Respuesta perdida después de guardar.');
      return { id: `item-${payload.cardId}`, card: { id: payload.cardId }, quantity: 999 };
    });
    const { onSaved } = mount(draft.entries);
    await screen.findByText('Guardaremos 21 copias; 2 quedan pendientes.');
    fireEvent.click(screen.getByRole('button', { name: /Guardar listas/ }));
    await screen.findByText('Guardaremos 3 copias; 5 quedan pendientes.');
    const stored = JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}');
    const copies = (status: string) => stored.operations.filter((operation: { status: string }) => operation.status === status).reduce((sum: number, operation: { payload: { quantity: number } }) => sum + operation.payload.quantity, 0);
    expect(copies('confirmed')).toBe(15); expect(copies('rejected')).toBe(3); expect(copies('uncertain')).toBe(3);
    expect(stored.allocations.filter((allocation: { runId: number }) => allocation.runId === 7)).toHaveLength(1);
    expect(onSaved.mock.calls.flatMap((call) => call[0] ?? [])).not.toContain(7);
    expect(screen.getByText('No se guardó esta parte')).toBeInTheDocument();
    expect(screen.getByText('Resultado incierto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar este intento' })).toBeInTheDocument();
    expect(addItem.mock.calls.reduce((sum, call) => sum + (call[1].quantity ?? 0), 0)).toBe(21);
  });

  it('falla persistencia después del commit: mantiene intento saving recuperable con el mismo UUID', async () => {
    const { view, onSaved } = mount();
    await screen.findAllByText('Carta 1');
    await completeRow();
    const originalWrite = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
      const snapshot = JSON.parse(value);
      if (key === 'pcs.scanDraft' && snapshot.operations?.some((operation: { status: string }) => operation.status === 'confirmed' || operation.status === 'uncertain')) throw new DOMException('full', 'QuotaExceededError');
      originalWrite.call(this, key, value);
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar listas/ }));
    await screen.findByText('Resultado incierto');
    expect(onSaved).not.toHaveBeenCalled();
    const original = addItem.mock.calls[0];
    expect(JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}').operations[0].status).toBe('saving');
    view.unmount(); write.mockRestore();
    mount();
    await screen.findByText('Resultado incierto');
    expect(addItem).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar este intento' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(2));
    expect(addItem.mock.calls[1]).toEqual(original);
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}').operations[0].status).toBe('confirmed'));
  });

  it('no continúa el lote después de cambiar de cuenta mientras responde el primer grupo', async () => {
    const { draft } = uxTwentyDraft(); writeSessionDraft(draft);
    let resolve: (value: unknown) => void = () => undefined;
    addItem.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const props = { open: true, entries: draft.entries, onClose: vi.fn(), onSaved: vi.fn(), onRemove: vi.fn() };
    const view = render(<OrganizeSheet {...props} />);
    await screen.findByText('Guardaremos 21 copias; 2 quedan pendientes.');
    fireEvent.click(screen.getByRole('button', { name: /Guardar listas/ }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    auth.userId = 'user-2'; view.rerender(<OrganizeSheet {...props} />);
    resolve({ id: 'item-A', card: { id: 'A' }, quantity: 2 });
    await waitFor(() => expect(screen.getByRole('button', { name: /Guardar listas/ })).toBeDisabled());
    expect(addItem).toHaveBeenCalledTimes(1);
  });

  it('editar a3 y separar muestra2+1, no conserva un input viejo de3 ni op rejected inválida', async () => {
    mount(); await screen.findAllByText('Carta 1'); await completeRow();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Copias de esta lectura' }), { target: { value: '3' } });
    addItem.mockRejectedValueOnce(new ApiError(400, 'Sin escritura.'));
    fireEvent.click(screen.getByRole('button', { name: /Guardar listas/ }));
    await screen.findByText('No se guardó esta parte');
    fireEvent.click(screen.getByRole('button', { name: 'Separar una copia' }));
    expect(screen.getAllByRole('spinbutton', { name: 'Copias de esta lectura' }).map((input) => Number((input as HTMLInputElement).value)).sort()).toEqual([1, 2]);
    expect(JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}').operations).toEqual([]);
  });

});
