import {
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';
import { PortfolioService } from './portfolio.service.js';
import { AddItemDto } from './dto/add-item.dto.js';

describe('CollectionsController — Idempotency-Key HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  const addItem = vi.fn(
    async (
      _userId: string,
      _collectionId: string,
      _dto: AddItemDto,
      _key?: string,
    ) => ({ id: 'item-confirmado', quantity: 1 }),
  );

  beforeAll(async () => {
    // Solo controller y dobles: no inicia AppModule, workers ni proveedores.
    const moduleRef = await Test.createTestingModule({
      controllers: [CollectionsController],
      providers: [
        { provide: CollectionsService, useValue: { addItem } },
        { provide: PortfolioService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<{ user: { sub: string } }>().user =
            { sub: 'usuario-http' };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    addItem.mockClear();
  });

  const post = (key?: string) =>
    fetch(`${baseUrl}/collections/destino/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key === undefined ? {} : { 'Idempotency-Key': key }),
      },
      body: JSON.stringify({ cardId: 'carta-http' }),
    });

  it('valida y normaliza el UUID antes de llamar al servicio', async () => {
    const response = await post('4B2DB49B-6EA0-4F04-9F3A-17EDDFBC0434');
    expect(response.status).toBe(201);
    expect(addItem).toHaveBeenCalledWith(
      'usuario-http',
      'destino',
      expect.objectContaining({ cardId: 'carta-http' }),
      '4b2db49b-6ea0-4f04-9f3a-17eddfbc0434',
    );
  });

  it('conserva clientes sin clave', async () => {
    expect((await post()).status).toBe(201);
    expect(addItem.mock.calls[0]?.[3]).toBeUndefined();
  });

  it.each([
    '',
    'no-es-uuid',
    '4b2db49b-6ea0-4f04-9f3a-17eddfbc0434,4b2db49b-6ea0-4f04-9f3a-17eddfbc0434',
  ])('rechaza header inválido %j sin llamar al servicio', async (key) => {
    const response = await post(key);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: expect.arrayContaining([
        'La clave de operación debe ser un UUID válido',
      ]),
    });
    expect(addItem).not.toHaveBeenCalled();
  });
});
