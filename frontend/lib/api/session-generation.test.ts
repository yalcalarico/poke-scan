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
    await vi.waitFor(() => expect(respond).toBeTypeOf('function'));
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
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    setTokens('new-login-token');
    const currentRefresh = refreshSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    responses[0](new Response('{"accessToken":"stale-refresh-token"}', { status: 200 }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
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

  it('refresh/reset/login comparten cola y limpieza ocurre antes de liberar el reset', async () => {
    vi.stubGlobal('window', {});
    const { setTokens, clearTokens, getSessionEpoch, getAccessToken } = await import('./token-storage');
    const { refreshSession } = await import('./api-client');
    const { recoverPassword, login } = await import('./auth'); setTokens('fixture-old');
    const responses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { responses.push(resolve); })); vi.stubGlobal('fetch', fetchMock);
    const refresh = refreshSession(); await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    let confirmed = false;
    const reset = recoverPassword('a'.repeat(43), 'fixture-password', () => { confirmed = true; clearTokens(getSessionEpoch()); });
    const nextLogin = login('fixture@example.invalid', 'fixture-password');
    await Promise.resolve(); expect(fetchMock).toHaveBeenCalledTimes(1);
    responses[0](new Response('{"accessToken":"fixture-refreshed"}'));
    await refresh; await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    responses[1](new Response('{"success":true}')); await reset;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(confirmed).toBe(true); expect(getAccessToken() === null).toBe(true);
    responses[2](new Response('{"accessToken":"fixture-new","user":{"id":"fixture"}}'));
    await nextLogin; expect(getAccessToken() === 'fixture-new').toBe(true);
  });

  it('refresh que espera Web Lock de otra generación no envía POST', async () => {
    vi.stubGlobal('window', {});
    let release!: () => void;
    const lock = vi.fn((_name, run) => new Promise((resolve) => { release = () => resolve(run()); }));
    vi.stubGlobal('navigator', { locks: { request: lock } });
    const { setTokens, clearTokens } = await import('./token-storage');
    const { refreshSession } = await import('./api-client'); setTokens('fixture-old');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const pending = refreshSession(); await vi.waitFor(() => expect(lock).toHaveBeenCalledTimes(1));
    clearTokens(); release(); await expect(pending).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled(); expect(lock.mock.calls[0][0]).toBe('pcs.session-mutation');
  });

  it.each(['clear', 'login'])('401 suspendido no hace replay ni redirect tras %s posterior al refresh', async (change) => {
    const assign = vi.fn(); vi.stubGlobal('window', { location: { pathname: '/recuperar', assign } });
    const { setTokens, clearTokens } = await import('./token-storage');
    const { refreshSession, apiFetch } = await import('./api-client'); setTokens('fixture-old');
    let respond!: (response: Response) => void;
    const fetchMock = vi.fn((url: string) => url.endsWith('/auth/refresh') ? new Promise<Response>((resolve) => { respond = resolve; }) :
      Promise.resolve(new Response('{"message":"expired"}', { status: 401 })));
    vi.stubGlobal('fetch', fetchMock);
    const refresh = refreshSession(); await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const changeAfter = refresh.then(() => { if (change === 'clear') clearTokens(); else setTokens('fixture-new'); });
    const oldRequest = apiFetch('/private').then(() => false, () => true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    respond(new Response('{"accessToken":"fixture-refreshed"}')); await changeAfter;
    expect(await oldRequest).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(2); expect(assign).not.toHaveBeenCalled();
  });
});
