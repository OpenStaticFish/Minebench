import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Builds the playable game (repo root) and copies its production output into
 * `site/dist/play/`, producing a single folder that contains the website and
 * the game behind the `/play/` URL used by every Play button.
 *
 * Usage: bun run build:full (from site/) or bun run site:build:full (root).
 */

const siteDir = resolve(import.meta.dir, "..");
const repoRoot = resolve(siteDir, "..");
const gameDist = resolve(repoRoot, "dist");
const target = resolve(siteDir, "dist/play");

console.log("• Building the game…");
const proc = Bun.spawn(["bunx", "vite", "build"], {
  cwd: repoRoot,
  stdout: "inherit",
  stderr: "inherit",
});
if ((await proc.exited) !== 0) {
  console.error("Game build failed");
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await cp(gameDist, target, { recursive: true });
console.log(`✔ Game copied to site/dist/play — serve site/dist/ as one folder.`);
