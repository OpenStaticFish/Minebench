import { chromium, expect } from '@playwright/test';

interface State { screen: string; flying: boolean; position: number[]; chunks: number; selected: number; locked: boolean; editedBlocks: number; target: { block: number[]; type: number } | null }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const state = () => page.evaluate(() => (window as unknown as { verdant: { state: State } }).verdant.state);
  await page.goto(`${process.env.GAME_URL || 'http://127.0.0.1:5173'}/play/`);
  await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#menu [data-panel="settings"]').click();
  await page.locator('#distance').fill('2');
  await page.locator('#sensitivity').fill('1.4');
  await expect(page.locator('#distance-value')).toHaveText('2 chunks');
  await page.locator('#close-panel').click();
  await page.locator('#play').click();
  await expect.poll(async () => (await state()).locked).toBe(true);
  await expect.poll(async () => (await state()).chunks).toBe(25);
  const before = (await state()).position;
  await page.keyboard.down('KeyW'); await page.waitForTimeout(450); await page.keyboard.up('KeyW');
  expect((await state()).position).not.toEqual(before);
  await page.keyboard.press('KeyF');
  expect((await state()).flying).toBe(true);
  const y = (await state()).position[1]!;
  await page.keyboard.down('Space');
  await expect.poll(async () => (await state()).position[1]!).toBeGreaterThan(y + .5);
  await page.keyboard.up('Space');
  await page.keyboard.press('Digit7'); expect((await state()).selected).toBe(6);
  // Explicit relative delta avoids headless mouse wrapping under pointer lock.
  // This exercises the same mouse-look listener while the pointer is locked.
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementY: 700, movementX: 0 })));
  await expect.poll(async () => (await state()).target !== null).toBe(true);
  const hitBefore = (await state()).target;
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 0 })));
  await expect.poll(async () => (await state()).editedBlocks).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  expect((await state()).target).not.toEqual(hitBefore);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 2 })));
  await expect.poll(async () => (await state()).target?.type).toBe(8); // Terracotta
  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('KeyP');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('in-game-world.png');
  await page.keyboard.press('Escape');
  await expect(page.locator('#paused')).toBeVisible();
  expect((await state()).locked).toBe(false);
  await page.locator('#resume').click();
  await expect.poll(async () => (await state()).locked).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('#return-menu').click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.setViewportSize({ width: 640, height: 640 });
  await expect(page.locator('#play')).toBeInViewport();
  expect(errors).toEqual([]);
  console.log('Browser smoke passed: settings, pointer lock, movement, flight, selection, break/place, PNG download, pause/resume, menu, small viewport.');
} finally { await browser.close(); }
