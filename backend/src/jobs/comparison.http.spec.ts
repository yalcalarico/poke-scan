import { type ExecutionContext, type INestApplication, NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { ComparisonController } from './comparison.controller.js';
import { CardComparisonService } from './card-comparison.service.js';
import { CollectionComparisonService } from './collection-comparison.service.js';

describe('Comparación: validación y privacidad HTTP', () => {
  let app: INestApplication;
  let url: string;
  const cards = vi.fn(async () => ({ cardId: 'carta', series: [] }));
  const collections = vi.fn(async (_userId: string, id: string | null) => {
    if (id === 'ajena') throw new NotFoundException('Colección no encontrada');
    return { collectionId: id, series: [] };
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ComparisonController],
      providers: [{ provide: CardComparisonService, useValue: { comparison: cards } }, { provide: CollectionComparisonService, useValue: { comparison: collections } }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: { sub: string } }>();
      if (request.headers.authorization !== 'Bearer fixture') throw new UnauthorizedException('Token requerido');
      request.user = { sub: 'usuario-http' }; return true;
    } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  beforeEach(() => { cards.mockClear(); collections.mockClear(); });
  afterAll(async () => { await app.close(); });
  it('la carta es pública, tiene variante fija por defecto y no se cachea', async () => {
    const response = await fetch(`${url}/cards/carta/comparison`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(cards).toHaveBeenCalledWith('carta', expect.objectContaining({ days: 30, variant: 'normal' }));
  });
  it.each(['days=6', 'days=366', 'days=abc', 'days=30.5', 'variant=desconocida'])('rechaza %s antes de consultar datos', async (query) => {
    expect((await fetch(`${url}/cards/carta/comparison?${query}`)).status).toBe(400);
    expect(cards).not.toHaveBeenCalled();
  });
  it('colecciones y portfolio rechazan anónimos y usan no-store para el usuario autenticado', async () => {
    for (const path of ['collections/propia/comparison', 'portfolio/comparison']) {
      expect((await fetch(`${url}/${path}`)).status).toBe(401);
      const response = await fetch(`${url}/${path}`, { headers: { Authorization: 'Bearer fixture' } });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(collections).toHaveBeenCalledWith('usuario-http', 'propia', 30);
    expect(collections).toHaveBeenCalledWith('usuario-http', null, 30);
  });
  it('una colección ajena conserva 404', async () => {
    expect((await fetch(`${url}/collections/ajena/comparison`, { headers: { Authorization: 'Bearer fixture' } })).status).toBe(404);
  });
});
