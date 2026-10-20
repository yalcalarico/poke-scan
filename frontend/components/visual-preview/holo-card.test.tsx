// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoloCard } from './holo-card';

let reduced = false;
let preferenceChanged: (() => void) | undefined;
let intersectionChanged: IntersectionObserverCallback | undefined;
const disconnect = vi.fn();
const removePreferenceListener = vi.fn();
function pointer(target: Element, type: string, props: Record<string, number | string | boolean>) {
  const event = new Event(type, { bubbles: true });
  Object.entries(props).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  fireEvent(target, event);
}
beforeEach(() => {
  reduced = false; preferenceChanged = undefined; intersectionChanged = undefined;
  vi.clearAllMocks(); vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 1));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_: string, listener: () => void) => { preferenceChanged = listener; }, removeEventListener: removePreferenceListener }));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersectionChanged = callback; }
    observe() {} disconnect = disconnect;
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const view = render(<HoloCard><div>Arte SSR</div></HoloCard>);
  const node = view.container.firstElementChild as HTMLDivElement;
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 200, height: 280, right: 200, bottom: 280, toJSON: () => ({}) });
  return { ...view, node };
}
const flush = () => act(() => { vi.runAllTimers(); });
describe('HoloCard', () => {
  it('limita el tilt a 14 grados y entrega un gesto vertical al scroll', () => {
    const { node } = setup();
    pointer(node, 'pointermove', { pointerType: 'mouse', clientX: 600, clientY: -200 }); flush();
    expect(node.style.getPropertyValue('--ry')).toBe('14deg');
    expect(node.style.getPropertyValue('--rx')).toBe('14deg');
    pointer(node, 'pointerdown', { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 });
    pointer(node, 'pointermove', { pointerType: 'touch', pointerId: 1, clientX: 12, clientY: 80 }); flush();
    expect(node.hasAttribute('data-active')).toBe(false);
  });
  it('cancela frames pendientes al reducir movimiento y desconecta listeners al desmontar', () => {
    const { node, unmount } = setup();
    pointer(node, 'pointermove', { pointerType: 'mouse', clientX: 200, clientY: 0 });
    reduced = true; act(() => preferenceChanged?.()); flush();
    expect(node.dataset.paused).toBe('true');
    expect(node.style.getPropertyValue('--ry')).toBe('');
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removePreferenceListener).toHaveBeenCalledWith('change', preferenceChanged);
  });
  it('pausa el movimiento fuera de pantalla y puede reanudarlo al volver', () => {
    const { node } = setup();
    const notify = (isIntersecting: boolean) => act(() => intersectionChanged?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));
    notify(false);
    pointer(node, 'pointermove', { pointerType: 'mouse', clientX: 200, clientY: 0 }); flush();
    expect(node.dataset.paused).toBe('true'); expect(node.hasAttribute('data-active')).toBe(false);
    notify(true);
    pointer(node, 'pointermove', { pointerType: 'mouse', clientX: 200, clientY: 0 }); flush();
    expect(node.dataset.paused).toBe('false'); expect(node.dataset.active).toBe('true');
  });
});
