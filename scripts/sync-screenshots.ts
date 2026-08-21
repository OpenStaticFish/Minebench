import { existsSync, copyFileSync, mkdirSync } from "fs";
import { join } from "path";

const rootShots = ["screenshots/main-menu.png", "screenshots/in-game.png"];
const destDir = "website/public/screenshots";

mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const src of rootShots) {
  const name = src.split("/").pop()!;
  const dest = join(destDir, name);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`✓ ${src} → ${dest}`);
    copied++;
  } else {
    console.log(`· missing ${src} — placeholder will show (run game → P, or bun run capture)`);
  }
}
if (copied === 0) {
  console.log("\nNo real screenshots found. Site will show labeled placeholders.");
  console.log("To add them: bun run dev → open :3000 → P at menu & in-game → move files to screenshots/ + website/public/screenshots/");
} else {
  console.log(`\nDone. ${copied}/${rootShots.length} screenshots synced.`);
}
