import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TcgcsvPriceProvider } from '../modules/providers/tcgcsv-price.provider.js';
import type { TcgcsvService } from './tcgcsv/tcgcsv.service.js';
import { PRICE_MAX_AGE_MS, SyncPricesService } from './sync-prices.service.js';

describe('SyncPricesService: lectura local y cola TCGCSV', () => {
  const build = () => {
    const query = vi.fn().mockResolvedValue([]);
    const enqueue = vi.fn().mockResolvedValue(1);
    const service = new SyncPricesService(
      { $queryRaw: query } as unknown as PrismaService,
      new TcgcsvPriceProvider(),
      { enqueueCards: enqueue } as unknown as TcgcsvService,
    );
    return { service, query, enqueue };
  };
  const row = (fetchedAt = new Date()) => ({
    cardId: 'base1-58', variant: 'normal', low: null, mid: null, high: null,
    market: new Prisma.Decimal(0), provider: 'tcgcsv', source: 'tcgplayer', currency: 'USD', fetchedAt,
  });

  afterEach(() => vi.restoreAllMocks());

  it('conserva un precio cero vigente y su fecha, sin pedir otro lote', async () => {
    const { service, query, enqueue } = build();
    const observed = row();
    query.mockResolvedValue([observed]);
    expect(await service.getPricesForCard('base1-58')).toMatchObject([
      { market: 0, fetchedAt: observed.fetchedAt, isStale: false, freshness: 'fresh' },
    ]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('devuelve la referencia vencida mientras solicita trabajo local', async () => {
    const { service, query, enqueue } = build();
    const observed = row(new Date(Date.now() - PRICE_MAX_AGE_MS - 1000));
    query.mockResolvedValue([observed]);
    expect(await service.getPricesForCard('base1-58')).toMatchObject([
      { market: 0, fetchedAt: observed.fetchedAt, isStale: true, freshness: 'stale' },
    ]);
    expect(enqueue).toHaveBeenCalledWith(['base1-58']);
  });

  it('una lectura sin precio no descarga ni inventa una observación', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Red inesperada'));
    const { service, enqueue } = build();
    expect(await service.getPricesForCard('base1-58')).toEqual([]);
    expect(enqueue).toHaveBeenCalledWith(['base1-58']);
    expect(network).not.toHaveBeenCalled();
  });

  it('un fallo al encolar no rompe la lectura ni deja un rechazo sin manejar', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, enqueue } = build();
    enqueue.mockRejectedValue(new Error('Cola no disponible'));
    await expect(service.getPricesForCard('base1-58')).resolves.toEqual([]);
  });

  it('el lote admin conserva la respuesta de encolado, sin acreditar refrescos', async () => {
    const { service, query, enqueue } = build();
    expect(await service.refreshMany(['base1-58', 'base2-60'])).toEqual({
      refreshed: 0, failed: 0, queued: 1, results: {},
    });
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(['base1-58', 'base2-60']);
    expect(query).not.toHaveBeenCalled();
  });

  it('un fallo de lectura no se presenta como una carta sin precio', async () => {
    const { service, query, enqueue } = build();
    query.mockRejectedValue(new Error('Base no disponible'));
    await expect(service.getPricesForCard('base1-58')).rejects.toThrow('Base no disponible');
    expect(enqueue).not.toHaveBeenCalled();
  });
});
