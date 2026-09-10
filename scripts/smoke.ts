import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { startStaticServer } from "./staticServer";

/**
 * End-to-end smoke test. Drives the real production build in headless Chromium
 * with real keyboard/mouse input and verifies the core gameplay loop:
 * loading, chunk streaming, raycast targeting, block break/place, flight toggle,
 * pause/resume and live view-distance changes.
 *
 * Usage: bun run smoke [--skip-build]
 */

const GAME_SEED = "20260910";

let failures = 0;

function check(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✔ ${message}`);
  } else {
    failures++;
    console.error(`  ✖ ${message}`);
  }
}

async function build(): Promise<void> {
  if (process.argv.includes("--skip-build")) {
    console.log("• Skipping build (--skip-build)");
    return;
  }
  console.log("• Building production bundle…");
  const proc = Bun.spawn(["bunx", "vite", "build"], { stdout: "inherit", stderr: "inherit" });
  if ((await proc.exited) !== 0) {
    console.error("vite build failed");
    process.exit(1);
  }
}

async function launch(): Promise<Browser> {
  const args = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-sandbox",
    "--no-sandbox",
  ];
  try {
    return await chromium.launch({ args });
  } catch {
    return await chromium.launch({ channel: "chrome", args });
  }
}

async function waitForState(page: Page, state: string, timeout = 60_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (expected) => {
        const api = window.cubewild;
        return Boolean(api && api.ready && api.state === expected && api.pendingChunks === 0);
      },
      state,
      { timeout, polling: 200 },
    );
    return true;
  } catch {
    return false;
  }
}

async function status(page: Page): Promise<{
  state: string;
  pending: number;
  rendered: number;
  flat: { x: number; y: number; z: number };
  flying: boolean;
  target: { x: number; y: number; z: number } | null;
  selected: number;
}> {
  return page.evaluate(() => {
    const api = window.cubewild;
    if (!api) throw new Error("debug API missing");
    return {
      state: api.state,
      pending: api.pendingChunks,
      rendered: api.renderedChunks,
      flat: api.playerPosition(),
      flying: api.isFlying(),
      target: api.target(),
      selected: api.selectedBlock(),
    };
  });
}

async function main(): Promise<void> {
  await build();
  const server = startStaticServer(resolve("dist"), 0);
  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    baseURL: server.url,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`  [page error] ${error.message}`));

  try {
    console.log("• Loading the game…");
    await page.goto(`/?seed=${GAME_SEED}`, { waitUntil: "domcontentloaded" });
    const reachedMenu = await page
      .waitForFunction(() => window.cubewild?.ready && window.cubewild.state === "menu", null, {
        timeout: 60_000,
        polling: 200,
      })
      .then(() => true)
      .catch(() => false);
    check(reachedMenu, "game boots, generates terrain and reaches the main menu");

    // Click Play with real mouse input: the menu must be hit-testable
    // (screens start with pointer-events disabled while hidden).
    await page.getByRole("button", { name: "Play", exact: true }).click();
    check(
      await waitForState(page, "playing"),
      "clicking Play with the mouse starts the game",
    );

    // Interaction checks run without pointer lock: CDP-driven mouse events
    // inject synthetic movement deltas while locked, which is a test-harness
    // artifact. Reload and start via the debug API, equivalent to a player who
    // has not locked the pointer yet.
    await page.goto(`/?seed=${GAME_SEED}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.cubewild?.ready && window.cubewild.state === "menu",
      null,
      { timeout: 60_000, polling: 200 },
    );
    await page.evaluate((seed) => window.cubewild?.startGame(seed), Number(GAME_SEED));
    check(await waitForState(page, "playing"), "game restarts for interaction checks");

    const initial = await status(page);
    check(initial.rendered > 20, `chunk meshes are rendered (${initial.rendered} chunks)`);
    check(initial.pending === 0, "chunk streaming settles to zero pending builds");

    // ---- Raycast + block breaking -------------------------------------------
    const bx = Math.floor(initial.flat.x);
    const feetY = Math.floor(initial.flat.y) - 1;
    const bz = Math.floor(initial.flat.z);
    const groundBlock = await page.evaluate(
      ([x, y, z]) => window.cubewild?.getBlock(x as number, y as number, z as number),
      [bx, feetY, bz],
    );
    check(
      typeof groundBlock === "number" && groundBlock !== 0,
      `block below the player is solid (id ${groundBlock})`,
    );

    // Choose a solid neighbour block at the player's foot level to edit.
    let target: { x: number; y: number; z: number } | null = null;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ]) {
      const candidate = { x: bx + (dx as number), y: feetY, z: bz + (dz as number) };
      const id = await page.evaluate(
        ([x, y, z]) => window.cubewild?.getBlock(x as number, y as number, z as number),
        [candidate.x, candidate.y, candidate.z],
      );
      if (typeof id === "number" && id !== 0 && id !== 11) {
        target = candidate;
        break;
      }
    }
    check(target !== null, "found a neighbouring solid block to edit");

    if (target) {
      await page.evaluate(
        ([x, y, z]) => window.cubewild?.lookAt((x as number) + 0.5, (y as number) + 0.5, (z as number) + 0.5),
        [target.x, target.y, target.z],
      );
      await page.waitForTimeout(200);
      const aimed = await status(page);
      check(
        aimed.target !== null &&
          aimed.target.x === target.x &&
          aimed.target.y === target.y &&
          aimed.target.z === target.z,
        "camera raycast targets the aimed block",
      );

      await page.mouse.down({ button: "left" });
      await page.waitForTimeout(120);
      await page.mouse.up({ button: "left" });
      const afterBreak = await page.evaluate(
        ([x, y, z]) => window.cubewild?.getBlock(x as number, y as number, z as number),
        [target.x, target.y, target.z],
      );
      check(afterBreak === 0, "left click breaks the targeted block and updates world data");

      // ---- Block placing -----------------------------------------------------
      await page.mouse.down({ button: "right" });
      await page.waitForTimeout(240);
      await page.mouse.up({ button: "right" });
      const afterPlace = await page.evaluate(
        ([x, y, z]) => window.cubewild?.getBlock(x as number, y as number, z as number),
        [target.x, target.y, target.z],
      );
      check(afterPlace === 1, "right click places the selected block (grass) back into the hole");
    }

    // ---- Hotbar selection ----------------------------------------------------
    await page.keyboard.press("Digit3");
    const slot = await status(page);
    check(slot.selected === 3, "number keys select hotbar blocks (stone)");

    // ---- Flight toggle -------------------------------------------------------
    await page.keyboard.press("KeyF");
    await page.waitForTimeout(120);
    const flyingOn = await status(page);
    await page.keyboard.press("KeyF");
    await page.waitForTimeout(120);
    const flyingOff = await status(page);
    check(flyingOn.flying && !flyingOff.flying, "F toggles creative flight on and off");

    // ---- Pause / resume ------------------------------------------------------
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const paused = await status(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const resumed = await status(page);
    check(paused.state === "paused", "Escape pauses the game");
    check(resumed.state === "playing", "Escape resumes the game");

    // ---- View distance setting ----------------------------------------------
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Settings" }).click();
    const slider = page.locator(".cw-pause.is-visible input[type='range']").first();
    await slider.fill("3");
    await slider.dispatchEvent("input");
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Resume" }).click();
    await page.waitForTimeout(600);
    const settled = await waitForState(page, "playing");
    const reduced = await status(page);
    check(settled && reduced.pending === 0, "chunk streaming settles after the view distance change");
    check(
      reduced.rendered < initial.rendered - 10,
      `view distance change reduces rendered chunks (${initial.rendered} → ${reduced.rendered})`,
    );
  } finally {
    await context.close();
    await browser.close();
    server.stop();
  }

  if (failures > 0) {
    console.error(`\n✖ Smoke test failed with ${failures} failing check(s)`);
    process.exit(1);
  }
  console.log("\n✔ Smoke test passed — core gameplay loop verified in a real browser");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
