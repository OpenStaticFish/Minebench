#!/usr/bin/env bun
// One-command launcher: website ( :3001 ) + game ( :3000 ) together
// Run: bun run dev:all  → open http://localhost:3001  (site), click Play → embeds or links to :3000
import { spawn } from "bun";

const procs: ReturnType<typeof Bun.spawn>[] = [];

function launch(label: string, cmd: string[], color: string) {
  const p = Bun.spawn(cmd, {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  console.log(`\x1b[${color}m[${label}] PID ${p.pid}\x1b[0m`);
  procs.push(p);
  return p;
}

const game = launch("GAME :3000", ["bun", "run", "dev"], "32");
const site = launch("SITE :3001", ["bun", "run", "dev:website"], "34");

// Give Vite a moment then print banner
setTimeout(() => {
  console.log("\n" + "─".repeat(62));
  console.log("  VOX CREST — dev servers up");
  console.log("  Website → http://localhost:3001  (marketing site)");
  console.log("  Game    → http://localhost:3000  (WebGL canvas)");
  console.log("  Play via website: open site → click “Play prototype →” or visit /play.html");
  console.log("  One command was: bun run dev:all");
  console.log("  Ctrl+C to stop both");
  console.log("─".repeat(62) + "\n");
}, 1200);

function shutdown() {
  console.log("\nShutting down...");
  for (const p of procs) try { p.kill(); } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Wait for either to exit — if one dies, kill the other
const exits = procs.map((p) => p.exited);
Promise.race(exits).then(() => {
  console.log("One server exited — stopping the other");
  shutdown();
});
