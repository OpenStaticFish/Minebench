/**
 * Captures the marketing landing page for visual review:
 *   screenshots/site-desktop.png (1366x900)
 *   screenshots/site-mobile.png  (390x844)
 * Serves the production build via vite preview (software WebGL is not
 * needed here — the landing page has no canvas).
 */
import path from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "screenshots");

async function main(): Promise<void> {
  const server = await preview({
    root: ROOT,
    preview: { port: 4177, strictPort: true },
    logLevel: "error",
  });
  const url = server.resolvedUrls?.local?.[0] ?? "http://localhost:4177/";

  const browser = await chromium.launch({ headless: true });
  for (const [name, viewport] of [
    ["site-desktop", { width: 1366, height: 900 }],
    ["site-mobile", { width: 390, height: 844 }],
  ] as const) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Scroll through the page so lazy-loaded images decode before capture.
    await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = "auto";
      const step = window.innerHeight;
      for (let y = 0; y <= document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 400));
    });
    await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
    console.log(`captured screenshots/${name}.png`);
    await page.close();
  }
  await browser.close();
  await server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
