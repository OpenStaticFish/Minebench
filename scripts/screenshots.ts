import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({
  args: [
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const server = Bun.spawn(
  [
    "bun",
    "run",
    process.env.WILDMERE_PREVIEW ? "preview" : "dev",
    "--port",
    "4175",
    "--strictPort",
  ],
  { stdout: "ignore", stderr: "pipe" },
);
type State = {
  screen: string;
  flying: boolean;
  position: number[];
  selected: number;
  chunks: number;
  edits: number;
  target?: number[];
  placement?: number[];
  calls: number;
};
declare global {
  interface Window {
    __wildmere: {
      ready: boolean;
      state: State;
      blockAt(x: number, y: number, z: number): number;
    };
  }
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://localhost:4175")).ok) break;
    } catch {
      /* Vite is starting. */
    }
    await Bun.sleep(100);
  }
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("wildmere-settings"))
      localStorage.setItem(
        "wildmere-settings",
        JSON.stringify({ distance: 6, sensitivity: 1 }),
      );
  });
  await page.goto("http://localhost:4175/play/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__wildmere?.ready, null, {
    timeout: 120000,
  });
  await page.evaluate(() => document.fonts.ready);
  await mkdir("screenshots", { recursive: true });
  await page.screenshot({ path: "screenshots/main-menu.png" });
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#distance")).toHaveValue("12");
  await expect(page.locator("#distance")).toHaveAttribute("max", "24");
  expect(
    (await page.evaluate(() => window.__wildmere.state)).chunks,
  ).toBeGreaterThan(450);
  await page.locator("#sensitivity").fill("1.2");
  await expect(page.locator("#sensitivity-value")).toHaveText("1.2×");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.locator("#play").click();
  await page.waitForFunction(() => document.pointerLockElement !== null);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "screenshots/in-game.png" });
  await expect(page.locator("#hud")).toBeVisible();
  const before = await page.evaluate(() => window.__wildmere.state);
  await page.keyboard.press("Digit4");
  expect((await page.evaluate(() => window.__wildmere.state)).selected).toBe(3);
  // Feed relative input through the same mouse-look listener; absolute mouse warps
  // behave differently across headless Linux window managers under pointer lock.
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent("mousemove", { movementY: 440 })),
  );
  await page.waitForFunction(
    () => window.__wildmere.state.target !== undefined,
  );
  let state = await page.evaluate(() => window.__wildmere.state);
  expect(state.target).toBeDefined();
  const editsBefore = state.edits;
  const broken = state.target!;
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent("mousedown", { button: 0 })),
  );
  await page.waitForTimeout(150);
  await page.waitForFunction(
    () => window.__wildmere.state.placement !== undefined,
  );
  state = await page.evaluate(() => window.__wildmere.state);
  expect(state.edits).toBeGreaterThan(editsBefore);
  expect(
    await page.evaluate(
      (p) => window.__wildmere.blockAt(p[0]!, p[1]!, p[2]!),
      broken,
    ),
  ).toBe(0);
  const placed = state.placement!;
  expect(placed).toBeDefined();
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent("mousedown", { button: 2 })),
  );
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(
      (p) => window.__wildmere.blockAt(p[0]!, p[1]!, p[2]!),
      placed,
    ),
  ).toBe(4);
  // Send rapid taps together so software-renderer stalls cannot stretch the gesture.
  await page.evaluate(() => {
    for (let i = 0; i < 2; i++) {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    }
  });
  expect((await page.evaluate(() => window.__wildmere.state)).flying).toBe(
    true,
  );
  await page.evaluate(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Space", repeat: true }),
    ),
  );
  expect((await page.evaluate(() => window.__wildmere.state)).flying).toBe(
    true,
  );
  await page.keyboard.down("Space");
  await page.waitForFunction(
    (y) => window.__wildmere.state.position[1]! > y + 3,
    before.position[1]!,
  );
  await page.keyboard.up("Space");
  const flight = await page.evaluate(() => window.__wildmere.state);
  expect(flight.flying).toBe(true);
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    (z) => window.__wildmere.state.position[2]! < z - 0.5,
    flight.position[2]!,
  );
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    for (let i = 0; i < 2; i++) {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    }
  });
  expect((await page.evaluate(() => window.__wildmere.state)).flying).toBe(
    false,
  );
  await page.keyboard.press("KeyF");
  expect((await page.evaluate(() => window.__wildmere.state)).flying).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#paused")).toBeVisible();
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .last()
    .click();
  const oldChunks = (await page.evaluate(() => window.__wildmere.state)).chunks;
  await page.locator("#distance").fill("24");
  await page.waitForFunction(() => window.__wildmere.ready, null, {
    timeout: 120000,
  });
  expect(
    (await page.evaluate(() => window.__wildmere.state)).chunks,
  ).toBeGreaterThan(1800);
  await page.locator("#distance").fill("2");
  await page.waitForFunction(() => window.__wildmere.ready);
  expect(
    (await page.evaluate(() => window.__wildmere.state)).chunks,
  ).toBeLessThan(oldChunks);
  await page.getByRole("button", { name: "Close settings" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#photo").click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "wildmere-photo.png",
  );
  await page.locator("#resume").click();
  await page.waitForFunction(() => document.pointerLockElement !== null);
  await expect(page.locator("#hud")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#paused")).toBeVisible();
  await page.locator("#main-menu").click();
  await expect(page.locator("#menu")).toBeVisible();
  await page.setViewportSize({ width: 640, height: 720 });
  await expect(page.locator("#play")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS: menu, pointer lock, HUD, flight, movement, hotbar, breaking, placement, pause/resume, settings, photo download, small viewport; no browser errors.",
  );
  console.log(
    "Real screenshots saved: screenshots/main-menu.png, screenshots/in-game.png",
  );
  console.log(
    `Initial draw calls: ${before.calls}; rendered chunks: ${before.chunks}`,
  );
} finally {
  await browser.close();
  server.kill();
}
