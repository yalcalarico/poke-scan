import { test as base, expect, credentials } from './helpers/browser';

const test = base.extend<{ settings: void }>({
  settings: [async ({ context, baseURL, traffic }, use) => {
    void traffic;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== baseURL || request.method() !== 'GET') return route.fallback();
      const document = request.resourceType() === 'document' || request.headers().rsc === '1';
      if (document && url.pathname === '/ajustes'
        && [...url.searchParams.keys()].every((key) => key === '_rsc')) return route.continue();
      if (request.headers().authorization !== 'Bearer synthetic-browser-access-token' || url.search) return route.fallback();
      if (url.pathname === '/api/collections') return route.fulfill({ json: [{
        id: 'settings-album', userId: 'browser-baseline-user', name: 'Álbum sintético de ajustes',
        isDefault: true, itemCount: 0, uniqueCount: 0, duplicateCount: 0,
        totalValueUsd: 0, totalValueArs: null, cover: [], createdAt: '2000-01-01T00:00:00.000Z',
      }] });
      if (url.pathname === '/api/share') return route.fulfill({ json: [] });
      return route.fallback();
    });
    await use();
  }, { auto: true }],
});

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`ajustes Viñeta: ${width}px ${theme}, paneles y controles reales`, async ({ page, traffic }) => {
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
      await page.goto('/ajustes');
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toHaveText('Tu cuenta, en orden.');
      await expect(main.getByRole('heading', { level: 1 })).toHaveCSS('font-style', 'italic');
      await expect(main).toHaveCSS('max-width', '1280px');
      await expect(main).toHaveCSS('font-family', 'system-ui, sans-serif');
      const identity = main.getByRole('region', { name: 'Identidad de la cuenta' });
      await expect(identity).toContainText('Usuario sintético');
      await expect(identity).toContainText(credentials.email);
      await expect(main.getByRole('link', { name: 'Álbum sintético de ajustes' })).toBeVisible();
      const left = main.getByRole('region', { name: 'Cuenta y colecciones' });
      const right = main.getByRole('region', { name: 'Preferencias y privacidad' });
      await expect(left.getByRole('link', { name: 'Editar datos' })).toHaveAttribute('href', '/ajustes/perfil');
      await expect(left.getByRole('link', { name: 'Cambiar clave' })).toHaveAttribute('href', '/ajustes/clave');
      await expect(right.getByText('PRO · Próximamente')).toBeVisible();
      const preferences = right.getByRole('region', { name: 'Preferencias y cuenta', exact: true });
      await expect(preferences.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
      await expect(preferences.getByRole('link', { name: 'Revisar eliminación', exact: true })).toHaveAttribute('href', '/eliminar-cuenta');
      await expect(preferences.getByRole('group', { name: 'Moneda de los precios', exact: true })).toBeVisible();
      await expect(right.getByRole('heading', { name: 'Enlaces compartidos', exact: true })).toBeVisible();
      await expect(right.getByText('Todavía no compartiste tu colección', { exact: true })).toBeVisible();
      const geometry = await main.evaluate((element) => {
        const rect = (selector: string) => {
          const node = element.querySelector(selector);
          if (!node) throw new Error(`Falta ${selector}`);
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        };
        return { identity: rect('[aria-label="Identidad de la cuenta"]'),
          left: rect('[aria-label="Cuenta y colecciones"]'), right: rect('[aria-label="Preferencias y privacidad"]'),
          dots: getComputedStyle(element.parentElement!).backgroundSize,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      expect(geometry.dots).toBe('8px 8px');
      expect(geometry.overflow).toBe(false);
      expect(geometry.left.width).toBe(geometry.right.width);
      if (width > 700) {
        expect(geometry.right.x - geometry.left.x - geometry.left.width).toBe(24);
        expect(geometry.right.y).toBe(geometry.left.y);
      } else {
        expect(geometry.right.x).toBe(geometry.left.x);
        expect(geometry.right.y - geometry.left.y - geometry.left.height).toBe(24);
      }
      expect(geometry.identity.width).toBeGreaterThanOrEqual(geometry.left.width);
      const target = preferences.getByRole('button', { name: theme === 'light' ? 'Oscuro' : 'Claro', exact: true });
      await target.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('html')).toHaveClass(theme === 'light' ? /dark/ : /^(?!.*dark)/);
      await right.locator('summary', { hasText: 'Ver políticas' }).click();
      await expect(right.getByText(/Las políticas legales todavía no están publicadas/)).toBeVisible();
      await expect(main.getByRole('checkbox')).toHaveCount(0);
      await expect(main.getByRole('link', { name: 'Volver', exact: true })).toHaveAttribute('href', '/inicio');
      expect(traffic.login).toBe(1);
    });
  }
}
