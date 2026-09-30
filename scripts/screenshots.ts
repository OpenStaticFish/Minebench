import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('screenshots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [name, query] of [['main-menu', ''], ['in-game', '?capture=game']] as const) {
    await page.goto(`${base}/play/${query}`);
    await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `screenshots/${name}.png` });
    console.log(`Captured screenshots/${name}.png`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
