import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/api-client', () => ({ getApiBaseUrl: () => 'http://api.test/api' }));

import { generateMetadata } from '../../../app/share/[slug]/page';

afterEach(() => vi.unstubAllGlobals());

describe('metadata de colecciones públicas', () => {
  it('pide el origen sin Data Cache y describe valor desconocido con cobertura', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ownerDisplayName: 'Ada',
      collectionName: 'Binder',
      sharedAt: '2026-10-07T00:00:00.000Z',
      truncated: false,
      stats: {
        totalGroups: 1, totalCards: 1, uniqueCards: 1, duplicateCards: 0, setsCount: 1,
        totalValueUsd: null, pricedGroups: 0, cardsMissingPrice: 1,
      },
      items: [{
        card: {
          id: 'sv1-1', name: 'Pikachu', supertype: 'Pokémon', subtypes: [], hp: '60', types: ['Lightning'],
          number: '1', rarity: 'Common', artist: 'Artist', setId: 'sv1', imageSmall: '/small.png', imageLarge: '/large.png',
        },
        variant: 'normal', condition: 'NM', quantity: 1, price: null,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'secret' }) });

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/s/secret', expect.objectContaining({ cache: 'no-store' }));
    expect(metadata.description).toContain('valor desconocido');
    expect(metadata.description).toContain('0 de 1 grupos con referencia');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each([
    { name: 'parcial', value: 25, priced: 1, missing: 1, expected: 'valor parcial USD $25.00' },
    { name: 'cero conocido', value: 0, priced: 2, missing: 0, expected: 'valor de referencia USD $0.00' },
  ])('describe $name con cobertura exacta, sin copiar notas privadas', async ({ value, priced, missing, expected }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ownerDisplayName: 'Ada', collectionName: 'Binder', sharedAt: '2026-10-07T00:00:00.000Z', truncated: false,
      stats: { totalGroups: 2, totalCards: 2, uniqueCards: 1, duplicateCards: 0, setsCount: 1, totalValueUsd: value, pricedGroups: priced, cardsMissingPrice: missing },
      items: Array.from({ length: 2 }, (_, index) => ({
        card: { id: 'sv1-1', name: 'Pikachu', supertype: 'Pokémon', subtypes: [], hp: null, types: [], number: '1', rarity: null, artist: null, setId: 'sv1', imageSmall: '/small.png', imageLarge: '/large.png' },
        variant: 'normal', condition: 'NM', quantity: 1,
        price: index < priced ? { market: value / priced, currency: 'USD', provider: 'tcgdex', source: 'tcgplayer', fetchedAt: '2026-10-07T00:00:00.000Z' } : null,
        notes: 'SECRETO-METADATA',
      })),
    }), { status: 200 })));
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'secret' }) });
    expect(metadata.description).toContain(expected);
    expect(metadata.description).toContain(`${priced} de 2 grupos con referencia`);
    expect(JSON.stringify(metadata)).not.toContain('SECRETO-METADATA');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('una lectura posterior no reutiliza metadata del enlace y un 404 es genérico', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ownerDisplayName: 'Ada', collectionName: 'Binder', sharedAt: '2026-10-07T00:00:00.000Z', truncated: false, items: [],
        stats: { totalGroups: 0, totalCards: 0, uniqueCards: 0, duplicateCards: 0, setsCount: 0, totalValueUsd: 0, pricedGroups: 0, cardsMissingPrice: 0 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await generateMetadata({ params: Promise.resolve({ slug: 'secret' }) })).description).toContain('USD $0.00');
    const unavailable = await generateMetadata({ params: Promise.resolve({ slug: 'secret' }) });
    expect(unavailable).toEqual({ title: 'Colección compartida', robots: { index: false, follow: false } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith('http://api.test/api/s/secret', expect.objectContaining({ cache: 'no-store' }));
  });
});
