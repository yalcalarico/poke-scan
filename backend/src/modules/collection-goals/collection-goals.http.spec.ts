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
import { CollectionGoalsModule } from './collection-goals.module.js';

interface Goal {
  id: string;
  collectionId: string;
  title: string;
  isNext: boolean;
  createdAt: string;
  updatedAt: string;
}

describe('Objetivos — HTTP y persistencia aislada', () => {
  const db = new PrismaClient();
  let app: INestApplication;
  let owner: string;
  let collectionId: string;
  let siblingId: string;
  let foreignId: string;
  const userIds: string[] = [];
  const url = (id = collectionId) => `/collections/${id}/goals`;
  const http = () => request(app.getHttpServer());
  const list = async (id = collectionId): Promise<Goal[]> => {
    const response = await http().get(url(id)).expect(200);
    return response.body as Goal[];
  };
  const create = async (title: string, id = collectionId): Promise<Goal> => {
    const response = await http().post(url(id)).send({ title }).expect(201);
    return response.body as Goal;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CollectionGoalsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest<{
            user?: { sub: string };
            headers: Record<string, string>;
          }>();
          if (req.headers['x-guest']) return false;
          req.user = { sub: owner };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    for (const suffix of ['owner', 'other']) {
      const user = await db.user.create({
        data: {
          email: `vineta-goals-${suffix}@test.local`,
          username: `vineta-goals-${suffix}`,
          displayName: 'Prueba de objetivos',
          passwordHash: 'fixture-no-login',
        },
      });
      userIds.push(user.id);
    }
    owner = userIds[0]!;
  });
  beforeEach(async () => {
    await db.collection.deleteMany({ where: { userId: { in: userIds } } });
    collectionId = (
      await db.collection.create({
        data: { userId: owner, name: 'Álbum de prueba' },
      })
    ).id;
    siblingId = (
      await db.collection.create({
        data: { userId: owner, name: 'Otro álbum' },
      })
    ).id;
    foreignId = (
      await db.collection.create({
        data: { userId: userIds[1]!, name: 'Ajena' },
      })
    ).id;
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await app?.close();
    await db.$disconnect();
  });

  it.each(['⚡'.repeat(59) + '😀'.repeat(31), '😀'.repeat(120)])(
    'persiste Unicode dentro del límite de codepoints',
    async (title) => {
      const goal = await create(title);
      expect(await list()).toEqual([goal]);
      expect(goal.title).toBe(title);
    },
  );

  it('lista vacía, crea el primer próximo y conserva orden al editar/elegir', async () => {
    expect(await list()).toEqual([]);
    const first = await create('  Reunir Pikachus de distintos sets  ');
    expect(first).toEqual({
      id: expect.any(String),
      collectionId,
      title: 'Reunir Pikachus de distintos sets',
      isNext: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const second = await create('Elegir ilustraciones');
    expect(second.isNext).toBe(false);
    const edited = await http()
      .patch(`${url()}/${first.id}`)
      .send({ title: '  Mi próximo hallazgo  ' })
      .expect(200);
    expect(edited.body).toMatchObject({
      id: first.id,
      title: 'Mi próximo hallazgo',
      isNext: true,
    });
    const selected = await http()
      .patch(`${url()}/${second.id}/next`)
      .expect(200);
    expect(selected.body).toMatchObject({ id: second.id, isNext: true });
    const goals = await list();
    expect(
      goals.map(({ id, title, isNext }) => ({ id, title, isNext })),
    ).toEqual([
      { id: first.id, title: 'Mi próximo hallazgo', isNext: false },
      { id: second.id, title: 'Elegir ilustraciones', isNext: true },
    ]);
    expect(await list(siblingId)).toEqual([]);
  });

  it.each(['', '   ', 'x'.repeat(121), 42, null])(
    'rechaza título %j sin cambiar datos ni próximo',
    async (title) => {
      const goal = await create('Conservar');
      const before = await list();
      for (const method of ['post', 'patch'] as const) {
        const target = method === 'post' ? url() : `${url()}/${goal.id}`;
        const response = await http()
          [method](target)
          .send({ title })
          .expect(400);
        expect(response.body).toMatchObject({
          statusCode: 400,
          message: expect.any(Array),
        });
        expect(await list()).toEqual(before);
      }
    },
  );

  it.each(['x', 'x'.repeat(120)])(
    'acepta el límite recortado de %s',
    async (title) => {
      expect((await create(`  ${title}  `)).title).toBe(title);
    },
  );

  it('rechaza IDs ajenos, de otra colección y faltantes sin cambiar ninguna lista', async () => {
    const own = await create('Propio');
    const sibling = await create('De otro álbum', siblingId);
    const before = await list();
    const otherBefore = await list(siblingId);
    for (const id of [foreignId, 'missing']) {
      await http().get(url(id)).expect(404);
      await http().post(url(id)).send({ title: 'No guardar' }).expect(404);
      await http()
        .patch(`${url(id)}/${own.id}`)
        .send({ title: 'No editar' })
        .expect(404);
      await http()
        .patch(`${url(id)}/${own.id}/next`)
        .expect(404);
    }
    for (const id of [sibling.id, 'missing']) {
      await http()
        .patch(`${url()}/${id}`)
        .send({ title: 'No editar' })
        .expect(404);
      await http().patch(`${url()}/${id}/next`).expect(404);
    }
    expect(await list()).toEqual(before);
    expect(await list(siblingId)).toEqual(otherBefore);
  });

  it('serializa altas simultáneas: un único primer próximo, sin perder objetivos', async () => {
    const created = await Promise.all([create('Uno'), create('Dos')]);
    expect(created.filter((goal) => goal.isNext)).toHaveLength(1);
    const goals = await list();
    expect(goals).toHaveLength(2);
    expect(goals.filter((goal) => goal.isNext)).toHaveLength(1);
    expect(goals.map((goal) => goal.id)).toEqual(
      [...goals]
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        )
        .map((goal) => goal.id),
    );
  });

  it('protege todos los endpoints con el guard y conserva los datos', async () => {
    const goal = await create('Privado');
    const before = await list();
    await http().get(url()).set('x-guest', '1').expect(403);
    await http()
      .post(url())
      .set('x-guest', '1')
      .send({ title: 'No' })
      .expect(403);
    await http()
      .patch(`${url()}/${goal.id}`)
      .set('x-guest', '1')
      .send({ title: 'No' })
      .expect(403);
    await http()
      .patch(`${url()}/${goal.id}/next`)
      .set('x-guest', '1')
      .expect(403);
    expect(await list()).toEqual(before);
  });
});
