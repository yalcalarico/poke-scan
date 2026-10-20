// @vitest-environment jsdom
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MotionGrid } from './effects';
import { VisualPreviewProvider } from './visual-preview';

vi.mock('next/navigation', () => ({ usePathname: () => '/buscar-v2', useSearchParams: () => new URLSearchParams() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('conserva la geometría por carta entre remonte, skeleton y resultados reordenados', async () => {
  let order = ['a', 'b'];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const x = order.indexOf(this.dataset.cardKey ?? '') * 120;
    return { x, y: 0, left: x, right: x + 100, top: 0, bottom: 140, width: 100, height: 140, toJSON: () => ({}) };
  });
  const cancel = vi.fn();
  const animate = vi.fn((frames: Keyframe[], options?: KeyframeAnimationOptions) => { void frames; void options; return { cancel }; });
  Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  const view = (run: number, cards: string[]) => <VisualPreviewProvider>
    <MotionGrid key={run}>{cards.map((id, index) => <div key={id} data-card-key={id} data-card-index={index}>{id}</div>)}</MotionGrid>
  </VisualPreviewProvider>;
  const { rerender, unmount } = render(view(1, order));
  expect(animate).not.toHaveBeenCalled();
  rerender(view(2, []));
  order = ['b', 'a'];
  rerender(view(2, order));
  await waitFor(() => expect(animate).toHaveBeenCalledTimes(2));
  expect(animate.mock.calls[0]?.[0]).toEqual([{ transform: 'translate(120px, 0px)' }, { transform: 'none' }]);
  const cell = document.querySelector('[data-card-key="b"]');
  if (!cell) throw new Error('Falta celda de prueba');
  cell.textContent = 'contador actualizado';
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(cancel).not.toHaveBeenCalled();
  unmount();
  expect(cancel).toHaveBeenCalled();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});
