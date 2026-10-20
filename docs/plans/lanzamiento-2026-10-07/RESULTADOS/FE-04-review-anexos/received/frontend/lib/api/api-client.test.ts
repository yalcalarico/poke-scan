import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('base de API según el runtime', () => {
  it('usa API_INTERNAL_URL privada en el server production y normaliza barras finales', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '/api');
    vi.stubEnv('API_INTERNAL_URL', 'http://backend:3001/api///');
    const { getApiBaseUrl, apiFetch } = await import('./api-client');
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);

    expect(getApiBaseUrl()).toBe('http://backend:3001/api');
    await apiFetch('/s/fixture', { skipAuth: true });
    expect(fetch).toHaveBeenCalledWith('http://backend:3001/api/s/fixture', expect.any(Object));
  });

  it('resuelve API_INTERNAL_URL después de importar el módulo', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '/api');
    vi.stubEnv('API_INTERNAL_URL', '');
    const { getApiBaseUrl, apiFetch } = await import('./api-client');
    const fetch = vi.fn().mockImplementation(async () => new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);

    expect(getApiBaseUrl()).toBe('/api');
    vi.stubEnv('API_INTERNAL_URL', 'http://backend:3001/api');
    expect(getApiBaseUrl()).toBe('http://backend:3001/api');
    await apiFetch('/cards/fixture', { skipAuth: true });
    vi.stubEnv('API_INTERNAL_URL', 'http://backend-restarted:3001/api/');
    await apiFetch('/cards/fixture', { skipAuth: true });
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://backend:3001/api/cards/fixture', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://backend-restarted:3001/api/cards/fixture', expect.any(Object));
  });

  it('nunca usa API_INTERNAL_URL desde el browser production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '/api');
    vi.stubEnv('API_INTERNAL_URL', 'http://backend:3001/api');
    vi.stubGlobal('window', {});
    const { getApiBaseUrl, apiFetch } = await import('./api-client');
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);

    expect(getApiBaseUrl()).toBe('/api');
    await apiFetch('/health', { skipAuth: true });
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.any(Object));
  });

  it('mantiene el fallback previo en production sin configuración privada', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com/api/');
    vi.stubEnv('API_INTERNAL_URL', '');
    const { getApiBaseUrl } = await import('./api-client');

    expect(getApiBaseUrl()).toBe('https://api.example.com/api');
  });

  it('mantiene el fallback local cuando ambas bases están ausentes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    vi.stubEnv('API_INTERNAL_URL', undefined);
    const { getApiBaseUrl } = await import('./api-client');

    expect(getApiBaseUrl()).toBe('http://localhost:3001/api');
  });

  it('renueva y reintenta por /api en el browser sin alterar credenciales ni headers', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '/api/');
    vi.stubEnv('API_INTERNAL_URL', 'http://backend:3001/api');
    vi.stubGlobal('window', {});
    const { apiFetch } = await import('./api-client');
    const { setTokens } = await import('./token-storage');
    setTokens('access-fixture-expired');
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"message":"Sesión vencida"}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"accessToken":"access-fixture-renewed"}'))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);

    await expect(apiFetch('/collections', { headers: { Accept: 'application/json' } }))
      .resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Session-Request': '1' },
      body: '{}',
    });
    for (const index of [0, 2]) {
      const [url, options] = fetch.mock.calls[index] as [string, RequestInit];
      expect(url).toBe('/api/collections');
      expect(options.credentials).toBe('include');
      const headers = new Headers(options.headers);
      expect(headers.get('Accept')).toBe('application/json');
      expect(headers.get('Authorization')).toBe(
        index === 0 ? 'Bearer access-fixture-expired' : 'Bearer access-fixture-renewed',
      );
    }
  });
});

describe('API en desarrollo por red local', () => {
  it('usa la URL interna absoluta en el server aunque el browser use /api', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '/api');
    vi.stubEnv('DEV_API_PROXY_TARGET', 'http://127.0.0.1:3002/api');
    vi.stubEnv('API_INTERNAL_URL', 'http://backend:3001/api');
    const { getApiBaseUrl, apiFetch } = await import('./api-client');
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);

    expect(getApiBaseUrl()).toBe('http://127.0.0.1:3002/api');
    await apiFetch('/health', { skipAuth: true });
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:3002/api/health', expect.any(Object));
  });

  it('mantiene el mismo origen HTTPS en el browser', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '/api');
    vi.stubEnv('DEV_API_PROXY_TARGET', 'http://127.0.0.1:3001/api');
    vi.stubGlobal('window', {});
    const { getApiBaseUrl, apiFetch } = await import('./api-client');
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);

    expect(getApiBaseUrl()).toBe('/api');
    await apiFetch('/health', { skipAuth: true });
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.any(Object));
  });

  it('mantiene el fallback público en development sin proxy y omite la env de production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api/');
    vi.stubEnv('DEV_API_PROXY_TARGET', undefined);
    vi.stubEnv('API_INTERNAL_URL', 'http://backend:3001/api');
    const { getApiBaseUrl } = await import('./api-client');

    expect(getApiBaseUrl()).toBe('http://localhost:3001/api');
  });

  it('ignora la configuración de LAN en producción', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com/api/');
    vi.stubEnv('DEV_API_PROXY_TARGET', 'http://127.0.0.1:3001/api');
    const { getApiBaseUrl } = await import('./api-client');
    expect(getApiBaseUrl()).toBe('https://api.example.com/api');
  });
});
