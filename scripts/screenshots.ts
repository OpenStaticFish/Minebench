import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { startStaticServer } from "./staticServer";

/**
 * Automated screenshot capture for the two benchmark images:
 *   screenshots/main-menu.png
 *   screenshots/in-game.png
 *
 * These are real frames from the running game rendered by headless Chromium
 * (WebGL via SwiftShader). Run with: bun run shots
 */

const VIEWPORT = { width: 1600, height: 900 };
const GAME_SEED = "20260910";

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

async function build(): Promise<void> {
  if (process.argv.includes("--skip-build")) {
    console.log("• Skipping build (--skip-build)");
    return;
  }
  console.log("• Building production bundle…");
  const proc = Bun.spawn(["bunx", "vite", "build"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) fail("vite build failed");
}

async function launchBrowser(): Promise<Browser> {
  const args = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-sandbox",
    "--no-sandbox",
  ];
  try {
    return await chromium.launch({ args });
  } catch (error) {
    console.warn("• Bundled Chromium unavailable, falling back to system Chrome");
    console.warn(`  ${(error as Error).message.split("\n")[0]}`);
    try {
      return await chromium.launch({ channel: "chrome", args });
    } catch {
      fail(
        "Could not launch a browser. Install Playwright browsers with `bunx playwright install chromium`.",
      );
    }
  }
}

async function waitForGame(page: Page, state: string, label: string): Promise<void> {
  try {
    await page.waitForFunction(
      (expected) => {
        const api = window.cubewild;
        return Boolean(api && api.ready && api.state === expected && api.pendingChunks === 0);
      },
      state,
      { timeout: 60_000, polling: 250 },
    );
  } catch {
    fail(`Timed out waiting for the game to reach state "${state}" (${label})`);
  }

  // Chunk streaming restarts whenever the camera or view distance changes, so
  // wait until the pending count has stayed at zero for a full grace period.
  let stableSince = Date.now();
  while (Date.now() - stableSince < 1500) {
    await page.waitForTimeout(250);
    const status = await page.evaluate(() => ({
      pending: window.cubewild?.pendingChunks ?? 0,
      state: window.cubewild?.state,
    }));
    if (status.pending > 0 || status.state !== state) stableSince = Date.now();
  }
}

async function newPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);
  page.on("pageerror", (error) => console.error(`  [page error] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`  [console] ${message.text()}`);
  });
  return page;
}

async function captureMainMenu(context: BrowserContext): Promise<void> {
  const page = await newPage(context);
  console.log("• Capturing main menu…");
  await page.goto("/?shot=menu", { waitUntil: "domcontentloaded" });
  await waitForGame(page, "menu", "main menu");
  await page.waitForTimeout(2200);
  await page.screenshot({ path: resolve("screenshots/main-menu.png") });
  await page.close();
}

async function captureInGame(context: BrowserContext): Promise<void> {
  const page = await newPage(context);
  console.log("• Capturing in-game view…");
  await page.goto(`/?shot=game&seed=${GAME_SEED}`, { waitUntil: "domcontentloaded" });
  await waitForGame(page, "playing", "in-game");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve("screenshots/in-game.png") });
  await page.close();
}

async function main(): Promise<void> {
  await mkdir(resolve("screenshots"), { recursive: true });
  await build();

  const server = startStaticServer(resolve("dist"), 0);
  console.log(`• Serving dist on ${server.url}`);
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    baseURL: server.url,
  });

  const only = process.argv.find((arg) => arg.startsWith("--only="))?.split("=")[1];
  try {
    if (only !== "game") await captureMainMenu(context);
    if (only !== "menu") await captureInGame(context);
  } finally {
    await context.close();
    await browser.close();
    server.stop();
  }

  console.log("\n✔ Screenshots written:");
  if (only !== "game") console.log("  screenshots/main-menu.png");
  if (only !== "menu") console.log("  screenshots/in-game.png");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
