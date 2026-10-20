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
    expect(init.redirect).toBe('error'); expect(init.cache).toBe('no-store');
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
      status: 400, code: 'INPUT_INVALID', fields: { email: 'Revisá el formato del email.', newPassword: 'Usá entre 8 y 72 caracteres.' }, safeRetryAfter: undefined,
    });
  });

  it.each([[403, 'RECOVERY_LINK_INVALID'], [429, 'INPUT_INVALID'], [400, 'UNKNOWN']])('no acredita pares status/código inesperados ni texto crudo', async (status, code) => {
    const unsafe = 'fixture-raw-value';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code, message: unsafe,
      fields: { newPassword: unsafe, token: unsafe } }), { status })));
    const { recoverPassword } = await import('./auth');
    try { await recoverPassword('a'.repeat(43), 'fixture-password'); throw new Error('EXPECTED_REJECTION'); }
    catch (error) {
      const safe = error as { code?: string; message: string; fields?: Record<string, string> };
      expect(safe.code).toBeUndefined(); expect(JSON.stringify(safe).includes(unsafe)).toBe(false);
      expect(safe.message.includes(unsafe)).toBe(false);
    }
  });

  it.each(['', '{}', 'null', '[]', '{"success":false}', '{"success":"true"}', '{"success":true,"unexpected":1}'])('200 body malformado va a incertidumbre y no limpia sesión', async (body) => {
    vi.stubGlobal('window', {});
    const { setTokens, getAccessToken } = await import('./token-storage'); setTokens('fixture-session');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const { recoverPassword } = await import('./auth');
    await expect(recoverPassword('a'.repeat(43), 'fixture-password')).rejects.toMatchObject({ status: 200 });
    expect(getAccessToken() === 'fixture-session').toBe(true);
  });

  it('un redirect rechazado queda incierto, sin segundo POST ni limpiar sesión', async () => {
    vi.stubGlobal('window', {});
    const { setTokens, getAccessToken } = await import('./token-storage'); setTokens('fixture-session');
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('redirect rejected')); vi.stubGlobal('fetch', fetchMock);
    const { recoverPassword } = await import('./auth');
    await expect(recoverPassword('a'.repeat(43), 'fixture-password')).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(getAccessToken() === 'fixture-session').toBe(true);
    const init = fetchMock.mock.calls[0][1] as RequestInit; expect(init.redirect).toBe('error'); expect(init.cache).toBe('no-store');
  });

  it.each(['0', '-1', '1.5', 'Wed, 21 Oct 2015 07:28:00 GMT', '999999999999999999999'])('Retry-After %s no es segundos positivos seguros', async (value) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"RECOVERY_RATE_LIMITED"}', { status: 429, headers: { 'Retry-After': value } })));
    const { requestPasswordRecovery } = await import('./auth');
    await expect(requestPasswordRecovery('fixture@example.invalid')).rejects.toMatchObject({ safeRetryAfter: undefined });
  });
});
