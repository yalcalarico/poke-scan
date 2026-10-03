// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, refreshSession } from './api-client';
import { clearTokens, getAccessToken, hasSession, setTokens } from './token-storage';

describe('sesión del cliente', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); clearTokens(); });
  afterEach(() => { vi.unstubAllGlobals(); clearTokens(); });
  it('mantiene el access token en memoria y elimina credenciales antiguas', () => {
    localStorage.setItem('pcs.refreshToken', 'legacy-refresh-secret');
    sessionStorage.setItem('pcs.accessToken', 'legacy-access-secret');
    setTokens('short-lived-token');
    expect(getAccessToken()).toBe('short-lived-token');
    expect(localStorage.getItem('pcs.refreshToken')).toBeNull();
    expect(sessionStorage.getItem('pcs.accessToken')).toBeNull();
    expect(hasSession()).toBe(true);
    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(hasSession()).toBe(false);
  });
  it('envía credenciales y el header CSRF, sin refresh token en el body', async () => {
    setTokens('old-token');
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ accessToken: 'new-token', user: {} })));
    vi.stubGlobal('fetch', fetch);
    const [first, second] = await Promise.all([refreshSession(), refreshSession()]);
    expect(first).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({ credentials: 'include', body: '{}',
        headers: { 'Content-Type': 'application/json', 'X-Session-Request': '1' } }),
    ]);
    expect(getAccessToken()).toBe('new-token');
  });
  it('recupera una sesión tras recargar sin token en storage y reintenta el 401 una vez', async () => {
    localStorage.setItem('pcs.hasSession', 'true');
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'renewed', user: {} })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user' })));
    vi.stubGlobal('fetch', fetch);
    expect(await apiFetch('/users/me')).toEqual({ id: 'user' });
    expect(fetch).toHaveBeenCalledTimes(3);
    const init = fetch.mock.calls[2]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer renewed');
  });
  it('logout manda el header de seguridad y cookies', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{"success":true}'));
    vi.stubGlobal('fetch', fetch);
    await apiFetch('/auth/logout', { method: 'POST', body: {}, skipAuth: true });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('X-Session-Request')).toBe('1');
  });
});
