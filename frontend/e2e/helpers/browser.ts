import { test as base, expect, type Locator, type Page } from '@playwright/test';
import type { AuthResponseDto } from '../../types/api';

export const credentials = { email: 'browser-baseline@example.invalid', password: 'synthetic-only-password' };
const token = 'synthetic-browser-access-token';
const auth: AuthResponseDto = {
  accessToken: token,
  user: {
    id: 'browser-baseline-user',
    email: credentials.email,
    username: 'browser-baseline',
    displayName: 'Usuario sintético',
    avatarUrl: null,
    createdAt: '2000-01-01T00:00:00.000Z',
    preferredCurrency: 'USD',
    preferredRateType: null,
  },
};

type Traffic = { allowLogin: boolean; login: number; refresh: number; me: number };

export const test = base.extend<{ traffic: Traffic }>({
  traffic: [async ({ context, baseURL }, runFixture) => {
    const unexpected: string[] = [];
    const traffic: Traffic = { allowLogin: false, login: 0, refresh: 0, me: 0 };
    let signedIn = false;
    await context.routeWebSocket('**/*', (socket) => {
      const url = new URL(socket.url());
      if (url.protocol === 'ws:' && url.host === new URL(baseURL!).host && url.pathname === '/_next/hmr') {
        socket.connectToServer();
      } else {
        unexpected.push(`WebSocket ${url.href}`);
        socket.close();
      }
    });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const headers = request.headers();
      const path = url.pathname;
      const local = url.origin === baseURL;
      const sessionRequest = headers['x-session-request'] === '1';
      if (local && method === 'GET' && path === '/api/currency/usd-ars' && !url.search) {
        await route.fulfill({ status: 404, json: { statusCode: 404, message: 'Conversión deshabilitada' } });
        return;
      }
      if (local && method === 'POST' && path === '/api/auth/login' && !url.search
        && traffic.allowLogin && !signedIn && sessionRequest && !headers.authorization
        && JSON.stringify(request.postDataJSON()) === JSON.stringify(credentials)) {
        signedIn = true;
        traffic.login += 1;
        await route.fulfill({ status: 200, json: auth });
        return;
      }
      if (local && method === 'GET' && path === '/api/users/me' && !url.search && signedIn
        && (!headers.authorization || headers.authorization === `Bearer ${token}`)) {
        traffic.me += 1;
        await route.fulfill(headers.authorization === `Bearer ${token}`
          ? { status: 200, json: auth.user }
          : { status: 401, json: { statusCode: 401, message: 'Unauthorized' } });
        return;
      }
      if (local && method === 'POST' && path === '/api/auth/refresh' && !url.search
        && signedIn && sessionRequest && !headers.authorization && request.postData() === '{}') {
        traffic.refresh += 1;
        await route.fulfill({ status: 200, json: auth });
        return;
      }
      const document = (request.resourceType() === 'document' || headers.rsc === '1')
        && ['/escanear', '/login'].includes(path);
      const asset = path.startsWith('/_next/static/') || path.startsWith('/icons/')
        || ['/favicon.ico', '/manifest.json'].includes(path);
      if (local && method === 'GET' && (document || asset)) {
        await route.continue();
        return;
      }
      unexpected.push(`${method} ${url.href}`);
      await route.abort('blockedbyclient');
    });
    try {
      await runFixture(traffic);
    } finally {
      // Cerramos primero para incluir tráfico tardío; ni un catch de producto lo oculta.
      await Promise.all(context.pages().map((page) => page.close()));
      expect(unexpected, 'Tráfico no permitido (abortado)').toEqual([]);
    }
  }, { auto: true }],
});

export { expect };

export async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('No se alcanzó el control con Tab en 30 pasos');
}

export function compositeOutline(foreground: string, background: string): number[] {
  const parse = (color: string): [number, number, number, number] => {
    const match = color.match(/^(rgb|rgba)\(([^)]+)\)$/);
    const parts = match?.[2].split(',').map((part) => part.trim());
    if (!match || !parts || parts.length !== (match[1] === 'rgba' ? 4 : 3)
      || parts.some((part) => !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(part))) {
      throw new Error(`Formato de color no soportado para contraste: ${color}`);
    }
    const [r, g, b, alpha = 1] = parts.map(Number);
    if (![r, g, b].every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)
      || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      throw new Error(`Color fuera de rango para contraste: ${color}`);
    }
    return [r, g, b, alpha];
  };
  const [r, g, b, alpha] = parse(foreground);
  const [br, bg, bb, backgroundAlpha] = parse(background);
  if (backgroundAlpha !== 1) throw new Error('El contraste requiere una superficie exterior opaca.');
  // Source-over en sRGB codificado; se linealiza después, para calcular luminancia.
  return [r, g, b].map((channel, index) => alpha * channel + (1 - alpha) * [br, bg, bb][index]);
}

export async function expectKeyboardOutline(target: Locator, colorScheme: 'light' | 'dark', forced: boolean) {
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
  const outline = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    // El offset deja el outline sobre la superficie exterior, no sobre el botón.
    let surface = document.elementFromPoint(rect.left - 3, rect.top + rect.height / 2);
    if (!surface || element.contains(surface)) throw new Error('No se encontró la superficie exterior del foco.');
    let background = 'rgba(0, 0, 0, 0)';
    while (surface) {
      const surrounding = getComputedStyle(surface);
      if (surrounding.backgroundImage !== 'none') throw new Error('El contraste requiere componer una imagen de fondo.');
      background = surrounding.backgroundColor;
      if (background !== 'rgba(0, 0, 0, 0)') break;
      surface = surface.parentElement;
    }
    return {
      visible: element.matches(':focus-visible'),
      style: style.outlineStyle,
      width: style.outlineWidth,
      offset: style.outlineOffset,
      color: style.outlineColor,
      background,
    };
  });
  expect(outline.visible).toBe(true);
  expect(outline.style).toBe('solid');
  expect(outline.width).toBe('2px');
  expect(outline.offset).toBe('2px');
  expect(outline.color).not.toBe('rgba(0, 0, 0, 0)');
  const luminance = (channels: number[]) => {
    const [r, g, b] = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ring = luminance(compositeOutline(outline.color, outline.background));
  const surface = luminance(compositeOutline(outline.background, outline.background));
  expect((Math.max(ring, surface) + 0.05) / (Math.min(ring, surface) + 0.05)).toBeGreaterThanOrEqual(3);
  if (!forced) expect(outline.color).toBe(colorScheme === 'dark' ? 'rgb(255, 74, 79)' : 'rgb(224, 31, 38)');
}
