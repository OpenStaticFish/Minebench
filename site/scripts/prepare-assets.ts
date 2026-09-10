import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import {
  SCREENSHOT_META,
  type ScreenshotAsset,
  type ScreenshotManifest,
  type ScreenshotVariant,
} from "./screenshot-meta";

/**
 * Prepares the website image set from the real game screenshots.
 *
 * PNG captures from the game project (`screenshots/*.png`) are resized into
 * responsive WebP variants plus a tiny inline LQIP preview, and a manifest is
 * written for the Vite HTML plugin.
 *
 * Encoding runs in headless Chromium (already a dev dependency for visual
 * checks) so no native image tooling is required. Results are cached: variants
 * are only re-encoded when the source PNG is newer.
 *
 * If a screenshot is missing, the manifest records `available: false` and the
 * site renders a clearly labelled placeholder instead of pretending the image
 * exists.
 *
 * Run automatically by `dev`/`build`, or on demand:
 *   bun run scripts/prepare-assets.ts
 */

const siteDir = resolve(import.meta.dir, "..");
const repoRoot = resolve(siteDir, "..");
const publicDir = resolve(siteDir, "public/screenshots");
const manifestPath = resolve(siteDir, ".generated/screenshots.json");

const TARGET_WIDTHS = [640, 960, 1440, 1920];
const WEBP_QUALITY = 0.8;
const LQIP_WIDTH = 24;
const LQIP_QUALITY = 0.45;

interface EncodedVariant {
  width: number;
  height: number;
  data: string;
}

interface EncodeResult {
  width: number;
  height: number;
  variants: EncodedVariant[];
  lqip: string;
}

async function readManifest(): Promise<ScreenshotManifest> {
  try {
    const raw = await readFile(manifestPath, "utf8");
    return JSON.parse(raw) as ScreenshotManifest;
  } catch {
    return {};
  }
}

async function variantsAreFresh(sourcePath: string, asset: ScreenshotAsset): Promise<boolean> {
  if (!asset.available || asset.variants.length === 0) return false;
  try {
    const sourceStat = await stat(sourcePath);
    for (const variant of asset.variants) {
      const file = resolve(siteDir, `public${variant.src}`);
      const fileStat = await stat(file);
      if (fileStat.mtimeMs < sourceStat.mtimeMs) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ args: ["--no-sandbox"] });
  } catch (error) {
    console.warn(`  • bundled Chromium unavailable (${(error as Error).message.split("\n")[0]})`);
    return chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  }
}

async function encodeInBrowser(
  browser: Browser,
  dataUrl: string,
  widths: number[],
): Promise<EncodeResult> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ({ src, targetWidths, quality, lqipWidth, lqipQuality }) => {
        const blob = await (await fetch(src)).blob();
        const bitmap = await createImageBitmap(blob);

        const toBase64 = (bytes: Uint8Array): string => {
          let binary = "";
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
          }
          return btoa(binary);
        };

        const encode = async (
          width: number,
          height: number,
          encodeQuality: number,
          blur: number,
        ): Promise<string> => {
          const canvas = new OffscreenCanvas(width, height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("2D context unavailable");
          if (blur > 0) context.filter = `blur(${blur}px)`;
          context.drawImage(bitmap, 0, 0, width, height);
          const output = await canvas.convertToBlob({
            type: "image/webp",
            quality: encodeQuality,
          });
          return toBase64(new Uint8Array(await output.arrayBuffer()));
        };

        const variants = [];
        for (const width of targetWidths) {
          const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
          variants.push({ width, height, data: await encode(width, height, quality, 0) });
        }
        const lqipHeight = Math.max(1, Math.round((bitmap.height / bitmap.width) * lqipWidth));
        const lqip = await encode(lqipWidth, lqipHeight, lqipQuality, 1.5);
        return { width: bitmap.width, height: bitmap.height, variants, lqip };
      },
      {
        src: dataUrl,
        targetWidths: widths,
        quality: WEBP_QUALITY,
        lqipWidth: LQIP_WIDTH,
        lqipQuality: LQIP_QUALITY,
      },
    );
  } finally {
    await page.close();
  }
}

async function prepareAssets(): Promise<void> {
  console.log("• Preparing website screenshots…");
  await mkdir(publicDir, { recursive: true });
  await mkdir(resolve(siteDir, ".generated"), { recursive: true });

  const previous = await readManifest();
  const manifest: ScreenshotManifest = {};
  const expectedFiles = new Set<string>();
  let browser: Browser | null = null;

  try {
    for (const meta of SCREENSHOT_META) {
      const sourcePath = resolve(repoRoot, meta.source);
      const existing = previous[meta.key];

      if (!existsSync(sourcePath)) {
        console.warn(`  ! missing ${meta.source} — the site will render a labelled placeholder`);
        manifest[meta.key] = {
          key: meta.key,
          available: false,
          title: meta.title,
          alt: meta.alt,
          caption: meta.caption,
          width: 0,
          height: 0,
          lqip: "",
          variants: [],
          full: "",
        };
        continue;
      }

      if (existing && (await variantsAreFresh(sourcePath, existing))) {
        for (const variant of existing.variants) expectedFiles.add(variant.src.split("/").pop() ?? "");
        expectedFiles.add(`${meta.key}-lqip.webp`);
        manifest[meta.key] = existing;
        console.log(`  ✔ ${meta.source} — cached`);
        continue;
      }

      browser ??= await launchBrowser();
      const sourceBuffer = await readFile(sourcePath);
      const dataUrl = `data:image/png;base64,${sourceBuffer.toString("base64")}`;
      const encoded = await encodeInBrowser(browser, dataUrl, TARGET_WIDTHS);

      const variants: ScreenshotVariant[] = [];
      for (const variant of encoded.variants) {
        const filename = `${meta.key}-${variant.width}.webp`;
        await writeFile(resolve(publicDir, filename), Buffer.from(variant.data, "base64"));
        variants.push({ width: variant.width, src: `/screenshots/${filename}` });
        expectedFiles.add(filename);
      }
      const lqipFile = `${meta.key}-lqip.webp`;
      await writeFile(resolve(publicDir, lqipFile), Buffer.from(encoded.lqip, "base64"));
      expectedFiles.add(lqipFile);

      const largest = variants[variants.length - 1] as ScreenshotVariant;
      manifest[meta.key] = {
        key: meta.key,
        available: true,
        title: meta.title,
        alt: meta.alt,
        caption: meta.caption,
        width: encoded.width,
        height: encoded.height,
        lqip: `data:image/webp;base64,${encoded.lqip}`,
        variants,
        full: largest.src,
      };
      const sizes = variants.map((variant) => variant.width).join(", ");
      console.log(`  ✔ ${meta.source} → ${variants.length} WebP variants (${sizes} px)`);
    }
  } finally {
    await browser?.close();
  }

  // Remove stale variants from earlier runs.
  for (const file of await readdir(publicDir)) {
    if (!expectedFiles.has(file)) await unlink(resolve(publicDir, file));
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const available = Object.values(manifest).filter((asset) => asset.available).length;
  console.log(`• Manifest written (${available}/${SCREENSHOT_META.length} screenshots available)`);
  if (available < SCREENSHOT_META.length) {
    console.log("  Hint: generate the missing captures with `bun run shots` in the game project.");
  }
}

await prepareAssets();
