/**
 * Captures the two benchmark screenshots from the real running game:
 *   screenshots/main-menu.png
 *   screenshots/in-game.png
 *
 * Builds the game, serves it with `vite preview`, drives it with Playwright
 * (headless Chromium, SwiftShader WebGL), and writes the PNGs directly.
 */
import { preview } from "vite";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const OUT_DIR = path.join(ROOT, "screenshots");
const VIEWPORT = { width: 1280, height: 720 };

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const server = await preview({
    root: ROOT,
    preview: { port: 4173, strictPort: true },
    logLevel: "error",
  });
  const url = server.resolvedUrls?.local?.[0] ?? "http://localhost:4173/";
  const gameUrl = new URL("play.html", url).href;

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox",
      "--no-sandbox",
    ],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on("pageerror", (err) => console.error("[pageerror]", err));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console.error]", msg.text());
  });

  await page.goto(gameUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".menu-overlay .game-title");
  // Let fonts settle so the title renders in the pixel font.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(OUT_DIR, "main-menu.png") });
  console.log("captured screenshots/main-menu.png");

  // Use a wider view distance for a richer in-game shot, then enter the game.
  await page.evaluate(() => {
    (window as unknown as { __blockvale?: { setViewDistance: (v: number) => void } }).__blockvale?.setViewDistance(8);
  });
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForFunction(
    () => (window as unknown as { __blockvale?: { isReady: (r: number) => boolean } }).__blockvale?.isReady(2) === true,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(1200);

  // Compose a scenic in-game shot: find water near the spawn, then pick the
  // tallest nearby rise as a vantage looking across the water.
  const pose = await page.evaluate(() => {
    const api = (window as unknown as {
      __blockvale: {
        setPose: (x: number, y: number, z: number, yaw: number, pitch: number) => void;
        probeHeight: (x: number, z: number) => number;
      };
    }).__blockvale;
    const sea = 27;
    let water: { x: number; z: number; h: number } | null = null;
    let bestView: { x: number; z: number; h: number } = { x: 8, z: 8, h: api.probeHeight(8, 8) };
    outer: for (const r of [10, 20, 30, 40, 50, 60]) {
      for (let a = 0; a < 16; a++) {
        const x = 8 + Math.round(Math.cos((a / 16) * Math.PI * 2) * r);
        const z = 8 + Math.round(Math.sin((a / 16) * Math.PI * 2) * r);
        const h = api.probeHeight(x, z);
        if (h > bestView.h) bestView = { x, z, h };
        if (!water && h <= sea + 1) water = { x, z, h };
      }
      if (water && bestView.h > 44) break;
    }
    const t = water ?? { x: 30, z: 30, h: 30 };

    let cx: number, cy: number, cz: number;
    const dx = t.x - bestView.x;
    const dz = t.z - bestView.z;
    const dist = Math.hypot(dx, dz);
    if (bestView.h > 42 && dist > 12) {
      // Stand on the rise, looking down across the water.
      cx = bestView.x + 0.5;
      cz = bestView.z + 0.5;
      cy = bestView.h + 2.5;
    } else {
      // No good rise nearby: hover modestly above the water's edge.
      const len = dist || 1;
      cx = t.x - (dx / len) * 18;
      cz = t.z - (dz / len) * 18;
      cy = Math.max(api.probeHeight(Math.round(cx), Math.round(cz)) + 7, t.h + 11);
    }
    const yaw = Math.atan2(-(t.x - cx), -(t.z - cz));
    const pitch = Math.max(-0.35, Math.min(-0.06, -(cy - (t.h + 2)) / Math.max(12, Math.hypot(t.x - cx, t.z - cz))));
    api.setPose(cx, cy, cz, yaw, pitch);
    return { cx, cy, cz, t, bestView };
  });
  console.log("pose:", JSON.stringify(pose));

  // Wait for chunks around the new vantage to fully stream in: the camera sees
  // far past the spawn radius, so any unloaded area would show sky instead of
  // terrain. Radius 5 covers ~80 blocks in every direction.
  await page.waitForFunction(
    () => (window as unknown as { __blockvale?: { isReady: (r: number) => boolean } }).__blockvale?.isReady(5) === true,
    { timeout: 300_000 },
  );
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(OUT_DIR, "in-game.png") });
  console.log("captured screenshots/in-game.png");

  await browser.close();
  await server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
