/**
 * Static checks over the built site (run after `bun run build`):
 *  - both pages and all referenced local assets resolve in dist/
 *  - every <img> carries alt text
 *  - required landing sections are present
 * Exits non-zero on the first failure category and prints a summary.
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const DIST = "dist";

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

for (const page of ["index.html", "play.html"]) {
  if (!existsSync(`${DIST}/${page}`)) fail(`missing built page ${DIST}/${page}`);
}

const requiredSections = [
  "hero-title",
  "pitch-title",
  "showcase-title",
  "features-title",
  "controls-title",
  "tech-title",
  "status-title",
  "cta-title",
];
const index = await readFile(`${DIST}/index.html`, "utf8");
for (const id of requiredSections) {
  if (!index.includes(`id="${id}"`)) fail(`landing page missing section #${id}`);
}

// Collect every local href/src target and confirm it exists in dist/.
const distFiles = new Set(["index.html", "play.html"]);
async function walk(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await walk(p);
    else distFiles.add(p);
  }
}
await walk(DIST);

const targets = [...index.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]!);
for (const raw of targets) {
  if (/^(https?:|mailto:|#|data:)/.test(raw)) continue;
  const clean = raw.split("?")[0]!.split("#")[0]!;
  const resolved = clean.startsWith("/") ? `dist${clean}` : `dist/${clean.replace(/^\.\//, "")}`;
  if (!distFiles.has(resolved)) fail(`index.html references missing asset ${raw} (${resolved})`);
}

// Alt text on every image.
const imgs = [...index.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
const missingAlt = imgs.filter((tag) => !/\balt="[^"]*"/.test(tag));
if (missingAlt.length > 0) fail(`${missingAlt.length} <img> without alt text`);

console.log(
  `SITE OK: ${distFiles.size} dist files, ${imgs.length} images with alt, ${requiredSections.length} sections, all ${targets.length} references resolve`,
);
