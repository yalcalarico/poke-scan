import { ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module.js';
import { CatalogSyncService } from '../src/jobs/catalog-sync.service.js';
import { SyncPricesService } from '../src/jobs/sync-prices.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';

interface Session {
  id: string;
  token: string;
}

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let priceStamp: Date;
  let catalogStarts: boolean[];
  let priceRefreshRequests: string[][];
  const sessions: string[] = [];

  beforeAll(async () => {
    catalogStarts = [];
    priceRefreshRequests = [];
    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
      // El endpoint de jobs se verifica por HTTP, pero el E2E no debe arrancar
      // el sync real del catálogo ni hacer requests a la fuente externa.
      .overrideProvider(CatalogSyncService)
      .useValue({
        start: async (force: boolean) => {
          catalogStarts.push(force);
          return { started: true, jobId: 'e2e-catalog-job' };
        },
      })
      .overrideProvider(SyncPricesService)
      .useValue({
        enqueueRefresh: async () => false,
        getPricesForCard: async (cardId: string) =>
          cardId === 'base1-4'
            ? [
                {
                  cardId,
                  variant: 'holofoil',
                  low: null,
                  mid: null,
                  high: null,
                  market: 999.99,
                  provider: 'tcgdex',
                  source: 'tcgplayer',
                  currency: 'USD',
                  fetchedAt: priceStamp,
                  isStale: false,
                },
              ]
            : [],
        refreshMany: async (cardIds: string[]) => {
          priceRefreshRequests.push(cardIds);
          return { refreshed: cardIds.length, failed: 0, results: {} };
        },
      });
    const moduleFixture: TestingModule = await moduleBuilder.compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    /*
     * El precio de la ficha se escribe en el test DB con fecha actual. El worker
     * está desactivado en `vitest.config.e2e.ts`, así que una carta sin precio
     * **no** dispara una llamada externa mientras corre la suite.
     */
    priceStamp = new Date();
    await redis.del('prices:v2:tcgdex:base1-4');
    await prisma.cardPrice.create({
      data: {
        cardId: 'base1-4',
        variant: 'holofoil',
        market: new Prisma.Decimal('999.99'),
        provider: 'tcgdex',
        source: 'tcgplayer',
        currency: 'USD',
        fetchedAt: priceStamp,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cardPrice.deleteMany({
        where: { cardId: 'base1-4', provider: 'tcgdex', fetchedAt: priceStamp },
      });
      for (const id of sessions) {
        await prisma.user.deleteMany({ where: { id } });
      }
    }
    if (redis) await redis.del('prices:v2:tcgdex:base1-4');
    await app?.close();
  });

  async function register(label: string): Promise<Session> {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Session-Request', '1')
      .send({
        email: `${label}-${nonce}@test.local`,
        username: `${label}${nonce.replace(/\D/g, '').slice(-8)}`,
        password: 'E2ePassword123',
        displayName: `E2E ${label}`,
      })
      .expect(201);

    const session: Session = {
      id: response.body.user.id,
      token: response.body.accessToken,
    };
    sessions.push(session.id);
    return session;
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it('GET /api/health informa disponibilidad sin filtrar secretos', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.degraded).toBe(!response.body.detail.redis.available);
    expect(response.body.detail.redis.configured).toEqual(expect.any(Boolean));
    expect(response.body.detail.redis.available).toEqual(expect.any(Boolean));
    expect(
      response.body.detail.redis.degradedSince === null ||
        typeof response.body.detail.redis.degradedSince === 'string',
    ).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('redis://');
  });

  it('busca una carta y devuelve sus precios e histórico del proveedor activo', async () => {
    const card = await request(app.getHttpServer()).get('/api/cards/base1-4').expect(200);
    expect(card.body.name).toBe('Charizard');
    expect(card.body.set.name).toBe('Base');

    const price = await request(app.getHttpServer())
      .get('/api/cards/base1-4/prices')
      .expect(200);
    expect(price.body.prices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'tcgdex',
          source: 'tcgplayer',
          market: 999.99,
          isStale: false,
        }),
      ]),
    );

    const history = await request(app.getHttpServer())
      .get('/api/cards/base1-4/prices/history')
      .expect(200);
    expect(history.body.provider).toBe('tcgdex');
    expect(history.body.points.length).toBeGreaterThan(0);
    expect(history.body.points.at(-1).market).toBe(999.99);

    const search = await request(app.getHttpServer())
      .get('/api/cards/search?q=charizard&pageSize=5')
      .expect(200);
    expect(search.body.total).toBeGreaterThan(0);
    expect(search.body.data[0].name).toBe('Charizard');
  });

  it('crea sesión y colección, guarda intercambio, protege ownership y comparte', async () => {
    const owner = await register('owner');
    const stranger = await register('stranger');

    const collectionResponse = await request(app.getHttpServer())
      .post('/api/collections')
      .set(auth(owner.token))
      .send({ name: 'Colección E2E' })
      .expect(201);
    const collectionId = collectionResponse.body.id as string;

    const item = await request(app.getHttpServer())
      .post(`/api/collections/${collectionId}/items`)
      .set(auth(owner.token))
      .send({
        cardId: 'base1-4',
        variant: 'holofoil',
        quantity: 2,
        isForTrade: true,
      })
      .expect(201);
    expect(item.body.isForTrade).toBe(true);

    const list = await request(app.getHttpServer())
      .get(`/api/collections/${collectionId}/items?forTradeOnly=true`)
      .set(auth(owner.token))
      .expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].isForTrade).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/collections/${collectionId}`)
      .set(auth(owner.token))
      .expect(200);
    expect(detail.body.itemCount).toBe(2);
    expect(detail.body.uniqueCount).toBe(1);
    expect(detail.body.totalValueUsd).toBeGreaterThan(0);

    // Un id ajeno no confirma que la colección existe: ownership va en el where.
    await request(app.getHttpServer())
      .get(`/api/collections/${collectionId}`)
      .set(auth(stranger.token))
      .expect(404);

    const share = await request(app.getHttpServer())
      .post('/api/share')
      .set(auth(owner.token))
      .send({ collectionId })
      .expect(201);
    expect(share.body.slug).toBeTruthy();

    const publicView = await request(app.getHttpServer())
      .get(`/api/s/${share.body.slug}`)
      .expect(200);
    expect(publicView.body.collectionName).toBe('Colección E2E');
    expect(publicView.body.items).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/api/share/${share.body.id}`)
      .set(auth(owner.token))
      .expect(204);
  });

  it('protege los endpoints de jobs y delega al service correcto', async () => {
    await request(app.getHttpServer())
      .post('/api/jobs/sync-catalog')
      .send({})
      .expect(403);

    const sync = await request(app.getHttpServer())
      .post('/api/jobs/sync-catalog')
      .set('x-admin-key', 'e2e-admin-key')
      .send({ force: true })
      .expect(202);
    expect(sync.body).toEqual({ started: true, jobId: 'e2e-catalog-job' });
    expect(catalogStarts).toEqual([true]);

    const refresh = await request(app.getHttpServer())
      .post('/api/jobs/refresh-prices')
      .set('x-admin-key', 'e2e-admin-key')
      .send({ cardIds: ['base1-4', 'base1-10'] })
      .expect(200);
    expect(refresh.body).toEqual({ requested: 2, refreshed: 2, failed: 0 });
    expect(priceRefreshRequests).toEqual([['base1-4', 'base1-10']]);
  });
});
