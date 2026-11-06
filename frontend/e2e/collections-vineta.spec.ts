import { test as base, expect, credentials, tabTo } from './helpers/browser';
import type { CollectionDto, CollectionItemDto } from '../types/api';

const image = '/icons/icon-192.png';
const albums: CollectionDto[] = [1, 2, 3].map((n) => ({
  id: `album-vineta-${n}`, userId: 'browser-baseline-user', name: `Álbum sintético ${n}`,
  isDefault: n === 1, itemCount: 2, uniqueCount: 2, duplicateCount: 0,
  totalValueUsd: 0, totalValueArs: null, createdAt: '2000-01-01T00:00:00.000Z',
  cover: [1, 2].map((card) => ({ cardId: `vineta-${card}`, imageSmall: image })),
}));
const items: CollectionItemDto[] = [1, 2].map((n) => ({
  id: `item-vineta-${n}`, collectionId: albums[0].id,
  card: { id: `vineta-${n}`, name: `Carta sintética ${n}`, supertype: 'Pokémon', subtypes: [], hp: null, types: [], number: String(n), rarity: null, artist: null, setId: 'set-vineta', imageSmall: image, imageLarge: image },
  variant: 'normal', condition: 'NM', quantity: 1, isForTrade: n === 2,
  notes: null, addedAt: '2000-01-01T00:00:00.000Z', price: null,
}));

// Extensión local y cerrada: todo lo demás vuelve a la guardia original, que
// aborta tráfico desconocido y falla al cerrar. No se admiten escrituras.
const test = base.extend<{ collections: void }>({
  collections: [async ({ context, baseURL, traffic }, use) => {
    void traffic;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== baseURL || request.method() !== 'GET') return route.fallback();
      const path = url.pathname;
      const params = url.searchParams;
      const document = request.resourceType() === 'document' || request.headers().rsc === '1';
      if (document && ['/colecciones', `/colecciones/${albums[0].id}`].includes(path)
        && [...params.keys()].every((key) => key === '_rsc')) return route.continue();
      if (path === '/_next/image' && params.get('url') === image && params.get('q') === '75'
        && ['48', '64', '96', '128', '256', '384', '640', '750', '828', '1080', '1200', '1920', '2048', '3840'].includes(params.get('w') ?? '')
        && [...params.keys()].length === 3) return route.continue();
      if (request.headers().authorization !== 'Bearer synthetic-browser-access-token') return route.fallback();
      if (path === '/api/collections' && !url.search) return route.fulfill({ json: albums });
      if (path === `/api/collections/${albums[0].id}` && !url.search) return route.fulfill({ json: albums[0] });
      if (path === `/api/collections/${albums[0].id}/stats` && !url.search) {
        return route.fulfill({ json: { totalCards: 2, uniqueCards: 2, duplicateCards: 0, setsCount: 1, totalValueUsd: 0, totalValueArs: null, cardsMissingPrice: 2 } });
      }
      if (path === `/api/collections/${albums[0].id}/goals` && !url.search) return route.fulfill({ json: [] });
      if (path === `/api/collections/${albums[0].id}/items` && params.get('page') === '1' && params.get('pageSize') === '24'
        && ['true', 'false'].includes(params.get('duplicatesOnly') ?? '')
        && ['true', 'false'].includes(params.get('forTradeOnly') ?? '')
        && [...params.keys()].length === 4) {
        const data = items.filter((item) => (params.get('duplicatesOnly') !== 'true' || item.quantity > 1)
          && (params.get('forTradeOnly') !== 'true' || item.isForTrade));
        return route.fulfill({ json: { data, page: 1, pageSize: 24, total: data.length, totalPages: data.length ? 1 : 0 } });
      }
      if (path === '/api/portfolio' && !url.search) return route.fulfill({ json: { totalCards: 6, unpricedCards: 6, valueUsd: null, history: [], topCards: [] } });
      if (['/api/portfolio/comparison', `/api/collections/${albums[0].id}/comparison`].includes(path)
        && url.search === '?days=30') {
        // Error explícito, no una serie ni cotizaciones inventadas.
        return route.fulfill({ status: 503, json: { statusCode: 503, message: 'Historial sintético no disponible' } });
      }
      return route.fallback();
    });
    await use();
  }, { auto: true }],
});

