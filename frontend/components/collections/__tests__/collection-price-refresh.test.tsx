// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const refresh = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/collections', () => ({ refreshCollectionPrices: refresh }));
import { CollectionPriceRefresh } from '../collection-price-refresh';
beforeEach(() => { vi.useFakeTimers(); refresh.mockReset().mockResolvedValue({ queued: 1 }); });
afterEach(() => vi.useRealTimers());

it('sigue las actualizaciones locales de forma acotada y limpia los timers al salir', async () => {
  const onRefresh = vi.fn();
  const view = render(<CollectionPriceRefresh collectionIds={['a']} needsRefresh onRefresh={onRefresh} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(120_001); });
  expect(onRefresh).toHaveBeenCalledTimes(12);
  expect(refresh).not.toHaveBeenCalled();
  expect(screen.getByText(/Todavía hay referencias pendientes/)).toBeInTheDocument();
  view.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(onRefresh).toHaveBeenCalledTimes(12);
});

it('la acción explícita solicita cada colección una vez y actualiza el resumen', async () => {
  const onRefresh = vi.fn();
  render(<CollectionPriceRefresh collectionIds={['a', 'a', 'b']} needsRefresh={false} onRefresh={onRefresh} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Actualizar precios' })); });
  expect(refresh.mock.calls.map((args) => args[0])).toEqual(['a', 'b']);
  expect(onRefresh).toHaveBeenCalledOnce();
});

it('deja de consultar cuando la valoración ya es reciente', async () => {
  const onRefresh = vi.fn();
  const view = render(<CollectionPriceRefresh collectionIds={['a']} needsRefresh onRefresh={onRefresh} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  view.rerender(<CollectionPriceRefresh collectionIds={['a']} needsRefresh={false} onRefresh={onRefresh} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(onRefresh).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Actualizar precios' })).toBeEnabled();
});
