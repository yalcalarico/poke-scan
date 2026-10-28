import { test, expect, credentials, tabTo, expectKeyboardOutline, compositeOutline } from './helpers/browser';

test('compone los dos Highlight RGBA observados sobre superficies opacas', () => {
  expect(compositeOutline('rgba(5, 0, 73, 0.8)', 'rgb(255, 255, 255)')).toEqual([
    expect.closeTo(55, 10), expect.closeTo(51, 10), expect.closeTo(109.4, 10),
  ]);
  expect(compositeOutline('rgba(0, 230, 255, 0.8)', 'rgb(0, 0, 0)')).toEqual([0, 184, 204]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const forced of [false, true]) {
    test(`teclado del escáner: ${colorScheme}, forced-colors=${forced}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, forcedColors: forced ? 'active' : 'none' });
      await page.goto('/escanear');
      if (forced) {
        test.skip(!await page.evaluate(() => matchMedia('(forced-colors: active)').matches),
          'El navegador no soporta forced-colors');
      }
      await expect(page.locator('html')).toHaveClass(colorScheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      await expect(page.getByText('Iniciá sesión para reconocer cartas', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Escanear carta', exact: true })).toHaveCount(0);
      for (const name of ['Subir una foto', 'Buscar a mano']) {
        const button = page.getByRole('button', { name, exact: true });
        await tabTo(page, button);
        await expectKeyboardOutline(button, colorScheme, forced);
      }
      await page.keyboard.press('Shift+Tab');
      await expect(page.getByRole('button', { name: 'Subir una foto', exact: true })).toBeFocused();
    });
  }
}

test('subida anónima requiere login antes de abrir archivos o reconocer', async ({ page, traffic }) => {
  let choosers = 0;
  page.on('filechooser', () => { choosers += 1; });
  await page.goto('/escanear');
  await expect(page.getByText('Iniciá sesión para reconocer cartas', { exact: true })).toBeVisible();
  await tabTo(page, page.getByRole('button', { name: 'Subir una foto', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/login?next=escanear');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(choosers).toBe(0);
  expect(traffic).toEqual({ allowLogin: false, login: 0, refresh: 0, me: 0 });
});

test('login sintético vuelve al escáner y restaura la sesión al recargar', async ({ page, traffic }) => {
  traffic.allowLogin = true;
  await page.goto('/escanear');
  await expect(page.getByText('Iniciá sesión para reconocer cartas', { exact: true })).toBeVisible();
  await tabTo(page, page.getByRole('button', { name: 'Subir una foto', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/login?next=escanear');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(traffic).toEqual({ allowLogin: true, login: 0, refresh: 0, me: 0 });
  const email = page.getByRole('textbox', { name: 'Email (obligatorio)', exact: true });
  // Un input password no tiene rol implícito: se busca por su nombre accesible real.
  const password = page.getByLabel(/^Contraseña\s/);
  await expect(password).toHaveAccessibleName('Contraseña (obligatorio)');
  await email.fill(credentials.email);
  await password.fill(credentials.password);
  await expect(email).toHaveValue(credentials.email);
  await expect(password).toHaveValue(credentials.password);
  await expect(password).toHaveAttribute('type', 'password');
  await tabTo(page, page.getByRole('button', { name: 'Entrar', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/escanear');
  await expect(page.getByRole('heading', { name: 'Reconocer una carta', exact: true })).toBeVisible();
  await expect(page.getByText('Iniciá sesión para reconocer cartas', { exact: true })).toHaveCount(0);
  expect(traffic).toEqual({ allowLogin: true, login: 1, refresh: 0, me: 0 });
  const restored = page.waitForResponse((response) =>
    response.url().endsWith('/api/users/me') && response.status() === 200);
  await page.reload();
  await restored;
  // La recarga pierde el bearer en memoria: /me 401 → refresh → /me con bearer.
  await expect.poll(() => traffic.refresh).toBe(1);
  await expect.poll(() => traffic.me).toBeGreaterThanOrEqual(2);
  const upload = page.getByRole('button', { name: 'Subir una foto', exact: true });
  await tabTo(page, upload);
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles([]);
  await expect(page).toHaveURL('/escanear');
  await expect(page.getByText('Iniciá sesión para reconocer cartas', { exact: true })).toHaveCount(0);
  expect(traffic.login).toBe(1);
  expect(traffic.refresh).toBe(1);
});
