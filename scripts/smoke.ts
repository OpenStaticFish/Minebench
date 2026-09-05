/**
 * Engine smoke test: boots the real game in headless Chromium and verifies
 * chunk readiness, block breaking, block placement and world-data persistence
 * through the public raycast/edit code paths.
 */
import { preview } from "vite";
import { chromium } from "playwright";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

interface Api {
  isReady(r: number): boolean;
  setPose(x: number, y: number, z: number, yaw: number, pitch: number, flying?: boolean): void;
  getBlock(x: number, y: number, z: number): number;
  testBreak(): void;
  testPlace(): void;
}

async function main(): Promise<void> {
  const server = await preview({
    root: ROOT,
    preview: { port: 4175, strictPort: true },
    logLevel: "error",
  });
  const url = server.resolvedUrls?.local?.[0] ?? "http://localhost:4175/";
  const gameUrl = new URL("play.html", url).href;

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(gameUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForFunction(
    () => (window as unknown as { __blockvale?: Api }).__blockvale?.isReady(2) === true,
    { timeout: 120_000 },
  );

  const result = await page.evaluate(() => {
    const api = (window as unknown as { __blockvale: Api }).__blockvale;
    const apiAny = api as unknown as { probeHeight: (x: number, z: number) => number };
    const groundY = apiAny.probeHeight(8, 6) - 1; // top solid block of the surface

    // Snapshot the local region so we can detect any voxel edit.
    const snap = (): Record<string, number> => {
      const out: Record<string, number> = {};
      for (let y = groundY - 2; y <= groundY + 4; y++) {
        for (let z = 0; z <= 16; z++) {
          for (let x = 0; x <= 16; x++) {
            const id = api.getBlock(x, y, z);
            if (id !== 0) out[`${x},${y},${z}`] = id;
          }
        }
      }
      return out;
    };
    const diffCount = (a: Record<string, number>, b: Record<string, number>): number => {
      let n = 0;
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) if (a[k] !== b[k]) n++;
      return n;
    };

    // Stand above the surface looking down ~40° at the ground in front.
    api.setPose(8.5, groundY + 2.2, 8.5, 0, -0.7, true);

    const beforeBreak = snap();
    api.testBreak();
    const afterBreak = snap();
    const breakDiff = diffCount(beforeBreak, afterBreak);

    api.testPlace();
    const afterPlace = snap();
    const placeDiff = diffCount(afterBreak, afterPlace);

    return { groundY, breakDiff, placeDiff, state: (api as unknown as { state: string }).state };
  });

  // Gravity + collision: drop the player from above the ground, expect them to
  // come to rest exactly on the surface with flying disabled.
  const physics = await page.evaluate(async () => {
    const api = (window as unknown as {
      __blockvale: Api & { getBlock: (x: number, y: number, z: number) => number; pos: { x: number; y: number; z: number }; onGround: boolean };
    }).__blockvale;
    // Actual top solid block at the column (caves may carve the heightmap top).
    let top = 0;
    for (let y = 63; y >= 0; y--) {
      if (api.getBlock(8, y, 8) !== 0 && api.getBlock(8, y, 8) !== 8) {
        top = y;
        break;
      }
    }
    api.setPose(8.5, top + 6, 8.5, 0, 0, false);
    await new Promise((r) => setTimeout(r, 2000));
    return { restY: api.pos.y, expectedY: top + 1, flying: (api as unknown as { flying: boolean }).flying };
  });

  await browser.close();
  await server.close();

  const problems: string[] = [];
  if (errors.length > 0) problems.push(`page errors: ${errors.join("; ")}`);
  if (result.breakDiff === 0) problems.push("break did not change any voxel");
  if (result.placeDiff === 0) problems.push("place did not change any voxel");
  if (Math.abs(physics.restY - physics.expectedY) > 0.1 || physics.flying) {
    problems.push(
      `gravity/collision failed: rested at y=${physics.restY.toFixed(2)} (expected ~${physics.expectedY}), flying=${physics.flying}`,
    );
  }

  console.log("smoke result:", JSON.stringify({ ...result, physics }));
  if (problems.length > 0) {
    console.error("SMOKE FAILED");
    for (const p of problems) console.error(" -", p);
    process.exit(1);
  }
  console.log("SMOKE OK: break + place + world edits verified");
  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
