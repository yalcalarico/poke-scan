import { test, expect, card } from './helpers/catalog';

const href = `/carta/${card.id}?returnTo=${encodeURIComponent('/buscar?q=synthetic')}`;
for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`ficha Viñeta: ${width}px ${theme}, composición y retorno`, async ({ page, catalog }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('pokescan.theme', value), theme);
      await page.goto(href);
      const main = page.getByRole('main');
      const heading = main.getByRole('heading', { level: 1 });
      await expect(heading).toHaveCount(1);
      await expect(heading).toHaveText(card.name);
      await expect(heading).toHaveCSS('font-style', 'italic');
      await expect(heading).toHaveCSS('font-weight', '800');
      await expect(heading).toHaveCSS('text-transform', 'uppercase');
      await expect(heading).toHaveCSS('font-size', width > 700 ? '32px' : '26px');
      await expect(main).toHaveCSS('max-width', '1280px');
      await expect(main).toHaveCSS('padding-left', width > 700 ? '32px' : '16px');
      await expect(main).toHaveCSS('font-family', 'system-ui, sans-serif');
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
      expect(await main.evaluate((element) => getComputedStyle(element.parentElement!).backgroundImage)).toContain('radial-gradient');
      const image = main.getByRole('region', { name: 'Imagen de la carta' });
      const actions = main.getByRole('region', { name: 'Elegí dónde guardarla' });
      const data = main.getByRole('region', { name: 'Datos de la carta' });
      await expect(image).toBeVisible();
      await expect(image.getByAltText(`Logo del set ${card.set.name}`)).toBeVisible();
      await expect(image.locator('[data-holo-card="detail"]')).toBeVisible();
      await expect(main.getByText('No tenemos precio de mercado para esta carta todavía.', { exact: true })).toBeVisible();
      await expect(actions.getByRole('button', { name: 'Compartir', exact: true })).toBeVisible();
      await expect(data.getByAltText(`Símbolo del set ${card.set.name}`)).toBeVisible();
      for (const label of ['Set', 'Símbolo', 'Número', 'Rareza', 'Supertipo', 'Tipo', 'HP', 'Subtipos', 'Artista', 'Lanzamiento']) {
        await expect(data.locator('dt').filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
      }
      for (const panel of [image, actions, data]) await expect(panel).toHaveCSS('border-top-width', '2px');
      // Un único frame para toda la geometría: el reveal de la carta sigue activo.
      const geometry = await main.evaluate((element) => {
        const rect = (selector: string) => {
          const node = element.querySelector(selector);
          if (!node) throw new Error(`Falta ${selector}`);
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        };
        const navBottom = Math.max(0, ...Array.from(document.querySelectorAll('nav')).map((nav) => {
          const box = nav.getBoundingClientRect();
          return getComputedStyle(nav).position === 'fixed' && box.y <= 0 && box.height > 0 ? box.bottom : 0;
        }));
        return { header: rect('header'), image: rect('[aria-label="Imagen de la carta"]'),
          prices: rect('[data-card-detail-prices]'), actions: rect('[aria-labelledby="guardar-carta"]'),
          data: rect('[aria-labelledby="datos-carta"]'), navBottom,
          overflow: document.documentElement.scrollWidth > window.innerWidth };
      });
      expect(geometry.overflow).toBe(false);
      expect(geometry.header.y).toBeGreaterThanOrEqual(geometry.navBottom);
      expect(geometry.image.y - geometry.header.y - geometry.header.height).toBe(24);
      if (width > 700) {
        expect(geometry.image.width).toBe(geometry.prices.width);
        expect(geometry.prices.x - geometry.image.x - geometry.image.width).toBe(24);
        expect(geometry.prices.y).toBe(geometry.image.y);
      } else {
        expect(geometry.prices.x).toBe(geometry.image.x);
        expect(geometry.prices.y - geometry.image.y - geometry.image.height).toBe(24);
      }
      expect(geometry.actions.y - geometry.prices.y - geometry.prices.height).toBe(24);
      expect(geometry.data.y - geometry.actions.y - geometry.actions.height).toBe(24);
      for (const panel of [geometry.image, geometry.prices, geometry.actions, geometry.data]) {
        expect(panel.x).toBeGreaterThanOrEqual(geometry.header.x);
        expect(panel.x + panel.width).toBeLessThanOrEqual(geometry.header.x + geometry.header.width);
      }
      const back = main.getByRole('link', { name: 'Volver', exact: true });
      await expect(back).toHaveAttribute('href', '/buscar?q=synthetic');
      await back.click();
      await expect(page).toHaveURL('/buscar?q=synthetic');
      await expect(page.getByPlaceholder('Probá con Pikachu')).toHaveValue('synthetic');
      expect(catalog.writes).toEqual([]);
    });
  }
}

test('ficha Viñeta: conserva inclinación, pausa y movimiento reducido', async ({ page, catalog }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(href);
  const stage = page.locator('[data-holo-card="detail"]');
  await expect(stage).toHaveAttribute('data-paused', 'false');
  const move = () => stage.evaluate((element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: box.x + box.width * .8, clientY: box.y + box.height * .2 }));
  });
  await move();
  await expect(stage).toHaveAttribute('data-active', 'true');
  const angles = await stage.evaluate((element: HTMLElement) => ['--rx', '--ry'].map((key) => parseFloat(element.style.getPropertyValue(key))));
  for (const angle of angles) { expect(angle).toBeGreaterThan(0); expect(angle).toBeLessThanOrEqual(14); }
  await page.getByRole('button', { name: 'Pausar efectos', exact: true }).filter({ visible: true }).click();
  await expect(stage).toHaveAttribute('data-paused', 'true');
  await move();
  await expect(stage).not.toHaveAttribute('data-active', 'true');
  expect(await stage.evaluate((element: HTMLElement) => ['--rx', '--ry'].map((key) => element.style.getPropertyValue(key)))).toEqual(['', '']);
  await page.getByRole('button', { name: 'Activar efectos', exact: true }).filter({ visible: true }).click();
  await expect(stage).toHaveAttribute('data-paused', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(stage).toHaveAttribute('data-paused', 'true');
  await expect(page.getByRole('button', { name: 'Movimiento reducido', exact: true }).filter({ visible: true })).toBeDisabled();
  await move();
  await expect(stage).not.toHaveAttribute('data-active', 'true');
  expect(catalog.writes).toEqual([]);
});
