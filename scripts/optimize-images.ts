/**
 * Optimizes the raw benchmark screenshots for the website.
 * Prefers ffmpeg's libwebp encoder (available on this machine); falls back to
 * copying the PNGs verbatim so the build never breaks on other machines.
 *
 * Source of truth: screenshots/*.png (never edited)
 * Output:         public/screenshots/*.webp (copied into dist by Vite)
 */
import { $, which } from "bun";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const SOURCES: Array<[string, number]> = [
  // [file, quality] — the hero shot gets the highest quality.
  ["in-game.png", 82],
  ["main-menu.png", 78],
];

const OUT_DIR = "public/screenshots";

const ffmpeg = await which("ffmpeg");
await mkdir(OUT_DIR, { recursive: true });

for (const [name, quality] of SOURCES) {
  const src = `screenshots/${name}`;
  const out = `${OUT_DIR}/${name.replace(/\.png$/, ".webp")}`;
  if (!existsSync(src)) {
    console.warn(`missing ${src} — run "bun run screenshots" first`);
    continue;
  }
  if (!ffmpeg) {
    console.warn("ffmpeg not found; copying PNG instead of WebP");
    await copyFile(src, out.replace(/\.webp$/, ".png"));
    continue;
  }
  await $`ffmpeg -y -loglevel error -i ${src} -c:v libwebp -q:v ${quality} ${out}`;
  console.log(`optimized ${out}`);
}
