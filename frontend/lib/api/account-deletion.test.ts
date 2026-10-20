import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('API de eliminación de cuenta', () => {
  it('acepta únicamente la respuesta exacta de disponibilidad y no cachea', async () => {
    vi.stubGlobal('window', {});
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"available":false}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { getAccountDeletionAvailability } = await import('./account-deletion');
    await expect(getAccountDeletionAvailability()).resolves.toEqual({ available: false });
    expect((fetchMock.mock.calls[0][1] as RequestInit).cache).toBe('no-store');
    fetchMock.mockResolvedValueOnce(new Response('{"available":false,"details":"internal"}', { status: 200 }));
    await expect(getAccountDeletionAvailability()).rejects.toMatchObject({ status: 503 });
  });

  it('envía una sola solicitud autenticada sin replay y valida status/código', async () => {
    vi.stubGlobal('window', {});
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"code":"ACCOUNT_DELETION_AUTH_INVALID"}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { setTokens } = await import('./token-storage'); setTokens('synthetic-token');
    const { deleteOwnAccount } = await import('./account-deletion');
    await expect(deleteOwnAccount({ password: 'synthetic-password', confirmation: 'ELIMINAR' }, () => true))
      .rejects.toMatchObject({ status: 401, code: 'ACCOUNT_DELETION_AUTH_INVALID' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/account-deletions');
    expect(init.redirect).toBe('error'); expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('X-Session-Request')).toBe('1');
  });

  it('rechaza errores con status/código discordantes y retry-after inseguro', async () => {
    vi.stubGlobal('window', {});
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"code":"ACCOUNT_DELETION_AUTH_INVALID"}', {
      status: 429, headers: { 'Retry-After': '999999999999999999999' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { setTokens } = await import('./token-storage'); setTokens('synthetic-token');
    const { deleteOwnAccount } = await import('./account-deletion');
    await expect(deleteOwnAccount({ password: 'synthetic-password', confirmation: 'ELIMINAR' }, () => true))
      .rejects.toMatchObject({ status: 429, code: undefined, safeRetryAfter: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('solo confirma el éxito exacto y ejecuta limpieza dentro de la cola', async () => {
    vi.stubGlobal('window', {});
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { setTokens, clearTokens, getAccessToken, getSessionEpoch } = await import('./token-storage'); setTokens('synthetic-token');
    const { deleteOwnAccount } = await import('./account-deletion');
    let clearedInsideQueue = false;
    await expect(deleteOwnAccount({ password: 'synthetic-password', confirmation: 'ELIMINAR' }, (epoch) => {
      clearedInsideQueue = true; expect(epoch).toBe(getSessionEpoch());
      return clearTokens(epoch);
    })).resolves.toEqual({ success: true });
    expect(clearedInsideQueue).toBe(true); expect(getAccessToken()).toBeNull();
    setTokens('synthetic-second-session');
    fetchMock.mockResolvedValueOnce(new Response('{"success":true,"extra":true}', { status: 200 }));
    await expect(deleteOwnAccount({ password: 'synthetic-password', confirmation: 'ELIMINAR' }, () => true))
      .rejects.toMatchObject({ status: 503 });
  });

  it('una época distinta al entrar en la cola no envía la baja a otra sesión', async () => {
    vi.stubGlobal('window', {});
    let release!: () => void; let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, operation) => new Promise((resolve) => { release = () => resolve(operation()); started(); })) } });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const { setTokens, clearTokens, getSessionEpoch } = await import('./token-storage'); setTokens('synthetic-old');
    const { deleteOwnAccount } = await import('./account-deletion');
    const pending = deleteOwnAccount({ password: 'synthetic-password', confirmation: 'ELIMINAR' }, () => true);
    await entered;
    clearTokens(getSessionEpoch()); setTokens('synthetic-new'); release();
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
