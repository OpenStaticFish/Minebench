/**
 * Optional automated screenshot capture for Vox Crest
 * Uses Playwright if installed. Otherwise prints manual steps.
 *
 * Usage:
 *   bun run capture        # tries playwright, falls back to instructions
 *   bun run capture:manual # just print instructions
 *
 * Screenshots:
 *   screenshots/main-menu.png — main menu state
 *   screenshots/in-game.png   — in-game HUD + terrain
 *
 * Prereqs for auto:
 *   bun add -d playwright && bunx playwright install chromium
 *   bun run build && bun run preview --port 4173 &
 *   bun run capture
 */

const PREVIEW_URL = process.env.PREVIEW_URL || "http://localhost:4173";
const outDir = "screenshots";

async function manual() {
  console.log(`
 Manual screenshot workflow — Vox Crest
 ========================================
 1) bun run dev     (or bun run preview after build)
 2) Open http://localhost:3000  (dev) or http://localhost:4173 (preview)
 3) MAIN MENU screenshot:
    - Wait for menu to appear (do NOT press Play)
    - Press P  → downloads main-menu.png
    - Or use browser screenshot: DevTools → Cmd+Shift+P → "Capture screenshot"
    - Save as screenshots/main-menu.png
 4) IN-GAME screenshot:
    - Click PLAY — ENTER FRONTIER
    - Click canvas to lock mouse, look slightly down so horizon + trees + water + HUD visible
    - Press P  → downloads in-game.png
    - Save as screenshots/in-game.png
 5) Both files must be real PNGs from the running game, not placeholders.

 Keyboard:
   P = screenshot (any state)
   ESC = pause/resume, releases pointer lock
`);
}

async function auto() {
  let pw: any;
  try {
    pw = await import("playwright");
  } catch {
    console.log("Playwright not installed. Falling back to manual instructions.");
    await manual();
    console.log("\nTo enable auto: bun add -d playwright && bunx playwright install chromium\n");
    return;
  }
  const fs = await import("fs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`Launching Chromium → ${PREVIEW_URL}`);
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // 1) main menu
  await page.goto(PREVIEW_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/main-menu.png`, fullPage: false });
  console.log(`✓ ${outDir}/main-menu.png`);

  // 2) in-game — click Play, wait for world, then screenshot viewport
  await page.click("#btn-play");
  await page.waitForTimeout(2200); // terrain + chunks
  // nudge camera via JS to get good angle if needed
  await page.evaluate(() => {
    const g = (window as any).__VOX_GAME__;
    if (g) {
      g.player.yaw = 0.6;
      g.player.pitch = -0.28;
      g.player.pos.y += 2;
      g.player.update(0);
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/in-game.png`, fullPage: false });
  console.log(`✓ ${outDir}/in-game.png`);

  await browser.close();
  console.log("Done. Both screenshots are real renders.");
}

const mode = process.argv[2];
if (mode === "manual") manual();
else auto();
