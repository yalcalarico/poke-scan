import type { PriceProvider } from './card-provider.interface.js';
import { TcgdexProvider } from './tcgdex.provider.js';

const tcgplayerPayload = (prices: Record<string, unknown>) => ({
  pricing: { tcgplayer: { unit: 'USD', ...prices } },
});

describe('TcgdexProvider', () => {
  let provider: TcgdexProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new TcgdexProvider();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ok = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  const notFound = (): Response => new Response('{}', { status: 404 });

  it('getCardPrices mapea las 7 variantes de tcgdex al enum nuestro', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(
        tcgplayerPayload({
          normal: { lowPrice: 0.02, midPrice: 0.17, marketPrice: 0.09 },
          holofoil: { lowPrice: 10, midPrice: 12, highPrice: 20, marketPrice: 11 },
          'reverse-holofoil': { marketPrice: 0.23 },
          '1st-edition': { marketPrice: 40 },
          '1st-edition-holofoil': { marketPrice: 500 },
          unlimited: { marketPrice: 5 },
          'unlimited-holofoil': { marketPrice: 50 },
        }),
      ),
    );

    const prices = await provider.getCardPrices('base2-10', 'base2', '10');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.tcgdex.net/v2/en/sets/base2/10',
    );
    expect(prices.map((p) => p.variant)).toEqual([
      'normal',
      'holofoil',
      'reverseHolofoil',
      'firstEdition',
      'firstEditionHolofoil',
      'unlimited',
      'unlimitedHolofoil',
    ]);
    expect(prices[0]).toMatchObject({
      cardId: 'base2-10',
      variant: 'normal',
      low: 0.02,
      mid: 0.17,
      high: null,
      market: 0.09,
      source: 'tcgplayer',
      currency: 'USD',
    });
  });

  it('getCardPrices saltea variantes con todos los valores en null', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(
        tcgplayerPayload({
          normal: { lowPrice: null, midPrice: null, marketPrice: null },
          holofoil: { marketPrice: 12 },
          'sin-unidad-no-vale': { marketPrice: 99 },
        }),
      ),
    );

    const prices = await provider.getCardPrices('x-1', 'x', '1');

    expect(prices.map((p) => p.variant)).toEqual(['holofoil']);
  });

  it('getCardPrices reintenta con padding cuando el número sin pad da 404', async () => {
    fetchMock
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(ok(tcgplayerPayload({ normal: { marketPrice: 3 } })));

    const prices = await provider.getCardPrices('me55-18', '30th', '18');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.tcgdex.net/v2/en/sets/30th/18');
    expect(fetchMock.mock.calls[1]![0]).toBe('https://api.tcgdex.net/v2/en/sets/30th/018');
    expect(prices.map((p) => p.variant)).toEqual(['normal']);
  });

  it('getCardPrices devuelve vacío cuando no hay pricing de TCGPlayer', async () => {
    // Set recién lanzado: tcgdex responde la carta con pricing en null.
    fetchMock.mockResolvedValueOnce(ok({ pricing: { tcgplayer: null } }));

    const prices = await provider.getCardPrices('me55-18', '30th', '18');

    expect(prices).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getCardPrices propaga el 404 de un número no numérico sin reintentar', async () => {
    fetchMock.mockResolvedValueOnce(notFound());

    await expect(provider.getCardPrices('xyp-XY99', 'xyp', 'XY99')).rejects.toThrow(
      /404/,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getCardPrices reintenta los 503 y responde cuando la fuente se recupera', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(ok(tcgplayerPayload({ normal: { marketPrice: 1 } })));

    const prices = await provider.getCardPrices('swsh3-136', 'swsh3', '136');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(prices.map((p) => p.variant)).toEqual(['normal']);
  });

  it('listSets y getSetDetail parsean el payload defensivamente', async () => {
    fetchMock.mockResolvedValueOnce(
      ok([
        { id: 'swsh3', name: 'Darkness Ablaze' },
        { name: 'sin id: se ignora' },
        'no-objeto',
      ]),
    );

    const sets = await provider.listSets();
    expect(sets).toEqual([{ id: 'swsh3', name: 'Darkness Ablaze' }]);

    fetchMock.mockResolvedValueOnce(
      ok({
        id: 'swsh3',
        name: 'Darkness Ablaze',
        cards: [{ localId: '136' }, { localId: '189' }, { otraCosa: 1 }, 'basura'],
      }),
    );

    const detail: Awaited<ReturnType<PriceProvider['getSetDetail']>> =
      await provider.getSetDetail('swsh3');
    expect(detail).toEqual({
      id: 'swsh3',
      name: 'Darkness Ablaze',
      localIds: ['136', '189'],
    });
  });
});
