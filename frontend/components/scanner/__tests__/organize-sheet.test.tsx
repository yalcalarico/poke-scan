// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import type { AddItemPayload } from '@/lib/api/collections';
import type { CollectionDto } from '@/types/api';

import { OrganizeSheet } from '../organize-sheet';
import type { SessionEntry } from '../types';

const { addItem, listCollections, success } = vi.hoisted(() => ({
  addItem: vi.fn<(id: string, payload: AddItemPayload) => Promise<unknown>>(),
  listCollections: vi.fn<() => Promise<CollectionDto[]>>(),
  success: vi.fn(),
}));
vi.mock('@/lib/api/collections', () => ({ addItem, listCollections }));
vi.mock('@/components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui')>()),
  useToast: () => ({ success }),
}));
vi.mock('../card-thumb', () => ({ CardThumb: () => null }));

function collection(id: string, isDefault = false): CollectionDto {
  return {
    id, userId: 'qa', name: id, isDefault,
    itemCount: 0, uniqueCount: 0, duplicateCount: 0,
    totalValueUsd: 0, totalValueArs: null, cover: [], createdAt: '2026-10-01',
  };
}
function entry(runId: number): SessionEntry {
  return {
    runId,
    candidate: {
      card: {
        id: `card-${runId}`, name: `Carta ${runId}`, setId: 'test', number: String(runId),
        supertype: 'pokemon', subtypes: [], hp: null, types: [], rarity: null,
        artist: null, imageSmall: '', imageLarge: '',
      },
      score: 1, rawScore: 1, price: null,
    },
  };
}
function mount(entries = [entry(1)]) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(<OrganizeSheet open entries={entries} onClose={onClose} onSaved={onSaved} onRemove={vi.fn()} />);
  return { onSaved, onClose };
}
async function ready() {
  return screen.findAllByRole('spinbutton', { name: 'Cantidad' });
}
function deferred() {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  listCollections.mockResolvedValue([collection('default', true), collection('otra')]);
  addItem.mockResolvedValue({});
});

describe('Organizar: edición y confirmación', () => {
  it('sin colecciones ofrece crearlas y no permite enviar un lote sin destino', async () => {
    listCollections.mockResolvedValue([]);
    const { onSaved } = mount();
    expect(await screen.findByRole('link', { name: 'Ir a colecciones' })).toHaveAttribute('href', '/colecciones');
    const save = screen.getByRole('button', { name: 'Agregar todas (1)' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(addItem).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('no pide colecciones privadas mientras la hoja está cerrada', async () => {
    const { rerender } = render(<OrganizeSheet open={false} entries={[entry(1)]} onClose={vi.fn()} onSaved={vi.fn()} onRemove={vi.fn()} />);
    await act(async () => undefined);
    expect(listCollections).not.toHaveBeenCalled();
    rerender(<OrganizeSheet open entries={[entry(1)]} onClose={vi.fn()} onSaved={vi.fn()} onRemove={vi.fn()} />);
    await ready();
    expect(listCollections).toHaveBeenCalledTimes(1);
  });

  it('guarda la cantidad elegida y retira la captura de la sesión', async () => {
    const { onSaved } = mount();
    const [quantity] = await ready();
    fireEvent.change(quantity, { target: { value: '3' } });
    expect(quantity).toHaveValue(3);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([1]));
    expect(addItem).toHaveBeenCalledWith('default', { cardId: 'card-1', quantity: 3 });
    expect(screen.getByRole('button', { name: 'Guardada' })).toBeDisabled();
  });

  it('permite cambiar la colección derivada por defecto', async () => {
    const user = userEvent.setup();
    mount();
    await ready();
    await user.click(screen.getByRole('combobox', { name: 'Colección' }));
    await user.click(screen.getByRole('option', { name: /otra/ }));
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledWith('otra', { cardId: 'card-1', quantity: 1 }));
  });

  it('el éxito al sumar un duplicado retira la captura', async () => {
    addItem.mockResolvedValue({ quantity: 2 });
    const { onSaved } = mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([1]));
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Sumada a una copia que ya tenías.')).toBeInTheDocument();
  });

  it('un 409 no declara éxito ni retira la captura', async () => {
    addItem.mockRejectedValue(new ApiError(409, 'Conflicto al guardar.'));
    const { onSaved } = mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('Conflicto al guardar.')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('una falla mantiene la captura, muestra el motivo y permite reintentar', async () => {
    addItem.mockRejectedValueOnce(new ApiError(503, 'Servicio temporalmente caído.'));
    const { onSaved } = mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('Servicio temporalmente caído.')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([1]));
  });
});

describe('Organizar: lotes y concurrencia', () => {
  it('confirma todas las filas aunque sus respuestas lleguen en distinto orden', async () => {
    const first = deferred();
    const second = deferred();
    addItem.mockImplementation((_id, payload) => payload.cardId === 'card-1' ? first.promise : second.promise);
    const { onSaved, onClose } = mount([entry(1), entry(2)]);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar todas (2)' }));
    expect(addItem).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve({}));
    expect(onSaved).not.toHaveBeenCalled();
    await act(async () => first.resolve({}));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([1, 2]));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('retira sólo las filas exitosas en un lote con fallas', async () => {
    addItem.mockImplementation((_id, payload) => payload.cardId === 'card-1'
      ? Promise.resolve({}) : Promise.reject(new ApiError(503, 'Carta pendiente.')));
    const { onSaved, onClose } = mount([entry(1), entry(2)]);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar todas (2)' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([1]));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Carta pendiente.')).toBeInTheDocument();
  });

  it('dos clicks no duplican el POST y los campos quedan bloqueados durante el guardado', async () => {
    const pending = deferred();
    addItem.mockReturnValue(pending.promise);
    mount();
    const [quantity] = await ready();
    const button = screen.getByRole('button', { name: 'Agregar' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(quantity).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Colección' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sacar Carta 1 de la sesión' })).toBeDisabled();
    await act(async () => pending.resolve({}));
  });
});
