import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const tmp = path.dirname(new URL(import.meta.url).pathname);
const own = JSON.parse(fs.readFileSync(path.join(tmp, 'ownership.json'), 'utf8'));
if (own.owner !== '/root/adquisicion_review_sol') throw new Error('OWNER_MISMATCH');
const ann = own.annex;
const root = own.root;
const base = 'http://127.0.0.1:3000';
const requireFrontend = createRequire(path.join(root, 'frontend/package.json'));
const { JSDOM } = requireFrontend('jsdom');
const requireRuntime = createRequire('/Users/ysmaelalcalarico/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = requireRuntime('playwright');
const checks = [];
const failures = [];
const browserErrors = [];
const externalBlocks = [];
let nextChild;
let browserServer;
let browser;
let phase = 'start';
let exitCode = 0;
const save = (name, value) => fs.writeFileSync(path.join(ann, name), JSON.stringify(value, null, 2) + '\n');
const persistOwn = () => {
  fs.writeFileSync(path.join(tmp, 'ownership.json'), JSON.stringify(own, null, 2) + '\n');
  save('ownership.json', own);
};
const record = (id, passed, details) => {
  if (checks.some(check => check.id === id)) throw new Error('DUPLICATE_CHECK');
  checks.push({ id, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
  save('runtime-checks.json', checks);
};
async function free(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.on('connect', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(true); });
  });
}
async function localFetch(url, options) {
  const target = new URL(url, base);
  if (target.origin !== base) throw new Error('NON_LOCAL_TARGET');
  return fetch(target, options);
}
function headOf(html) {
  const document = new JSDOM(html).window.document;
  const values = (selector, attribute) => [...document.querySelectorAll(selector)].map(element => element.getAttribute(attribute));
  return {
    title: document.title,
    description: values('meta[name="description"]', 'content'),
    canonical: values('link[rel="canonical"]', 'href'),
    og: Object.fromEntries(['title', 'description', 'url', 'type', 'site_name', 'locale', 'image', 'image:alt', 'image:width', 'image:height', 'image:type'].map(key => [key, values(`meta[property="og:${key}"]`, 'content')])),
    twitter: Object.fromEntries(['card', 'title', 'description', 'image', 'image:alt'].map(key => [key, values(`meta[name="twitter:${key}"]`, 'content')])),
  };
}
const expected = {
  '/': {
    title: 'Tu colección Pokémon, ordenada carta por carta · PokéScan',
    description: 'Buscá cartas, organizá tus sets y tené a mano tus duplicadas. Consultá referencias en USD o convertidas a ARS cuando hay datos.',
  },
  '/faq': {
    title: 'Preguntas frecuentes · PokéScan',
    description: 'Cómo funciona el reconocimiento visual, de dónde salen las referencias de mercado y qué está disponible sin suscripción.',
  },
};
const expectedAlt = 'PokéScan: buscar cartas Pokémon, organizar colecciones y consultar referencias de mercado.';
async function browserContext(width, theme) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme, reducedMotion: 'reduce' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    const local = ['127.0.0.1', 'localhost', '[::1]'];
    let blocked = !local.includes(url.hostname);
    if (url.pathname === '/_next/image' && url.searchParams.has('url')) {
      blocked ||= !local.includes(new URL(url.searchParams.get('url'), url).hostname);
    }
    if (blocked) {
      externalBlocks.push({ role: 'browser', indirectImage: url.pathname === '/_next/image' });
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(themeValue => localStorage.setItem('pokescan.theme', themeValue), theme);
  return context;
}
async function layout(page) {
  return page.evaluate(() => {
    const target = document.querySelector('main');
    const outliers = [...document.querySelectorAll('main h1,main h2,main h3,main p,main li,main a,main summary')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width && (box.left < -1 || box.right > innerWidth + 1);
    }).map(element => ({ tag: element.tagName, text: element.textContent.trim().slice(0, 90) }));
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth, outliers, mainId: target?.id, h1Count: document.querySelectorAll('main h1').length, dark: document.documentElement.classList.contains('dark'), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, paddingTop: getComputedStyle(document.querySelector('header')).paddingTop, paddingBottom: getComputedStyle(document.querySelector('footer')).paddingBottom };
  });
}
async function focusStyle(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    return { id: element.id, tag: element.tagName, text: element.textContent.trim().slice(0, 80), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, focusVisible: element.matches(':focus-visible') };
  });
}
try {
  if (!(await free(3000)) || !(await free(3001))) throw new Error('RUNTIME_PORT_NOT_FREE');
  const nextLog = fs.openSync(path.join(ann, 'next-runtime.log'), 'w');
  nextChild = spawn('node', ['--import', path.join(tmp, 'network-guard.mjs'), path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'start', path.join(root, 'frontend'), '--hostname', '127.0.0.1', '--port', '3000'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3001/api', NEXT_PUBLIC_SITE_URL: base, API_INTERNAL_URL: 'http://127.0.0.1:1/api' },
    stdio: ['ignore', nextLog, nextLog],
  });
  fs.closeSync(nextLog);
  own.processes.push({ role: 'next', pid: nextChild.pid, parentPID: process.pid, root, port: 3000, guard: path.join(tmp, 'network-guard.mjs') });
  own.liveResources.push('runtime-next');
  persistOwn();
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await localFetch('/faq')).ok; } catch {}
    if (ready) break;
    if (nextChild.exitCode !== null) throw new Error('NEXT_EXITED_BEFORE_READY');
    await delay(200);
  }
  if (!ready) throw new Error('NEXT_READY_TIMEOUT');
  record('next-production-listener', true, { pid: nextChild.pid, base, apiListenerAbsent: await free(3001) });
  browserServer = await chromium.launchServer({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, host: '127.0.0.1', artifactsDir: path.join(tmp, 'browser-artifacts') });
  browser = await chromium.connect(browserServer.wsEndpoint());
  const browserProcess = browserServer.process();
  own.processes.push({ role: 'browser', pid: browserProcess.pid, parentPID: process.pid, privateTemporaryProfile: true, executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  own.liveResources.push('runtime-browser');
  persistOwn();

  phase = 'head-and-png';
  const observed = [];
  const imageUrls = new Set();
  for (const route of ['/', '/faq']) {
    for (const [agent, userAgent] of [['browser', 'Mozilla/5.0'], ['twitterbot', 'Twitterbot/1.0'], ['whatsapp', 'WhatsApp/2.23.20']]) {
      const response = await localFetch(route, { headers: { 'User-Agent': userAgent } });
      const html = await response.text();
      const slug = route === '/' ? 'landing' : 'faq';
      fs.writeFileSync(path.join(ann, `${slug}-${agent}.html`), html);
      const head = headOf(html);
      const exp = expected[route];
      observed.push({ route, agent, status: response.status, head });
      record(`head-${slug}-${agent}`, response.status === 200 && head.title === exp.title && head.description.length === 1 && head.description[0] === exp.description && head.canonical.length === 1 && head.canonical[0] === base + route && head.og.title[0] === exp.title && head.og.description[0] === exp.description && head.og.url[0] === base + route && head.og.type[0] === 'website' && head.og.site_name[0] === 'PokéScan' && head.og.locale[0] === 'es_AR' && head.twitter.card[0] === 'summary_large_image' && head.twitter.title[0] === exp.title && head.twitter.description[0] === exp.description);
      const imagesOkay = head.og.image.length === 1 && head.twitter.image.length === 1 && head.og.image[0] === base + '/opengraph-image' && head.twitter.image[0] === base + '/opengraph-image' && head.og['image:alt'][0] === expectedAlt && head.twitter['image:alt'][0] === expectedAlt && head.og['image:width'][0] === '1200' && head.og['image:height'][0] === '630' && head.og['image:type'][0] === 'image/png';
      record(`image-head-${slug}-${agent}`, imagesOkay);
      for (const url of [...head.og.image, ...head.twitter.image]) imageUrls.add(url);
    }
  }
  save('served-heads.json', observed);
  const servedImages = [];
  for (const url of imageUrls) {
    const response = await localFetch(url);
    const bytes = Buffer.from(await response.arrayBuffer());
    const signature = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    const size = signature ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : {};
    fs.writeFileSync(path.join(ann, 'served-opengraph.png'), bytes);
    const row = { url, status: response.status, contentType: response.headers.get('content-type'), byteLength: bytes.length, ...size };
    servedImages.push(row);
    record('served-png', response.status === 200 && row.contentType?.startsWith('image/png') && signature && size.width === 1200 && size.height === 630, row);
  }
  save('served-images.json', servedImages);

  phase = 'qa';
  const observations = [];
  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark']) {
      for (const route of ['/', '/faq']) {
        const slug = route === '/' ? 'landing' : 'faq';
        const key = `${slug}-${width}-${theme}`;
        const context = await browserContext(width, theme);
        const page = await context.newPage();
        page.on('pageerror', error => browserErrors.push({ key, role: 'pageerror', message: error.message.slice(0, 180) }));
        page.on('requestfailed', request => failures.push({ key, role: 'requestfailed', path: new URL(request.url()).pathname, cause: request.failure()?.errorText }));
        await page.goto(base + route, { waitUntil: 'networkidle' });
        await page.locator('main h1').waitFor();
        const before = await layout(page);
        observations.push({ key, layout: before });
        record(`layout-${key}`, before.scrollWidth <= before.innerWidth && before.outliers.length === 0 && before.mainId === 'contenido' && before.h1Count === 1 && before.dark === (theme === 'dark') && before.reduced, before);
        await page.screenshot({ path: path.join(ann, `${key}.png`), fullPage: true });
        await page.keyboard.press('Tab');
        const skipFocus = await focusStyle(page);
        record(`skip-focus-${key}`, skipFocus.text === 'Saltar al contenido' && skipFocus.focusVisible && skipFocus.outlineStyle !== 'none' && parseFloat(skipFocus.outlineWidth) > 0, skipFocus);
        await page.keyboard.press('Enter');
        record(`skip-target-${key}`, await page.evaluate(() => location.hash === '#contenido' && document.querySelector('#contenido')?.tagName === 'MAIN' && document.activeElement?.id === 'contenido'), await focusStyle(page));

        const summary = page.locator('#faq-planes');
        await summary.focus();
        await page.keyboard.press('Enter');
        record(`faq-keyboard-open-${key}`, await summary.evaluate(element => element.parentElement.open));
        const summaryFocus = await focusStyle(page);
        record(`faq-visible-focus-${key}`, summaryFocus.id === 'faq-planes' && summaryFocus.focusVisible && parseFloat(summaryFocus.outlineWidth) > 0, summaryFocus);
        record(`faq-copy-free-pro-${key}`, await page.getByText(/Hoy no hay plan Pro activo ni pagos/).isVisible() && await page.getByText(/exportación CSV básica están disponibles sin suscripción/).isVisible());
        await page.keyboard.press('Enter');
        record(`faq-keyboard-close-${key}`, !(await summary.evaluate(element => element.parentElement.open)));
        await summary.click();
        record(`faq-click-open-${key}`, await summary.evaluate(element => element.parentElement.open));
        await page.screenshot({ path: path.join(ann, `${key}-faq-open.png`), fullPage: true });
        await summary.click();
        record(`faq-click-close-${key}`, !(await summary.evaluate(element => element.parentElement.open)));
        if (route === '/') {
          record(`landing-fallback-${width}-${theme}`, await page.getByText('Buscá. Revisá. Coleccioná.').isVisible());
          const hrefs = await page.locator('main a').evaluateAll(elements => elements.map(element => ({ text: element.textContent.trim(), href: element.getAttribute('href') })));
          const hrefOkay = hrefs.filter(item => item.text === 'Explorar el catálogo').every(item => item.href === '/buscar') && hrefs.some(item => item.text === 'Probar PokéScan' && item.href === '/escanear') && hrefs.some(item => item.text === 'Ver qué estamos investigando' && item.href === '/faq#faq-planes');
          record(`landing-cta-hrefs-${width}-${theme}`, hrefOkay, hrefs);
          const currency = await page.getByText('La fecha indica cuándo se consultó el dato.', { exact: false }).evaluate(element => {
            const style = getComputedStyle(element);
            let ancestor = element;
            while (ancestor && getComputedStyle(ancestor).backgroundColor === 'rgba(0, 0, 0, 0)') ancestor = ancestor.parentElement;
            return { color: style.color, background: getComputedStyle(ancestor).backgroundColor, text: element.textContent.trim() };
          });
          const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
          const a = luminance(currency.color), b = luminance(currency.background);
          currency.ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          record(`currency-qualified-contrast-${width}-${theme}`, currency.ratio >= 4.5 && currency.text.includes('no ajusta automáticamente'), currency);
          await page.getByRole('link', { name: 'Ver qué estamos investigando' }).click();
          await page.waitForURL(base + '/faq#faq-planes');
          record(`pro-anchor-navigation-${width}-${theme}`, await page.locator('#faq-planes').count() === 1 && new URL(page.url()).hash === '#faq-planes');
          await page.goto(base + '/', { waitUntil: 'networkidle' });
        }
        await page.evaluate(() => document.documentElement.style.zoom = '2');
        const zoom = await layout(page);
        observations.push({ key, zoom200: zoom });
        record(`zoom200-${key}`, zoom.scrollWidth <= zoom.innerWidth && zoom.outliers.length === 0, zoom);
        await page.screenshot({ path: path.join(ann, `${key}-zoom200.png`), fullPage: true });
        await context.close();
      }
    }
  }
  save('qa-observations.json', observations);
  save('browser-request-failures.json', failures);
  save('browser-page-errors.json', browserErrors);
  save('browser-external-blocks.json', externalBlocks);
  record('browser-no-external-attempts', externalBlocks.length === 0, { blocked: externalBlocks.length });
  record('browser-no-page-errors', browserErrors.length === 0, { errors: browserErrors.length });
  const guardLog = path.join(tmp, 'next-external-blocked.jsonl');
  const nextBlocks = fs.existsSync(guardLog) ? fs.readFileSync(guardLog, 'utf8').trim().split('\n').filter(Boolean).map(row => JSON.parse(row)) : [];
  save('next-external-blocks.json', nextBlocks);
  record('next-no-external-attempts', nextBlocks.length === 0, { blocked: nextBlocks.length });
  record('api-stays-off', await free(3001));
  exitCode = checks.every(check => check.passed) ? 0 : 1;
} catch (error) {
  exitCode = 1;
  save('runtime-error.json', { phase, name: error.name, message: error.message, stack: error.stack });
} finally {
  phase = 'cleanup';
  if (browser) await browser.close();
  if (browserServer) {
    const entry = own.processes.find(process => process.role === 'browser');
    const actual = browserServer.process();
    if (entry && actual.pid === entry.pid) await browserServer.close();
    own.liveResources = own.liveResources.filter(role => role !== 'runtime-browser');
  }
  if (nextChild && nextChild.exitCode === null) {
    const entry = own.processes.find(process => process.role === 'next');
    const parent = Number(execFileSync('ps', ['-p', String(nextChild.pid), '-o', 'ppid='], { encoding: 'utf8' }).trim());
    if (entry.pid !== nextChild.pid || entry.parentPID !== parent || parent !== process.pid) throw new Error('NEXT_PROCESS_OWNER_MISMATCH');
    nextChild.kill('SIGTERM');
    for (let attempt = 0; attempt < 30 && nextChild.exitCode === null; attempt++) await delay(100);
    if (nextChild.exitCode === null) nextChild.kill('SIGKILL');
  }
  own.liveResources = own.liveResources.filter(role => role !== 'runtime-next');
  persistOwn();
  save('runtime-result.json', { exitCode, checks: checks.length, passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed).length, phase, runtimeResourcesClosed: true, nextPortFree: await free(3000), apiPortFree: await free(3001) });
  console.log(JSON.stringify({ runtimeExitCode: exitCode, checks: checks.length, passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed).length }));
  process.exitCode = exitCode;
}
