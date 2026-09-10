import { resolve } from "node:path";
import { createServer } from "vite";

/**
 * Runs the game dev server and the website dev server together:
 *
 *     bun run dev:all
 *
 *   game → http://localhost:5173
 *   site → http://localhost:5174  (its Play buttons point at the game)
 *
 * Both Vite servers are hosted in this single process (no shell wrappers, no
 * orphaned children) and Ctrl+C closes them cleanly.
 */

const repoRoot = resolve(import.meta.dir, "..");
const siteDir = resolve(repoRoot, "site");

console.log("• Starting Cubewild dev servers…");

// The site build reads a manifest produced from the real game screenshots.
const prepare = Bun.spawn(["bun", "run", "scripts/prepare-assets.ts"], {
  cwd: siteDir,
  stdout: "inherit",
  stderr: "inherit",
});
if ((await prepare.exited) !== 0) {
  console.error("Failed to prepare website assets");
  process.exit(1);
}

const game = await createServer({
  root: repoRoot,
  configFile: resolve(repoRoot, "vite.config.ts"),
  logLevel: "info",
});
const site = await createServer({
  root: siteDir,
  configFile: resolve(siteDir, "vite.config.ts"),
  logLevel: "info",
});

await game.listen();
await site.listen();

console.log("\n• Cubewild is running:");
console.log("  game → http://localhost:5173");
console.log("  site → http://localhost:5174  (Play buttons are wired up)");
console.log("  Press Ctrl+C to stop both.\n");

let closing = false;

async function close(code: number): Promise<void> {
  if (closing) return;
  closing = true;
  console.log("\n• Stopping dev servers…");
  // Safety net: some Vite resources can keep the event loop busy, so never
  // let shutdown hang. Two seconds is plenty for a clean close.
  const forceExit = setTimeout(() => process.exit(code), 2000);
  await Promise.allSettled([game.close(), site.close()]);
  clearTimeout(forceExit);
  process.exit(code);
}

process.on("SIGINT", () => void close(0));
process.on("SIGTERM", () => void close(0));

// Keep the process alive while both servers run.
await new Promise<void>(() => undefined);
