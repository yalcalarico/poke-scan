import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('API de recuperación', () => {
  it('envía una sola solicitud pública con cookie y header CSRF, sin bearer ni replay', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"code":"RECOVERY_UNAVAILABLE"}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { requestPasswordRecovery } = await import('./auth');
    await expect(requestPasswordRecovery('ash@example.com')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/password-recovery-requests');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('X-Session-Request')).toBe('1');
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });

  it('rechaza 200 para el endpoint de solicitud y no considera un body genérico como aceptación', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { requestPasswordRecovery } = await import('./auth');
    await expect(requestPasswordRecovery('ash@example.com')).rejects.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('solo acepta 200 con success:true al cambiar la contraseña', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { recoverPassword } = await import('./auth');
    await expect(recoverPassword('a'.repeat(43), 'pikachu88')).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allowlistea campos y Retry-After entero positivo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'INPUT_INVALID', fields: { email: 'Inválido', token: 'secreto', newPassword: 'Débil' },
    }), { status: 400, headers: { 'Retry-After': '03' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { requestPasswordRecovery } = await import('./auth');
    await expect(requestPasswordRecovery('bad')).rejects.toMatchObject({
      status: 400, code: 'INPUT_INVALID', fields: { email: 'Inválido', newPassword: 'Débil' }, safeRetryAfter: undefined,
    });
  });
});
