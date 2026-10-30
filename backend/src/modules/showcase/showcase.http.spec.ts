import {
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../prisma/index.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { ShowcaseModule } from './showcase.module.js';

describe('Vitrina personal — HTTP y persistencia aislada', () => {
  const db = new PrismaClient();
  let app: INestApplication;
  let owner: string;
  let other: string;
  let collectionId: string;
  const ids: string[] = [];
  const http = () => request(app.getHttpServer());
  const prefix = 'test-vineta-showcase-';
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ShowcaseModule],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(ctx: ExecutionContext) {
          const req = ctx
            .switchToHttp()
            .getRequest<{
              user?: { sub: string };
              headers: Record<string, string>;
            }>();
          if (req.headers['x-guest']) return false;
          req.user = { sub: req.headers['x-other'] ? other : owner };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
    for (const suffix of ['owner', 'other']) {
      const user = await db.user.create({
        data: {
          email: `vineta-showcase-${suffix}@test.local`,
          username: `vitrina_${suffix}`,
          displayName: 'Prueba de vitrina',
          passwordHash: 'fixture-no-login',
        },
      });
      ids.push(user.id);
    }
    [owner, other] = ids as [string, string];
    await db.cardSet.create({
      data: { id: prefix + 'set', name: 'Set sintético sin precios' },
    });
    for (const suffix of ['a', 'b', 'foreign'])
      await db.card.create({
        data: {
          id: prefix + suffix,
          setId: prefix + 'set',
          name: `Carta de prueba ${suffix}`,
          number: suffix,
          supertype: 'Pokémon',
          imageSmall: '/synthetic-small',
          imageLarge: '/synthetic-large',
          rawJson: {},
        },
      });
  });
  beforeEach(async () => {
    await db.showcasePreference.deleteMany({ where: { userId: { in: ids } } });
    await db.collection.deleteMany({ where: { userId: { in: ids } } });
    const own = await db.collection.create({
      data: { userId: owner, name: 'Propia' },
    });
    collectionId = own.id;
    const sibling = await db.collection.create({
      data: { userId: owner, name: 'Otra propia' },
    });
    const foreign = await db.collection.create({
      data: { userId: other, name: 'Ajena' },
    });
    await db.collectionItem.createMany({
      data: [
        {
          collectionId,
          cardId: prefix + 'a',
          variant: 'normal',
          condition: 'NM',
        },
        {
          collectionId,
          cardId: prefix + 'b',
          variant: 'normal',
          condition: 'NM',
        },
        {
          collectionId: sibling.id,
          cardId: prefix + 'a',
          variant: 'normal',
          condition: 'NM',
        },
        {
          collectionId: foreign.id,
          cardId: prefix + 'foreign',
          variant: 'normal',
          condition: 'NM',
        },
      ],
    });
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.card.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.cardSet.deleteMany({ where: { id: prefix + 'set' } });
    await app?.close();
    await db.$disconnect();
  });
  it('no inventa un ranking sin referencias de precio', async () => {
    const res = await http().get('/showcase').expect(200);
    expect(res.body).toEqual({
      preferences: { mode: 'value', cardIds: [] },
      cards: [],
    });
  });
  it('guarda selección propia, no repite cartas de varios álbumes y conserva ausencia de precio', async () => {
    const payload = { mode: 'personal', cardIds: [prefix + 'b', prefix + 'a'] };
    await http().patch('/showcase').send(payload).expect(200);
    const res = await http().get('/showcase').expect(200);
    expect(res.body.preferences).toEqual(payload);
    expect(
      res.body.cards.map((c: { card: { id: string } }) => c.card.id),
    ).toEqual(payload.cardIds);
    expect(
      res.body.cards.every(
        (c: { market: unknown; fetchedAt: unknown }) =>
          c.market === null && c.fetchedAt === null,
      ),
    ).toBe(true);
    expect(res.body.cards[0].card).not.toHaveProperty('rawJson');
    const outsider = await http()
      .get('/showcase')
      .set('x-other', '1')
      .expect(200);
    expect(outsider.body.preferences).toEqual({ mode: 'value', cardIds: [] });
  });
  it.each([
    { mode: 'personal', cardIds: [prefix + 'foreign'] },
    { mode: 'personal', cardIds: [prefix + 'missing'] },
    { mode: 'personal', cardIds: [prefix + 'a', prefix + 'a'] },
    { mode: 'other', cardIds: [] },
    { mode: 'personal', cardIds: [null] },
    { mode: 'personal', cardIds: 'a' },
  ])('rechaza %j sin modificar preferencias', async (payload) => {
    const original = { mode: 'personal', cardIds: [prefix + 'a'] };
    await http().patch('/showcase').send(original).expect(200);
    await http().patch('/showcase').send(payload).expect(400);
    expect(
      (await http().get('/showcase').expect(200)).body.preferences,
    ).toEqual(original);
  });
  it('filtra cartas que ya no están en ninguna colección propia', async () => {
    await http()
      .patch('/showcase')
      .send({ mode: 'personal', cardIds: [prefix + 'b'] })
      .expect(200);
    await db.collectionItem.deleteMany({
      where: { cardId: prefix + 'b', collection: { userId: owner } },
    });
    expect((await http().get('/showcase').expect(200)).body.cards).toEqual([]);
  });
  it('no admite lecturas ni escrituras anónimas', async () => {
    await http().get('/showcase').set('x-guest', '1').expect(403);
    await http()
      .patch('/showcase')
      .set('x-guest', '1')
      .send({ mode: 'personal', cardIds: [] })
      .expect(403);
    expect(
      await db.showcasePreference.count({ where: { userId: owner } }),
    ).toBe(0);
  });
});
