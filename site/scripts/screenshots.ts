import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { startStaticServer } from "./serve";

/**
 * Visual review capture for the website itself:
 *   site/screenshots/landing-desktop.png    (1440×900 hero viewport)
 *   site/screenshots/landing-full.png       (1440×900 full page)
 *   site/screenshots/landing-mobile.png     (390×844 full page)
 *
 * Also fails if the page logs errors, so it doubles as a smoke check.
 *
 * Usage: bun run shots (from site/) or bun run site:shots (from the repo root)
 */

const siteDir = resolve(import.meta.dir, "..");
const outputDir = resolve(siteDir, "screenshots");
const errors: string[] = [];

async function build(): Promise<void> {
  if (process.argv.includes("--skip-build")) {
    console.log("• Skipping build (--skip-build)");
    return;
  }
  console.log("• Building the website…");
  const proc = Bun.spawn(["bunx", "vite", "build"], {
    cwd: siteDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0) {
    console.error("Site build failed");
    process.exit(1);
  }
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ args: ["--no-sandbox"] });
  } catch {
    return await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  }
}

/**
 * Scrolls through the page so lazy-loaded images start fetching, then waits
 * until every image has finished loading and reports any that failed.
 */
async function waitForImages(page: import("playwright").Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let y = 0;
      const step = (): void => {
        y += Math.round(window.innerHeight * 0.8);
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) {
          window.setTimeout(step, 80);
        } else {
          window.scrollTo(0, 0);
          window.setTimeout(resolve, 100);
        }
      };
      step();
    });
  });

  await page.waitForFunction(
    () => Array.from(document.images).every((image) => image.complete),
    null,
    { timeout: 30_000, polling: 100 },
  );

  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((image) => image.hasAttribute("src") && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src),
  );
  for (const source of broken) errors.push(`[image failed] ${source}`);
}

async function capture(): Promise<void> {
  const server = startStaticServer(resolve(siteDir, "dist"), 0);
  const browser = await launch();

  try {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      baseURL: server.url,
    });
    const page = await desktop.newPage();
    page.on("pageerror", (error) => errors.push(`[page error] ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`[console] ${message.text()}`);
    });

    console.log("• Capturing desktop…");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForImages(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(outputDir, "landing-desktop.png") });
    await page.screenshot({ path: resolve(outputDir, "landing-full.png"), fullPage: true });

    await desktop.close();

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      baseURL: server.url,
    });
    const mobilePage = await mobile.newPage();
    mobilePage.on("pageerror", (error) => errors.push(`[mobile error] ${error.message}`));

    console.log("• Capturing mobile…");
    await mobilePage.goto("/", { waitUntil: "domcontentloaded" });
    await waitForImages(mobilePage);
    await mobilePage.waitForTimeout(300);
    await mobilePage.screenshot({ path: resolve(outputDir, "landing-mobile.png"), fullPage: true });
    await mobile.close();
  } finally {
    await browser.close();
    server.stop();
  }
}

await mkdir(outputDir, { recursive: true });
await build();
await capture();

if (errors.length > 0) {
  console.error("\n✖ The page reported errors:");
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

console.log("\n✔ Website captures written to site/screenshots/");
