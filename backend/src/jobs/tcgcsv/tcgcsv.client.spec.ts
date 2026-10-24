import { afterEach, describe, expect, it, vi } from 'vitest';
import { TcgcsvClient } from './tcgcsv.client.js';
import type { PrismaService } from '../../prisma/index.js';
import { ProviderRateLimitError } from '../../common/errors/provider-rate-limit.error.js';

describe('TCGCSV: descarga acotada con origen cerrado', () => {
  const client = new TcgcsvClient();
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; vi.useRealTimers(); });
  it('usa User-Agent propio, no redirige y lee el cuerpo con el límite de bytes', async () => {
    const fetchMock = vi.fn(async () => new Response('fixture'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    expect(await client.fetchFeed('last-updated.txt', 7)).toBe('fixture');
    expect(fetchMock).toHaveBeenCalledWith('https://tcgcsv.com/last-updated.txt', expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal), headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('PokemonCardsScanner') }) }));
  });
  it('rechaza rutas arbitrarias antes de salir a la red', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(client.fetchFeed('https://otro.invalid', 1024)).rejects.toThrow('Ruta');
    await expect(client.fetchFeed('tcgplayer/3/1/prices', 1024)).rejects.toThrow('Ruta');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('autoriza rutas dinámicas solamente mediante el registro durable de grupos validados', async () => {
    const findUnique = vi.fn(async (): Promise<{ setId: string; provider: string; externalId: string } | null> => ({ setId: 'test-set', provider: 'tcgcsv', externalId: '23286' }));
    const dynamic = new TcgcsvClient({ cardSetExternalId: { findUnique }, tcgcsvSetGroup: { findFirst: async () => null } } as unknown as PrismaService);
    const fetchMock = vi.fn(async () => new Response('fixture'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    expect(await dynamic.fetchFeed('tcgplayer/3/23286/prices', 100)).toBe('fixture');
    expect(findUnique).toHaveBeenCalledWith({ where: { provider_externalId: { provider: 'tcgcsv', externalId: '23286' } } });
    findUnique.mockResolvedValueOnce(null);
    await expect(dynamic.fetchFeed('tcgplayer/3/23287/prices', 100)).rejects.toThrow('sin grupo validado');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await dynamic.fetchFeed('tcgplayer/3/groups', 100)).toBe('fixture');
    await expect(dynamic.fetchFeed('tcgplayer/4/groups', 100)).rejects.toThrow('Ruta');
  });
  it('rechaza cuerpos grandes aun sin Content-Length', async () => {
    globalThis.fetch = vi.fn(async () => new Response('excede')) as unknown as typeof fetch;
    await expect(client.fetchFeed('last-updated.txt', 3)).rejects.toThrow('demasiado grande');
  });
  it('rechaza HTTP fallido y Content-Length mayor al presupuesto', async () => {
    globalThis.fetch = vi.fn(async () => new Response('error', { status: 503 })) as unknown as typeof fetch;
    await expect(client.fetchFeed('last-updated.txt', 100)).rejects.toThrow('respondió');
    globalThis.fetch = vi.fn(async () => new Response('fixture', { headers: { 'content-length': '1000' } })) as unknown as typeof fetch;
    await expect(client.fetchFeed('last-updated.txt', 100)).rejects.toThrow('demasiado grande');
  });
  it('propaga 429 como pausa tipada y respeta Retry-After', async () => {
    globalThis.fetch = vi.fn(async () => new Response('pausa', { status: 429, headers: { 'retry-after': '120' } })) as unknown as typeof fetch;
    const error = await client.fetchFeed('last-updated.txt', 100).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ProviderRateLimitError);
    expect(error).toMatchObject({ providerId: 'tcgcsv', retryAfterMs: 120000, status: 429 });
    globalThis.fetch = vi.fn(async () => new Response('pausa', { status: 429 })) as unknown as typeof fetch;
    const fallback = await client.fetchFeed('last-updated.txt', 100).catch((value: unknown) => value);
    expect(fallback).toMatchObject({ providerId: 'tcgcsv', retryAfterMs: 900000 });
  });
  it('el timeout sigue activo durante la lectura del cuerpo', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async (_url: string, options: RequestInit) => new Response(new ReadableStream({ start(controller) {
      options.signal?.addEventListener('abort', () => controller.error(new Error('timeout fixture')), { once: true });
    } }))) as unknown as typeof fetch;
    const pending = expect(client.fetchFeed('last-updated.txt', 100)).rejects.toThrow('timeout fixture');
    await vi.advanceTimersByTimeAsync(15001);
    await pending;
  });
});


it('admite sólo las rutas de productos/precios de Ascended Heroes, sin abrir otros grupos', async () => {
  const original = globalThis.fetch;
  const products = JSON.stringify({ success: true, errors: [], results: [{ productId: 1, groupId: 24541, categoryId: 3, name: 'Pikachu', extendedData: [] }] });
  const fetchMock = vi.fn(async (url: string) => new Response(url.endsWith('/products') ? products : 'fixture'));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  try {
    const client = new TcgcsvClient();
    expect(await client.fetchFeed('tcgplayer/3/24541/products', 1000)).toBe(products);
    expect(await client.fetchFeed('tcgplayer/3/24541/prices', 100)).toBe('fixture');
    await expect(client.fetchFeed('tcgplayer/3/24542/prices', 100)).rejects.toThrow('Ruta');
    await expect(client.fetchFeed('tcgplayer/3/24541/prices?x=1', 100)).rejects.toThrow('Ruta');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally { globalThis.fetch = original; }
});
