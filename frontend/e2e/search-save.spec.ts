import type { Page } from '@playwright/test';
import { credentials } from './helpers/browser';
import { test, expect, card, payload } from './helpers/catalog';

async function login(page: Page) {
  // Entramos por una acción hidratada, igual que el baseline del escáner.
  await page.goto('/escanear');
  await expect(page.getByText('Iniciá sesión para reconocer cartas', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Subir una foto', exact: true }).click();
  await expect(page).toHaveURL('/login?next=escanear');
  const email = page.getByRole('textbox', { name: 'Email (obligatorio)', exact: true });
  const password = page.getByLabel(/^Contraseña\s/);
  await email.fill(credentials.email);
  await password.fill(credentials.password);
  await expect(email).toHaveValue(credentials.email);
  await expect(password).toHaveValue(credentials.password);
  const loggedIn = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.status() === 200);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await loggedIn;
  await expect(page).toHaveURL('/escanear');
}

async function openCard(page: Page) {
  await page.goto('/buscar');
  // El estado vacío llega después del GET cliente: el input ya está hidratado.
  await expect(page.getByText('Buscá tu primera carta', { exact: true })).toBeVisible();
  const input = page.getByPlaceholder('Probá con Pikachu');
  await input.fill('synthetic');
  await input.press('Enter');
  await expect(page).toHaveURL('/buscar?q=synthetic');
  await expect(input).toHaveValue('synthetic');
  const result = page.getByRole('link').filter({ hasText: card.name });
  await expect(result).toHaveCount(1);
  // La primera ficha compila en Next dev: esperamos la navegación, no un plazo fijo.
  await Promise.all([
    page.waitForURL(new RegExp(`/carta/${card.id}\\?returnTo=`), { timeout: 20_000 }),
    result.click(),
  ]);
  await expect(page).toHaveURL(new RegExp(`/carta/${card.id}\\?returnTo=`));
  await expect(page.getByRole('heading', { name: card.name, exact: true })).toBeVisible();
  await expect(page.getByText(card.set.name, { exact: true }).first()).toBeVisible();
}

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`búsqueda Viñeta: ${width}px ${theme}, composición y teclado`, async ({ page, catalog }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('pokescan.theme', value), theme);
      await page.goto('/buscar');
      await expect(page.getByText('Buscá tu primera carta', { exact: true })).toBeVisible();
      const main = page.getByRole('main');
      const heading = main.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText('Buscá tu próximo hallazgo.');
      await expect(heading).toHaveCSS('font-style', 'italic');
      await expect(heading).toHaveCSS('text-transform', 'uppercase');
      await expect(heading).toHaveCSS('font-weight', '800');
      await expect(heading).toHaveCSS('font-size', width > 700 ? '32px' : '26px');
      await expect(main).toHaveCSS('max-width', '1280px');
      await expect(main).toHaveCSS('padding-left', width > 700 ? '32px' : '16px');
      await expect(main).toHaveCSS('font-family', 'system-ui, sans-serif');
      expect(await main.evaluate((element) => getComputedStyle(element.parentElement!).backgroundImage)).toContain('radial-gradient');
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
      const panel = main.getByRole('group', { name: 'Filtros del catálogo' });
      await expect(panel).toHaveCSS('border-top-width', '2px');
      await expect(panel).toHaveCSS('padding', '20px');
      expect(await panel.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.borderTopColor === style.color;
      })).toBe(true);
      expect((await panel.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).split(' ')).toHaveLength(2);
      const input = panel.getByRole('searchbox', { name: 'Buscar por nombre' });
      const inputBounds = (await input.boundingBox())!;
      const panelBounds = (await panel.boundingBox())!;
      expect(inputBounds.width).toBeLessThanOrEqual(480);
      expect(inputBounds.x).toBeGreaterThan(panelBounds.x);
      expect(inputBounds.y).toBeGreaterThan(panelBounds.y);
      expect(inputBounds.x + inputBounds.width).toBeLessThan(panelBounds.x + panelBounds.width);
      expect(inputBounds.y + inputBounds.height).toBeLessThan(panelBounds.y + panelBounds.height);
      await expect(main.getByRole('combobox', { name: 'Colección', exact: true })).toHaveCount(0);
      await expect(main.getByText(/Buscar todavía no filtra por álbum/)).toHaveCount(0);
      const options = main.getByRole('region', { name: 'Más opciones', exact: true });
      await expect(options).toBeVisible();
      await expect(options).toHaveCSS('border-top-width', '2px');
      await expect(options.getByRole('button', { name: 'Artista', exact: true })).toBeVisible();
      const longRarity = options.getByRole('button', { name: 'Special Illustration Rare', exact: true });
      await expect(longRarity).toBeVisible();
      expect(await longRarity.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      const optionsBounds = (await options.boundingBox())!;
      const rarityBounds = (await longRarity.boundingBox())!;
      expect(rarityBounds.x).toBeGreaterThan(optionsBounds.x);
      expect(rarityBounds.x + rarityBounds.width).toBeLessThan(optionsBounds.x + optionsBounds.width);
      const guide = page.getByRole('complementary', { name: 'Explorar con intención', includeHidden: true });
      if (width > 700) {
        await expect(guide).toBeVisible();
        const aside = (await guide.boundingBox())!;
        const right = (await main.getByRole('region', { name: 'Búsqueda y filtros' }).boundingBox())!;
        expect(aside.width).toBe(200);
        expect(right.x - aside.x - aside.width).toBe(32);
        expect(optionsBounds.x).toBe(aside.x);
        expect(optionsBounds.width).toBe(aside.width);
        expect(optionsBounds.y - aside.y - aside.height).toBe(24);
      } else {
        await expect(guide).toBeHidden();
        await expect(panel.locator('label').first()).toHaveCSS('font-size', '13px');
        await expect(panel.locator('label').first()).toHaveCSS('line-height', '18px');
        expect(optionsBounds.y).toBeGreaterThanOrEqual(panelBounds.y + panelBounds.height);
        const results = (await page.getByText('Buscá tu primera carta', { exact: true }).boundingBox())!;
        expect(results.y).toBeGreaterThan(optionsBounds.y + optionsBounds.height);
      }
      const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(await noOverflow()).toBe(true);
      await input.focus();
      await page.keyboard.press('Tab');
      const set = panel.getByRole('combobox', { name: 'Set / expansión' });
      await expect(set).toBeFocused();
      await expect(set).toHaveCSS('outline-width', '2px');
      await page.keyboard.press('Tab');
      await expect(panel.getByRole('combobox', { name: 'Ordenar por' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(panel.getByRole('combobox', { name: 'Sentido' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(panel.getByRole('button', { name: 'Limpiar filtros' })).toBeFocused();
      await expect(main.locator('summary')).toHaveCount(0);
      await options.getByRole('button', { name: 'Artista', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(options.getByRole('button', { name: 'Todas las rarezas', exact: true })).toBeFocused();
      expect(await noOverflow()).toBe(true);
      await input.fill('synthetic');
      await input.press('Enter');
      await expect(page).toHaveURL('/buscar?q=synthetic');
      await expect(panel.getByRole('combobox', { name: 'Ordenar por' })).toBeDisabled();
      await panel.getByRole('button', { name: 'Limpiar filtros' }).click();
      await expect(input).toHaveValue('synthetic');
      await expect(page).toHaveURL('/buscar?q=synthetic');
      await main.getByRole('button', { name: 'Limpiar búsqueda' }).click();
      await expect(page).toHaveURL('/buscar');
      await expect(input).toHaveValue('');
      expect(catalog.writes).toEqual([]);
    });
  }
}

for (const marketPriceUsd of [12.5, null]) {
  for (const width of [390, 1440]) {
    test(`búsqueda precio: ${marketPriceUsd ?? 'ausente'} a ${width}px, pie inferior derecho`, async ({ page, catalog }) => {
      // Valor fabricado sólo para este escenario; no representa una cotización real.
      catalog.marketPriceUsd = marketPriceUsd;
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/buscar?q=synthetic');
      const result = page.getByRole('list', { name: 'Resultados de la búsqueda' }).getByRole('link');
      const footer = result.locator('[data-search-price-footer]');
      const price = footer.locator('[data-search-price-amount]');
      await expect(price).toHaveCount(1);
      if (marketPriceUsd === null) {
        await expect(price.getByLabel('Sin precio')).toHaveText('--');
        await expect(price.getByLabel('Sin precio')).toBeVisible();
      } else {
        // La animación tiene una copia accesible fija y otra visual; medimos su caja común.
        await expect(price.locator('.sr-only')).toHaveCount(1);
        await expect(price.locator('.sr-only')).toHaveText('$12.50');
        const visibleAmount = price.locator('[aria-hidden="true"]');
        await expect(visibleAmount).toHaveCount(1);
        await expect(visibleAmount).toBeVisible();
        await expect(visibleAmount).toHaveText('$12.50');
      }
      // Una sola lectura: la entrada anima la carta y no podemos comparar frames distintos.
      const { art, amount, set, bounds } = await result.evaluate((element) => {
        const rect = (selector: string) => {
          const node = element.querySelector(selector);
          if (!node) throw new Error(`Falta el elemento de precio: ${selector}`);
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        };
        return {
          art: rect('img'),
          amount: rect('[data-search-price-amount]'),
          set: rect('[data-search-price-footer] p'),
          bounds: rect('[data-search-price-footer]'),
        };
      });
      expect(amount.y).toBeGreaterThanOrEqual(art.y + art.height);
      expect(amount.x).toBeGreaterThanOrEqual(set.x + set.width);
      expect(Math.abs(amount.x + amount.width - bounds.x - bounds.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(amount.y + amount.height - bounds.y - bounds.height)).toBeLessThanOrEqual(1);
      expect(await result.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(catalog.writes).toEqual([]);
    });
  }
}

async function fillAdd(page: Page) {
  const add = page.getByRole('button', { name: 'Añadir', exact: true });
  await expect(add.locator('svg.lucide-folder-plus')).toBeVisible();
  await add.click();
  const sheet = page.getByRole('dialog', { name: 'Añadir a colección', exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('combobox', { name: 'Colección', exact: true })).toHaveText('Colección sintética (principal)');
  await sheet.getByRole('combobox', { name: 'Variante', exact: true }).click();
  await page.getByRole('option', { name: 'Holofoil', exact: true }).click();
  await sheet.getByRole('spinbutton', { name: 'Cantidad', exact: true }).fill('3');
  await sheet.getByRole('switch', { name: 'Disponible para intercambio', exact: true }).click();
  await expect(sheet.getByRole('switch')).toBeChecked();
  await sheet.getByRole('button', { name: 'Añadir', exact: true }).click();
  return sheet;
}

for (const [query, mode, title] of [
  ['missing', 'empty', 'Sin resultados para «missing»'],
  ['broken', 'error', 'No pudimos cargar las cartas'],
] as const) {
  test(`búsqueda: ${mode} explícito sin resultados ficticios`, async ({ page, catalog }) => {
    catalog.search = mode;
    await page.goto(`/buscar?q=${query}`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByRole('link').filter({ hasText: card.name })).toHaveCount(0);
    if (mode === 'error') await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible();
    expect(catalog.writes).toEqual([]);
  });
}

test('búsqueda → ficha → alta NM → lectura posterior tras recargar', async ({ page, traffic, catalog }) => {
  traffic.allowLogin = true;
  await login(page);
  await openCard(page);
  const sheet = await fillAdd(page);
  await expect(sheet).not.toBeVisible();
  await expect(page.getByText('Agregada a Colección sintética', { exact: true })).toBeVisible();
  expect(catalog.writes).toEqual([payload]);
  // La recarga descarta el estado optimista: location e items provienen del mock del GET.
  await page.reload();
  const manage = page.getByRole('button', { name: /Administrar/ });
  await expect(manage).toContainText('Holofoil');
  await expect(manage).toContainText('3 copias');
  await manage.click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('spinbutton', { name: 'Cantidad', exact: true })).toHaveValue('3');
  await expect(editor.getByRole('combobox', { name: 'Variante', exact: true })).toHaveText('Holofoil');
  await expect(editor.getByRole('switch', { name: 'Disponible para intercambio', exact: true })).toBeChecked();
  expect(catalog.locationReads.at(-1)).toMatchObject({ collectionId: 'browser-collection', variant: 'holofoil', condition: 'NM', quantity: 3 });
  expect(catalog.itemReads.at(-1)).toEqual([expect.objectContaining({ card, variant: 'holofoil', condition: 'NM', quantity: 3, isForTrade: true })]);
  expect(catalog.writes).toHaveLength(1);
});

test('fallo de alta conserva formulario, no anuncia éxito ni agrega una carta', async ({ page, traffic, catalog }) => {
  traffic.allowLogin = true;
  catalog.failSave = true;
  await login(page);
  await openCard(page);
  const sheet = await fillAdd(page);
  await expect(sheet.getByRole('alert')).toContainText('Guardado sintético no disponible');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('spinbutton', { name: 'Cantidad', exact: true })).toHaveValue('3');
  await expect(sheet.getByRole('combobox', { name: 'Variante', exact: true })).toHaveText('Holofoil');
  await expect(sheet.getByRole('switch')).toBeChecked();
  await expect(page.getByText('Agregada a Colección sintética', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Administrar/ })).toHaveCount(0);
  expect(catalog.writes).toEqual([payload]);
  const reads = catalog.locationReads.length;
  await page.reload();
  await expect.poll(() => catalog.locationReads.length).toBeGreaterThan(reads);
  expect(catalog.locationReads.at(-1)).toBeNull();
  await expect(page.getByRole('button', { name: /Administrar/ })).toHaveCount(0);
  expect(catalog.writes).toEqual([payload]);
});


const editPayload = { quantity: 5, isForTrade: false, notes: 'Nota sintética editada', variant: 'holofoil', condition: 'NM' };

async function openSavedEditor(page: Page) {
  await page.getByRole('button', { name: /Administrar/ }).click();
  const editor = page.getByRole('dialog', { name: card.name, exact: true });
  await expect(editor).toBeVisible();
  return editor;
}

async function editSavedItem(page: Page) {
  const editor = await openSavedEditor(page);
  await editor.getByRole('spinbutton', { name: 'Cantidad', exact: true }).fill('5');
  await editor.getByRole('switch', { name: 'Disponible para intercambio', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Notas', exact: true }).fill(editPayload.notes);
  await expect(editor.getByRole('switch')).not.toBeChecked();
  return editor;
}

for (const outcome of ['éxito', 'cancelación', 'error'] as const) {
  test(`edición guardada: ${outcome} y lectura posterior`, async ({ page, traffic, catalog }) => {
    traffic.allowLogin = true;
    await login(page);
    await openCard(page);
    const add = await fillAdd(page);
    await expect(add).not.toBeVisible();
    expect(catalog.writes).toEqual([payload]);
    const editor = await editSavedItem(page);
    catalog.failSave = outcome === 'error';

    if (outcome === 'cancelación') {
      await editor.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await expect(editor).not.toBeVisible();
    } else {
      await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      if (outcome === 'éxito') {
        await expect(editor).not.toBeVisible();
        await expect(page.getByText('Carta actualizada', { exact: true })).toBeVisible();
      } else {
        await expect(editor.getByRole('alert')).toContainText('Actualización sintética no disponible');
        await expect(editor).toBeVisible();
        await expect(editor.getByRole('spinbutton', { name: 'Cantidad', exact: true })).toHaveValue('5');
        await expect(editor.getByRole('textbox', { name: 'Notas', exact: true })).toHaveValue(editPayload.notes);
        await expect(editor.getByRole('switch')).not.toBeChecked();
      }
    }
    if (outcome !== 'éxito') await expect(page.getByText('Carta actualizada', { exact: true })).toHaveCount(0);
    const expectedWrites = outcome === 'cancelación' ? [payload] : [payload, editPayload];
    expect(catalog.writes).toEqual(expectedWrites);
    const reads = catalog.locationReads.length;
    await page.reload();
    await expect.poll(() => catalog.locationReads.length).toBeGreaterThan(reads);
    const updated = outcome === 'éxito';
    const manage = page.getByRole('button', { name: /Administrar/ });
    await expect(manage).toContainText(updated ? '5 copias' : '3 copias');
    await expect(manage).toContainText('Holofoil');
    const reloaded = await openSavedEditor(page);
    await expect(reloaded.getByRole('spinbutton', { name: 'Cantidad', exact: true })).toHaveValue(updated ? '5' : '3');
    await expect(reloaded.getByRole('textbox', { name: 'Notas', exact: true })).toHaveValue(updated ? editPayload.notes : '');
    await expect(reloaded.getByRole('switch')).toBeChecked({ checked: !updated });
    await expect(reloaded.getByRole('combobox', { name: 'Variante', exact: true })).toHaveText('Holofoil');
    expect(catalog.locationReads.at(-1)).toMatchObject({ collectionId: 'browser-collection', itemId: 'browser-item',
      variant: 'holofoil', condition: 'NM', quantity: updated ? 5 : 3 });
    expect(catalog.itemReads.at(-1)).toEqual([expect.objectContaining({ id: 'browser-item', card,
      quantity: updated ? 5 : 3, isForTrade: !updated, notes: updated ? editPayload.notes : null,
      variant: 'holofoil', condition: 'NM' })]);
    expect(catalog.writes).toEqual(expectedWrites);
  });
}
