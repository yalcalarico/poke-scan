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
  const input = page.getByPlaceholder('Buscá por nombre: Charizard, Pikachu…');
  await input.fill('synthetic');
  await input.press('Enter');
  await expect(page).toHaveURL('/buscar?q=synthetic');
  await expect(input).toHaveValue('synthetic');
  const result = page.getByRole('link').filter({ hasText: card.name });
  await expect(result).toHaveCount(1);
  await result.click();
  await expect(page).toHaveURL(new RegExp(`/carta/${card.id}\\?returnTo=`));
  await expect(page.getByRole('heading', { name: card.name, exact: true })).toBeVisible();
  await expect(page.getByText(card.set.name, { exact: true }).first()).toBeVisible();
}

async function fillAdd(page: Page) {
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
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
