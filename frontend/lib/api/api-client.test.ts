import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('API en desarrollo por red local', () => {
  it('usa la URL interna absoluta en el server aunque el browser use /api', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '/api');
    vi.stubEnv('DEV_API_PROXY_TARGET', 'http://127.0.0.1:3002/api');
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

  it('ignora la configuración de LAN en producción', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com/api/');
    vi.stubEnv('DEV_API_PROXY_TARGET', 'http://127.0.0.1:3001/api');
    const { getApiBaseUrl } = await import('./api-client');
    expect(getApiBaseUrl()).toBe('https://api.example.com/api');
  });
});
