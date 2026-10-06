// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SwipeScanRow } from '../swipe-scan-row';

it('un gesto horizontal revela eliminar, pero el scroll vertical conserva la carta', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  const onRemove = vi.fn();
  render(<ul><SwipeScanRow name="Pikachu" disabled={false} onRemove={onRemove}><p>Carta</p></SwipeScanRow></ul>);
  const row = screen.getByText('Carta');
  fireEvent.pointerDown(row, { clientX: 250, clientY: 100 });
  fireEvent.pointerUp(row, { clientX: 240, clientY: 200 });
  expect(screen.queryByRole('button', { name: 'Eliminar Pikachu' })).not.toBeInTheDocument();
  fireEvent.pointerDown(row, { clientX: 250, clientY: 100 });
  fireEvent.pointerUp(row, { clientX: 100, clientY: 110 });
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Pikachu' }));
  expect(onRemove).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

it('en tablet y PC el gesto no revela eliminar', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  render(<ul><SwipeScanRow name="Pikachu" disabled={false} onRemove={vi.fn()}><p>Carta</p></SwipeScanRow></ul>);
  const row = screen.getByText('Carta');
  fireEvent.pointerDown(row, { clientX: 250, clientY: 100 });
  fireEvent.pointerUp(row, { clientX: 100, clientY: 110 });
  expect(screen.queryByRole('button', { name: 'Eliminar Pikachu' })).not.toBeInTheDocument();
  vi.unstubAllGlobals();
});
