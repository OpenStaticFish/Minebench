#!/usr/bin/env bun
// One-command preview: built game (:4173) + built site (:4174)
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

launch("GAME :4173", ["bun", "run", "preview"], "32");
launch("SITE :4174", ["bun", "run", "preview:website"], "34");

setTimeout(() => {
  console.log("\n" + "─".repeat(62));
  console.log("  VOX CREST — preview servers up (built)");
  console.log("  Website → http://localhost:4174");
  console.log("  Game    → http://localhost:4173");
  console.log("  Play via website: open site → click Play (points to :4173 in preview)");
  console.log("  One command was: bun run preview:all");
  console.log("─".repeat(62) + "\n");
}, 1200);

function shutdown() {
  for (const p of procs) try { p.kill(); } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.all(procs.map((p) => p.exited));
