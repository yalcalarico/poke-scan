import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import { RECOVERY_CAPTURE_SCRIPT } from './recovery-capture-script';
import { getRecoverySnapshot } from './recovery-view';

function createCapture(href: string, initialState: Record<string, unknown> = {}, failReplace = false) {
  const listeners = new Map<string, ((event?: { persisted?: boolean; newURL?: string }) => void)[]>();
  const location = {
    href,
    get origin() { return new URL(this.href).origin; },
    get pathname() { return new URL(this.href).pathname; },
    get search() { return new URL(this.href).search; },
    get hash() { return new URL(this.href).hash; },
  };
  const history = {
    state: initialState as Record<string, unknown> | null,
    pushState(state: unknown, _unused: string, url?: string | URL | null) {
      this.state = state as Record<string, unknown>;
      if (url) location.href = new URL(String(url), location.href).href;
    },
    replaceState(state: unknown, _unused: string, url?: string | URL | null) {
      if (failReplace) throw new Error('blocked');
      this.state = state as Record<string, unknown>;
      if (url) location.href = new URL(String(url), location.href).href;
    },
  };
  const window = {
    __pcsRecoveryManager: undefined as undefined | { snapshot: () => { mode: string; token: string | null }; startRequest: () => void; inspectEntry: () => void; discardLink: () => void },
    addEventListener(type: string, callback: (event?: { persisted?: boolean; newURL?: string }) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), callback]);
    },
    dispatchEvent() { return true; },
  };
  runInNewContext(RECOVERY_CAPTURE_SCRIPT, { window, history, location, URL, Event, Object });
  return { window, history, location, listeners };
}

const token = 'A'.repeat(43);

describe('captura del enlace de recuperación', () => {
  it('sin controlador falla cerrado ante fragmento y usa sólo marcador sin secreto', () => {
    try {
      vi.stubGlobal('window', { location: { hash: '#token=' }, history: { state: {} } });
      expect(getRecoverySnapshot().mode).toBe('blocked');
      vi.stubGlobal('window', { location: { hash: '' }, history: { state: { pcsRecoveryView: 'link' } } });
      expect(getRecoverySnapshot().mode).toBe('unavailable');
      vi.stubGlobal('window', { location: { hash: '' }, history: { state: {} } });
      expect(getRecoverySnapshot().mode).toBe('request');
    } finally { vi.unstubAllGlobals(); }
  });
  it('quita el fragmento válido, preserva history.state y conserva el token solo en memoria', () => {
    const env = createCapture(`https://pokescan.app/recuperar?src=mail#token=${token}`, { next: '/buscar' });
    expect(env.location.hash).toBe('');
    expect(env.history.state).toEqual({ next: '/buscar', pcsRecoveryView: 'link' });
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'link', token });
  });

  it('trata cualquier fragmento con formato adicional como inválido y lo elimina', () => {
    const env = createCapture(`https://pokescan.app/recuperar#token=${token}&x=1`);
    expect(env.location.hash).toBe('');
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'invalid', token: null });
  });

  it('falla cerrado si replaceState no puede quitar el fragmento', () => {
    const env = createCapture(`https://pokescan.app/recuperar#token=${token}`, {}, true);
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'blocked', token: null });
  });

  it('detecta entradas cliente y vuelve no disponible al regresar sin el token en memoria', () => {
    const env = createCapture('https://pokescan.app/login');
    env.history.pushState({}, '', `/recuperar#token=${token}`);
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'link', token });
    const savedState = env.history.state;
    env.history.pushState({}, '', '/login');
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'request', token: null });
    env.history.state = savedState;
    env.location.href = 'https://pokescan.app/recuperar';
    for (const callback of env.listeners.get('popstate') ?? []) callback();
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'unavailable', token: null });
  });

  it('preserva el marcador en replaceState interno y elimina el secreto al pedir un enlace nuevo', () => {
    const env = createCapture(`https://pokescan.app/recuperar#token=${token}`);
    env.history.replaceState({ __next: true }, '', '/recuperar');
    expect(env.history.state).toEqual({ __next: true, pcsRecoveryView: 'link' });
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'link', token });
    env.window.__pcsRecoveryManager?.startRequest();
    expect(env.history.state).toEqual({ __next: true, pcsRecoveryView: 'request' });
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'request', token: null });
  });

  it('un push bare de la misma ruta pierde el secreto de la entrada anterior', () => {
    const env = createCapture(`https://pokescan.app/recuperar#token=${token}`);
    env.window.__pcsRecoveryManager?.inspectEntry();
    env.window.__pcsRecoveryManager?.inspectEntry();
    expect(env.window.__pcsRecoveryManager?.snapshot().token === token).toBe(true);
    env.history.pushState(env.history.state, '', '/recuperar');
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'request', token: null });
  });

  it.each(['#token=', '#token=short', '#token=' + token + '&token=' + token])('fragmento malformado queda inválido sin secreto', (fragment) => {
    const env = createCapture('https://pokescan.app/recuperar' + fragment);
    expect(env.location.hash).toBe('');
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'invalid', token: null });
  });

  it.each(['#token=' + token, '#token='])('preserva la captura tras popstate y hashchange obsoleto de la misma navegación', (fragment) => {
    const env = createCapture('https://pokescan.app/recuperar');
    const navigatedHref = 'https://pokescan.app/recuperar' + fragment;
    env.location.href = navigatedHref;
    for (const callback of env.listeners.get('popstate') ?? []) callback();
    expect(env.location.hash).toBe('');
    const captured = env.window.__pcsRecoveryManager?.snapshot();
    for (const callback of env.listeners.get('hashchange') ?? []) callback({ newURL: navigatedHref });
    expect(env.window.__pcsRecoveryManager?.snapshot()).toEqual(captured);
    expect(captured?.mode).toBe(fragment === '#token=' ? 'invalid' : 'link');
    env.window.__pcsRecoveryManager?.inspectEntry();
    env.window.__pcsRecoveryManager?.inspectEntry();
    expect(env.window.__pcsRecoveryManager?.snapshot()).toEqual(captured);
  });

  it('un hashchange vigente captura el enlace y su remoción deliberada lo descarta', () => {
    const env = createCapture('https://pokescan.app/recuperar');
    env.location.href += '#token=' + token;
    for (const callback of env.listeners.get('hashchange') ?? []) callback({ newURL: env.location.href });
    expect(env.window.__pcsRecoveryManager?.snapshot().mode).toBe('link');
    for (const callback of env.listeners.get('hashchange') ?? []) callback({ newURL: env.location.href });
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'unavailable', token: null });
  });

  it('borra el token al pagehide y cambia el marcador a enlace no disponible', () => {
    const env = createCapture(`https://pokescan.app/recuperar#token=${token}`);
    for (const callback of env.listeners.get('pagehide') ?? []) callback();
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'unavailable', token: null });
    for (const callback of env.listeners.get('pageshow') ?? []) callback({ persisted: true });
    expect(env.window.__pcsRecoveryManager?.snapshot()).toMatchObject({ mode: 'unavailable', token: null });
  });
});
