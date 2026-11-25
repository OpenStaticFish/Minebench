import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Set GAME_URL to exercise an already-running dev or production preview server.
const dev = process.env.GAME_URL
  ? undefined
  : await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await dev?.listen();
const url = process.env.GAME_URL ?? dev?.resolvedUrls?.local[0];
const executablePath =
  process.env.CHROME_PATH ?? Bun.which('chromium') ?? Bun.which('google-chrome') ?? undefined;
const dir = resolve(process.env.CAPTURE_DIR ?? 'screenshots');
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  if (!url) throw new Error('No local game URL');
  await mkdir(dir, { recursive: true });
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const game = new URL(url);
  if (game.pathname === '/' || game.pathname === '/play') game.pathname = '/play/';
  await page.goto(game.href, { waitUntil: 'networkidle' });
  await page.locator('#landscape[data-ready=true]').waitFor({ timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(dir, 'main-menu.png') });
  await page.getByRole('button', { name: 'Enter world' }).click();
  await page.locator('#overlay[data-screen=play] .belt .chosen').waitFor();
  await page.locator('#landscape[data-ready=true]').waitFor({ timeout: 120000 });
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  await page.screenshot({ path: resolve(dir, 'in-game.png') });
  if (process.argv.includes('--verify')) {
    const expect = async (condition: () => boolean | Promise<boolean>, message: string) => {
      const end = Date.now() + 6000;
      while (Date.now() < end) {
        if (await condition()) return;
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      throw new Error(message);
    };
    await expect(
      () => page.evaluate(() => document.pointerLockElement?.id === 'landscape'),
      'Pointer lock did not engage',
    );
    await page.keyboard.press('Digit3');
    if (!(await page.locator('#selected').innerText()).includes('Shale'))
      throw new Error('Number-key selection failed');
    // Hover just above the ground in flight. Looking down strikes the same
    // column after a break/place pair, without the player falling into it.
    await page.keyboard.press('KeyF');
    await expect(
      async () => (await page.locator('#motion').innerText()).includes('Creative flight'),
      'Flight HUD did not update',
    );
    await page.mouse.move(800, 820);
    // Arrow input is frame-rate independent; hold to reach the vertical pitch limit.
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(1400);
    await page.keyboard.up('ArrowDown');
    const cell = await page.locator('.target-label').getAttribute('data-cell');
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await expect(
      async () => (await page.locator('.target-label').getAttribute('data-cell')) !== cell,
      'Mouse break did not expose the next voxel',
    );
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await expect(
      async () =>
        (await page.locator('.target-label').getAttribute('data-cell')) === cell &&
        (await page.locator('.target-label').innerText()) === 'Shale',
      'Right-click did not restore the voxel using the selected material',
    );
    const coords = await page.locator('#coords').innerText();
    await page.keyboard.down('KeyW');
    await expect(
      async () => (await page.locator('#coords').innerText()) !== coords,
      'No player movement',
    );
    await page.keyboard.up('KeyW');
    const downloaded = page.waitForEvent('download', { timeout: 30000 });
    await page.keyboard.press('KeyP');
    const download = await downloaded;
    if (download.suggestedFilename() !== 'in-game.png' || (await download.failure()))
      throw new Error('P capture failed');
    const file = await download.path();
    if (!file || Bun.file(file).size < 40000) throw new Error('Downloaded frame is empty');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Resume world' }).waitFor();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('#distance').fill('3');
    await page.locator('#sense').fill('1.5');
    if ((await page.locator('#distance-out').textContent()) !== '3 chunks')
      throw new Error('View distance did not change');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Return to title' }).click();
    await page.getByRole('button', { name: 'Field guide' }).click();
    await page.getByRole('heading', { name: 'FIELD GUIDE.' }).waitFor();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.locator('#landscape[data-ready=true]').waitFor();
    const cameraButton = page.getByRole('button', { name: 'Capture screenshot (P)', exact: true });
    await cameraButton.hover();
    const ref = await page.screenshot();
    const result = page.waitForEvent('download');
    await cameraButton.click();
    const menuPNG = await result;
    if (menuPNG.suggestedFilename() !== 'main-menu.png')
      throw new Error('Menu capture was not named correctly');
    const data = Buffer.from(await Bun.file((await menuPNG.path())!).arrayBuffer());
    // Compare small resamples of the actual viewport and the app's downloaded
    // composite. Size alone cannot tell whether fonts, HUD or WebGL are missing.
    const diff = await page.evaluate(
      async (pair) => {
        const rgba = await Promise.all(
          pair.map(async (b64) => {
            const image = new Image();
            image.src = `data:image/png;base64,${b64}`;
            await image.decode();
            const c = document.createElement('canvas');
            c.width = 160;
            c.height = 90;
            const ctx = c.getContext('2d')!;
            ctx.drawImage(image, 0, 0, 160, 90);
            return ctx.getImageData(0, 0, 160, 90).data;
          }),
        );
        let difference = 0;
        for (let i = 0; i < rgba[0]!.length; i++)
          difference += Math.abs(rgba[0]![i]! - rgba[1]![i]!);
        return difference / rgba[0]!.length;
      },
      [ref.toString('base64'), data.toString('base64')],
    );
    if (diff > 8)
      throw new Error(
        `Downloaded menu differs from the viewport (mean channel difference ${diff.toFixed(1)})`,
      );
    console.log(
      'Browser checks passed: pointer lock, selection, flight, look, break/place, movement, PNG download, pause, settings and field guide.',
    );
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Captured real menu and gameplay frames in ${dir}`);
} finally {
  await browser?.close();
  await dev?.close();
}
