import type { CollectionDto, CollectionItemDto } from '../../types/api';
import { test as base, expect } from './browser';
import card from '../catalog.json';

const collection: CollectionDto = {
  id: 'browser-collection', userId: 'browser-baseline-user', name: 'Colección sintética',
  isDefault: true, itemCount: 0, uniqueCount: 0, duplicateCount: 0,
  totalValueUsd: 0, totalValueArs: null, cover: [], createdAt: '2000-01-01T00:00:00.000Z',
};
export const payload = { cardId: card.id, variant: 'holofoil', condition: 'NM', quantity: 3, isForTrade: true };
const paginate = (data: CollectionItemDto[]) => ({ data, total: data.length, page: 1, pageSize: 12, totalPages: data.length ? 1 : 0 });
type Catalog = {
  search: 'results' | 'empty' | 'error'; failSave: boolean;
  writes: unknown[]; locationReads: unknown[]; itemReads: CollectionItemDto[][];
};

export const test = base.extend<{ catalog: Catalog }>({
  catalog: [async ({ context, baseURL }, use) => {
    const state: Catalog = { search: 'results', failSave: false, writes: [], locationReads: [], itemReads: [] };
    let item: CollectionItemDto | null = null;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== baseURL) return route.fallback();
      const path = url.pathname;
      const method = request.method();
      const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
      if (method === 'GET') {
        const params = new URLSearchParams(url.search);
        params.delete('_rsc');
        const document = request.resourceType() === 'document' || request.headers().rsc === '1';
        if (document && ((path === '/buscar' && [...params.keys()].every((key) => key === 'q'))
          || (path === `/carta/${card.id}` && [...params.keys()].every((key) => key === 'returnTo')))) {
          return route.continue();
        }
        if (path === '/_next/image' && params.get('url') === card.imageSmall
          && ['96', '128', '256', '384', '640', '750', '828', '1080', '1200'].includes(params.get('w') ?? '')
          && params.get('q') === '75' && [...params.keys()].sort().join() === 'q,url,w') return route.continue();
        if (path === '/api/sets' && !url.search) return json([card.set]);
        if (path === '/api/cards/search'
          && [...params.keys()].sort().join() === ['direction', 'page', 'pageSize', ...(params.has('q') ? ['q'] : []), 'searchBy', 'sort'].sort().join()
          && ['', 'synthetic', 'missing', 'broken'].includes(params.get('q') ?? '')
          && params.get('searchBy') === 'name' && params.get('page') === '1' && params.get('pageSize') === '24'
          && params.get('sort') === 'name' && params.get('direction') === 'asc') {
          if (state.search === 'error') return json({ statusCode: 503, message: 'Búsqueda sintética no disponible' }, 503);
          const data = state.search === 'empty' || !params.has('q') ? [] : [card];
          return json({ data, total: data.length, page: 1, pageSize: 24, totalPages: data.length ? 1 : 0 });
        }
        if (path === `/api/cards/${card.id}/prices` && !url.search) return json({ card, prices: [] });
        if (path === `/api/cards/${card.id}/prices/history` && url.search === '?days=30') {
          return json({ statusCode: 404, message: 'Sin historial sintético' }, 404);
        }
        const authenticated = request.headers().authorization === 'Bearer synthetic-browser-access-token';
        if (authenticated && path === '/api/collections' && !url.search) return json([collection]);
        if (authenticated && path === `/api/cards/${card.id}/location` && !url.search) {
          const location = item ? { collectionId: collection.id, collectionName: collection.name,
            itemId: item.id, quantity: item.quantity, variant: item.variant, condition: item.condition } : null;
          state.locationReads.push(location);
          return json(location);
        }
        if (authenticated && path === `/api/collections/${collection.id}/items`
          && params.get('search') === card.name && params.get('pageSize') === '12'
          && [...params.keys()].sort().join() === 'pageSize,search') {
          const data = item ? [item] : [];
          state.itemReads.push(structuredClone(data));
          return json(paginate(data));
        }
      }
      if (method === 'POST' && path === `/api/collections/${collection.id}/items` && !url.search
        && request.headers().authorization === 'Bearer synthetic-browser-access-token') {
        const body: unknown = request.postDataJSON();
        expect(body, 'Payload completo del alta').toEqual(payload);
        state.writes.push(body);
        if (state.failSave) return json({ statusCode: 503, message: 'Guardado sintético no disponible' }, 503);
        item = { id: 'browser-item', collectionId: collection.id, card, variant: 'holofoil', condition: 'NM',
          quantity: 3, isForTrade: true, notes: null, addedAt: '2000-01-01T00:00:00.000Z', price: null };
        return json(item, 201);
      }
      // La guardia original aborta y registra todo lo que este escenario no permite.
      return route.fallback();
    });
    await use(state);
  }, { auto: true }],
});
export { card, expect };
