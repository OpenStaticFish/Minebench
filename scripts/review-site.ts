import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { preview } from 'vite';

// Exercise the deployable HTML, not a mocked page. SITE_URL can instead point at dev.
if (!process.env.SITE_URL && !(await Bun.file('dist/index.html').exists())) {
  throw new Error('Run bun run build before reviewing the production site.');
}
const server = process.env.SITE_URL
  ? undefined
  : await preview({
      preview: { host: '127.0.0.1', port: 0, open: false },
      logLevel: 'error',
    });
const url = process.env.SITE_URL ?? server?.resolvedUrls?.local[0];
const out = resolve('out/site-review');
let browser: Browser | undefined;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function checkLayout(page: Page) {
  const issues = await page.evaluate(() => {
    const failures: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) failures.push('horizontal overflow');
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      if (!document.getElementById(link.hash.slice(1))) failures.push(`missing ${link.hash}`);
    }
    for (const img of document.images) if (!img.hasAttribute('alt')) failures.push('missing alt');
    return failures;
  });
  check(!issues.length, issues.join(', '));
}
try {
  check(url, 'No local server URL');
  await mkdir(out, { recursive: true });
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ?? Bun.which('chromium') ?? Bun.which('google-chrome') ?? undefined,
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await checkLayout(page);
  check((await page.locator('h1').count()) === 1, 'Expected one page title');
  check(
    !requests.some((r) => /\/assets\/play-[^/]*\.js|\/three\.js|\/src\/scene\.ts/.test(r)),
    'Homepage loaded the game renderer',
  );
  await page.screenshot({ path: resolve(out, 'desktop.png') });

  const captures = page.locator('.capture-open');
  const n = await captures.count();
  if (n) {
    await captures.first().focus();
    await page.keyboard.press('Enter');
    await page.locator('#viewer[open]').waitFor();
    await page.locator('#viewer-image').evaluate((e: HTMLImageElement) => e.decode());
    if (n > 1) {
      const first = await page.locator('#viewer-title').innerText();
      await page.keyboard.press('ArrowRight');
      check(
        (await page.locator('#viewer-title').innerText()) !== first,
        'Next frame did not change',
      );
    }
    await page.keyboard.press('Escape');
    check(
      await captures.first().evaluate((el) => document.activeElement === el),
      'Viewer did not return keyboard focus',
    );
  }
  // Force below-the-fold assets to finish before taking the full-page evidence.
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const images = [...document.images].filter((img) => img.hasAttribute('src'));
    await Promise.all(
      images.map((img) => {
        img.loading = 'eager';
        return img.decode();
      }),
    );
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: resolve(out, 'full-page.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkLayout(page);
  await page.screenshot({ path: resolve(out, 'mobile.png') });
  await page.locator('#nav-toggle').click();
  await page.locator('#site-nav a[href="#guide"]').click();
  check(new URL(page.url()).hash === '#guide', 'Mobile section navigation failed');
  check(
    (await page.locator('#nav-toggle').getAttribute('aria-expanded')) === 'false',
    'Mobile navigation did not close',
  );
  await page.setViewportSize({ width: 320, height: 640 });
  await checkLayout(page);
  await page.setViewportSize({ width: 900, height: 700 });
  await checkLayout(page);
  await page.getByRole('link', { name: 'Play Bracken Vale', exact: true }).click();
  await page.getByRole('button', { name: 'Enter world' }).waitFor();
  check(new URL(page.url()).pathname === '/play/', 'Play did not open the existing game');
  check(!errors.length, errors.join('\n'));

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJs.newPage();
  await staticPage.goto(url);
  check((await staticPage.locator('#guide kbd').count()) > 0, 'Guide requires JavaScript');
  check(
    (await staticPage.locator('.shot a, .shot .capture-missing').count()) === 2,
    'Missing static gallery or fallback',
  );
  if (n) {
    const fullSize = await staticPage.locator('.capture-open').first().getAttribute('href');
    check(fullSize, 'Missing no-JS gallery link');
    const response = await staticPage.goto(new URL(fullSize, url).href);
    check(
      response?.ok() && response.headers()['content-type']?.includes('image/webp'),
      'No-JS full-size image link failed',
    );
  }
  await noJs.close();
  console.log(
    `Checked desktop/mobile layout, keyboard viewer, static content, links and game launch. Visual review: ${out}`,
  );
} finally {
  await browser?.close();
  if (server) await server.close();
}
