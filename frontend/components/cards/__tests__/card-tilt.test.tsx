// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CardTilt } from '../card-tilt';

let reduced = false;
let preferenceChanged: (() => void) | undefined;

function pointer(target: Element, type: string, values: Record<string, number | string | boolean>) {
  const event = new Event(type, { bubbles: true });
  Object.entries(values).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  fireEvent(target, event);
}

function stage(variant: 'detail' | 'catalog' = 'detail') {
  const { container } = render(<CardTilt variant={variant}><img src="/card.png" alt="Carta de prueba" /></CardTilt>);
  const root = container.firstElementChild as HTMLDivElement;
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 200, height: 280, right: 200, bottom: 280, toJSON: () => ({}) });
  Object.defineProperty(root, 'clientWidth', { value: 200 });
  return root;
}

beforeEach(() => {
  reduced = false;
  preferenceChanged = undefined;
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 1));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced; },
    addEventListener: (_: string, callback: () => void) => { preferenceChanged = callback; },
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const flush = () => act(() => { vi.runAllTimers(); });

describe('CardTilt', () => {
  it('conserva la imagen y limita el catálogo a tres grados, con reset al salir', () => {
    const root = stage('catalog');
    expect(screen.getByRole('img', { name: 'Carta de prueba' })).toBeInTheDocument();
    pointer(root, 'pointermove', { pointerType: 'mouse', clientX: 600, clientY: 0 });
    flush();
    expect(root.style.getPropertyValue('--tilt-y')).toBe('3deg');
    expect(root.style.getPropertyValue('--tilt-x')).toBe('3deg');
    pointer(root, 'pointerleave', {});
    expect(root.hasAttribute('data-active')).toBe(false);
    expect(root.style.getPropertyValue('--tilt-y')).toBe('');
  });

  it('permite arrastre horizontal y limpia al cancelar, sin apropiarse del scroll vertical', () => {
    const root = stage();
    const touch = { pointerType: 'touch', pointerId: 1, isPrimary: true };
    pointer(root, 'pointerdown', { ...touch, clientX: 100, clientY: 100 });
    pointer(root, 'pointermove', { ...touch, clientX: 200, clientY: 102 });
    flush();
    expect(root.style.getPropertyValue('--tilt-y')).toBe('8deg');
    pointer(root, 'pointercancel', touch);
    expect(root.hasAttribute('data-active')).toBe(false);
    pointer(root, 'pointerdown', { ...touch, clientX: 100, clientY: 100 });
    pointer(root, 'pointermove', { ...touch, clientX: 102, clientY: 150 });
    pointer(root, 'pointermove', { ...touch, clientX: 200, clientY: 150 });
    flush();
    expect(root.hasAttribute('data-active')).toBe(false);
  });

  it('desactiva interacción al cambiar movimiento reducido y descarta frames pendientes', () => {
    const root = stage();
    pointer(root, 'pointermove', { pointerType: 'mouse', clientX: 200, clientY: 0 });
    reduced = true;
    act(() => preferenceChanged?.());
    flush();
    expect(root.hasAttribute('data-active')).toBe(false);
    pointer(root, 'pointermove', { pointerType: 'mouse', clientX: 200, clientY: 0 });
    flush();
    expect(root.style.getPropertyValue('--tilt-y')).toBe('');
    reduced = false;
    act(() => preferenceChanged?.());
    pointer(root, 'pointermove', { pointerType: 'mouse', clientX: 200, clientY: 0 });
    flush();
    expect(root.style.getPropertyValue('--tilt-y')).toBe('8deg');
    pointer(root, 'pointerup', {});
    expect(root.hasAttribute('data-active')).toBe(false);
  });

  it('ignora touch en catálogo y movimiento cuando la preferencia ya está activa', () => {
    reduced = true;
    const root = stage('catalog');
    pointer(root, 'pointermove', { pointerType: 'mouse', clientX: 200, clientY: 0 });
    flush();
    expect(root.hasAttribute('data-active')).toBe(false);
    reduced = false;
    act(() => preferenceChanged?.());
    pointer(root, 'pointerdown', { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 0, clientY: 0 });
    pointer(root, 'pointermove', { pointerType: 'touch', pointerId: 1, clientX: 200, clientY: 0 });
    flush();
    expect(root.hasAttribute('data-active')).toBe(false);
  });
});