for (const width of [1440, 900, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`colecciones Viñeta: ${width}px ${theme}, álbumes y detalle`, async ({ page, traffic }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem('pokescan.theme', value), theme);
      traffic.allowLogin = true;
      // La acción hidratada evita completar el formulario antes del bootstrap de React.
      await page.goto('/escanear');
      await expect(page.getByText('Iniciá sesión para reconocer cartas', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Subir una foto', exact: true }).click();
      await expect(page).toHaveURL('/login?next=escanear');
      await page.getByRole('textbox', { name: 'Email (obligatorio)' }).fill(credentials.email);
      await page.getByLabel(/^Contraseña\s/).fill(credentials.password);
      await expect(page.getByRole('textbox', { name: 'Email (obligatorio)' })).toHaveValue(credentials.email);
      await expect(page.getByLabel(/^Contraseña\s/)).toHaveValue(credentials.password);
      const loggedIn = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.status() === 200);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await loggedIn;
      await expect(page).toHaveURL('/escanear');
      await page.goto('/colecciones');
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toHaveText('Coleccioná a tu manera.');
      await expect(main).toHaveCSS('max-width', '1280px');
      await expect(main).toHaveCSS('font-family', 'system-ui, sans-serif');
      await expect(main).toHaveCSS('font-size', '15px');
      await expect(main).toHaveCSS('line-height', '22px');
      const grid = main.getByRole('region', { name: 'Tus álbumes' });
      await expect(grid.getByRole('article')).toHaveCount(3);
      await expect(grid.locator('img')).toHaveCount(6);
      await expect(grid.getByRole('article').first()).toHaveCSS('border-top-width', '2px');
      const layout = await main.evaluate((element) => {
        const grid = element.querySelector('[aria-label="Tus álbumes"]')!;
        const finance = element.querySelector('[aria-label="Valor e historial de tus colecciones"]')!;
        return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          gap: getComputedStyle(grid).gap, bottom: grid.getBoundingClientRect().bottom,
          financeY: finance.getBoundingClientRect().y,
          dots: getComputedStyle(element.parentElement!).backgroundSize,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      expect(layout.columns).toBe(width >= 1024 ? 3 : width > 700 ? 2 : 1);
      expect(layout.gap).toBe('24px');
      expect(layout.dots).toBe('8px 8px');
      expect(layout.financeY).toBeGreaterThanOrEqual(layout.bottom + 24);
      expect(layout.overflow).toBe(false);
      const create = main.getByRole('button', { name: 'Crear colección', exact: true });
      await tabTo(page, create);
      await expect(create).toBeFocused();
      await expect(create).toHaveCSS('outline-width', '2px');
      await expect(main.getByRole('region', { name: 'Resumen del portafolio' })).toBeVisible();
      await grid.getByRole('link', { name: `Abrir colección ${albums[0].name}` }).click();
      await expect(main.getByRole('heading', { level: 1 })).toHaveText(albums[0].name);
      const cards = main.getByRole('list', { name: 'Cartas de la colección' });
      const aside = main.getByRole('complementary', { name: 'Objetivos, valor e intercambio' });
      await expect(cards.getByRole('listitem')).toHaveCount(2);
      await expect(aside.getByRole('heading', { name: 'Tu próximo objetivo' })).toBeVisible();
      await expect(aside.getByRole('heading', { name: 'Repetida no es disponible' })).toBeVisible();
      const detail = await main.evaluate((element) => {
        const list = element.querySelector('[aria-label="Cartas de la colección"]')!;
        const aside = element.querySelector('aside')!;
        const column = aside.parentElement!.firstElementChild!;
        const a = aside.getBoundingClientRect();
        const c = column.getBoundingClientRect();
        return { asideX: a.x, asideWidth: a.width, asideY: a.y, columnX: c.x, columnRight: c.right, columnBottom: c.bottom,
          columns: getComputedStyle(list).gridTemplateColumns.split(' ').length,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      expect(detail.overflow).toBe(false);
      expect(detail.columns).toBe(width > 700 ? 4 : 2);
      if (width > 700) {
        expect(detail.asideWidth).toBe(width > 1100 ? 320 : 240);
        expect(detail.asideX - detail.columnRight).toBe(24);
      } else {
        expect(detail.asideX).toBe(detail.columnX);
        expect(detail.asideY).toBeGreaterThanOrEqual(detail.columnBottom + 24);
      }
      for (const name of ['Editar', 'Exportar CSV', 'Compartir', 'Eliminar colección', 'Seleccionar']) {
        await expect(main.getByRole('button', { name, exact: true })).toBeVisible();
      }
      await expect(main.getByRole('searchbox', { name: 'Buscar cartas en esta colección' })).toBeVisible();
      await main.getByRole('button', { name: 'Intercambio', exact: true }).click();
      await expect(cards.getByRole('listitem')).toHaveCount(1);
      await expect(cards).toContainText('Carta sintética 2');
      await main.getByRole('link', { name: 'Todas las colecciones' }).click();
      await expect(main.getByRole('heading', { level: 1 })).toHaveText('Coleccioná a tu manera.');
      expect(traffic.login).toBe(1);
    });
  }
}
