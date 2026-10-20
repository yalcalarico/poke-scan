import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('fencing de sesiones', () => {
  it('un 401 tardío no renueva ni elimina una sesión más nueva', async () => {
    vi.stubGlobal('window', {});
    const { setTokens, getAccessToken } = await import('./token-storage');
    const { apiFetch } = await import('./api-client');
    setTokens('old-token');
    let respond: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = apiFetch('/private');
    setTokens('new-token');
    respond?.(new Response('{"message":"expired"}', { status: 401 }));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe('new-token');
  });

  it('una respuesta de refresh vieja no pisa tokens de un login posterior', async () => {
    vi.stubGlobal('window', {});
    const { setTokens, getAccessToken } = await import('./token-storage');
    const { refreshSession } = await import('./api-client');
    setTokens('old-token');
    let respond: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; })));
    const pending = refreshSession();
    setTokens('new-login-token');
    respond?.(new Response('{"accessToken":"stale-refresh-token"}', { status: 200 }));
    await expect(pending).resolves.toBeNull();
    expect(getAccessToken()).toBe('new-login-token');
  });

  it('un refresh nuevo no se une al vuelo anterior de otra generación', async () => {
    vi.stubGlobal('window', {});
    const { setTokens, getAccessToken } = await import('./token-storage');
    const { refreshSession } = await import('./api-client');
    setTokens('old-token');
    const responses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { responses.push(resolve); }));
    vi.stubGlobal('fetch', fetchMock);
    const oldRefresh = refreshSession();
    setTokens('new-login-token');
    const currentRefresh = refreshSession();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    responses[0](new Response('{"accessToken":"stale-refresh-token"}', { status: 200 }));
    responses[1](new Response('{"accessToken":"current-refresh-token"}', { status: 200 }));
    await expect(oldRefresh).resolves.toBeNull();
    await expect(currentRefresh).resolves.toMatchObject({ accessToken: 'current-refresh-token' });
    expect(getAccessToken()).toBe('current-refresh-token');
  });

  it('serializa logout y login para que la cookie tardía no llegue después del login', async () => {
    vi.stubGlobal('window', {});
    const { logout, login } = await import('./auth');
    const { getAccessToken } = await import('./token-storage');
    const responses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { responses.push(resolve); }));
    vi.stubGlobal('fetch', fetchMock);
    const logoutFlight = logout();
    const loginFlight = login('ash@example.com', 'pikachu88');
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    responses[0](new Response('{"success":true}', { status: 200 }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    responses[1](new Response(JSON.stringify({ accessToken: 'current-login-token', user: { id: 'u1' } }), { status: 200 }));
    await Promise.all([logoutFlight, loginFlight]);
    expect(getAccessToken()).toBe('current-login-token');
  });
});
