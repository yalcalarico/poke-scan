import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TcgcsvClient } from './tcgcsv.client.js';
import type { PrismaService } from '../../prisma/index.js';

const payload = (name = 'Card') => JSON.stringify({ success: true, errors: [], totalItems: 1, results: [
  { productId: 1, categoryId: 3, groupId: 24541, name, extendedData: [{ name: 'Number', value: '1/1' }] },
] });
function store() {
  let row: Record<string, unknown> | null = null;
  const requests: Record<string, unknown>[] = [];
  const prisma = {
    tcgcsvProductCache: {
      findUnique: vi.fn(async () => row),
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => { row = row ? { ...row, ...update } : create; return row; }),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { if (row) Object.assign(row, data); return { count: 1 }; }),
    },
    tcgcsvHttpRequest: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { requests.push(data); }) },
  };
  return { prisma: prisma as unknown as PrismaService, requests, row: () => row,
    corrupt: () => { if (row) row.content = 'corrupt'; } };
}
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; vi.restoreAllMocks(); });
describe('TCGCSV: caché persistente y telemetría', () => {
  it('200 y reinicio seguido de 304 conservan contenido/recepción sin renovar el feed', async () => {
    const db = store();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(payload(), { headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    globalThis.fetch = fetcher as typeof fetch;
    await new TcgcsvClient(db.prisma).fetchFeed('tcgplayer/3/24541/products', 10000);
    const received = db.row()?.receivedAt;
    expect(await new TcgcsvClient(db.prisma).fetchFeed('tcgplayer/3/24541/products', 10000)).toBe(payload());
    expect(fetcher.mock.calls[1][1].headers['If-None-Match']).toBe('"v1"');
    expect(db.row()?.receivedAt).toBe(received);
    expect(db.requests[1]).toMatchObject({ status: 304, receivedBytes: 0, reusedCache: true });
    expect(db.row()?.checksum).toBe(createHash('sha256').update(payload()).digest('hex'));
  });
  it('copia corrupta no envía validador y 200 reemplaza contenido atómicamente', async () => {
    const db = store();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(payload(), { headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(new Response(payload('New'), { headers: { etag: '"v2"' } }));
    globalThis.fetch = fetcher as typeof fetch;
    const client = new TcgcsvClient(db.prisma);
    await client.fetchFeed('tcgplayer/3/24541/products', 10000); db.corrupt();
    expect(await client.fetchFeed('tcgplayer/3/24541/products', 10000)).toBe(payload('New'));
    expect(fetcher.mock.calls[1][1].headers['If-None-Match']).toBeUndefined();
    expect(db.row()?.etag).toBe('"v2"');
  });
  it('rechaza 304 sin copia, 206 y lote 200 inválido sin reemplazar caché', async () => {
    const db = store();
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(new Response(payload(), { status: 206 }))
      .mockResolvedValueOnce(new Response('invalid')) as typeof fetch;
    const client = new TcgcsvClient(db.prisma);
    await expect(client.fetchFeed('tcgplayer/3/24541/products', 10000)).rejects.toThrow('304');
    await expect(client.fetchFeed('tcgplayer/3/24541/products', 10000)).rejects.toThrow('respondió');
    await expect(client.fetchFeed('tcgplayer/3/24541/products', 10000)).rejects.toThrow();
    expect(db.row()).toBeNull(); expect(db.requests).toHaveLength(3);
  });
  it('usa Last-Modified sin ETag y no manda validadores para precios', async () => {
    const db = store();
    const modified = 'Wed, 21 Oct 2026 20:00:00 GMT';
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(payload(), { headers: { 'last-modified': modified } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 })).mockResolvedValueOnce(new Response('{}'));
    globalThis.fetch = fetcher as typeof fetch;
    const client = new TcgcsvClient(db.prisma);
    await client.fetchFeed('tcgplayer/3/24541/products', 10000);
    await client.fetchFeed('tcgplayer/3/24541/products', 10000);
    await client.fetchFeed('tcgplayer/3/24541/prices', 10000);
    expect(fetcher.mock.calls[1][1].headers['If-Modified-Since']).toBe(modified);
    expect(fetcher.mock.calls[2][1].headers['If-Modified-Since']).toBeUndefined();
  });
  it('429 conserva copia y registra pausa sin ocultar el error', async () => {
    const db = store();
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 429, headers: { 'retry-after': '120' } })) as typeof fetch;
    await expect(new TcgcsvClient(db.prisma).fetchFeed('tcgplayer/3/24541/products', 10000)).rejects.toMatchObject({ retryAfterMs: 120000 });
    expect(db.requests[0]).toMatchObject({ status: 429, retryAfterMs: 120000, outcome: 'failed' });
  });
});
