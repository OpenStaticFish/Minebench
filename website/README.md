# Vox Crest — Marketing Site

Static site for the Vox Crest voxel prototype. Vite + vanilla HTML/CSS/TS, no framework runtime.

## Run — One Command

```bash
bun install                 # from repo root
bun run dev:all             # site :3001 + game :3000 — open http://localhost:3001 → Play (embeds game via /play.html)
# granular:
bun run dev:website         # http://localhost:3001
bun run dev                 # http://localhost:3000 (game)
bun run build:website       # → website/dist/
bun run preview:website     # http://localhost:4174
bun run preview:all         # site :4174 + game :4173
bun run check:website       # tsc --noEmit --project website/tsconfig.json
```

`website/play.html` iframes the game (auto-detects :3000 dev / :4173 preview). Direct game URL still at :3000/:4173.

## Screenshots

The site showcases `screenshots/main-menu.png` and `screenshots/in-game.png` from the game benchmark at `/screenshots/…` (served from `website/public/screenshots/`).

- Capture in game: `bun run dev` → :3000 → **P** at menu & in-game → move downloads to `screenshots/` → `bun run sync:screenshots`
- Or automated: `bun add -d playwright && bunx playwright install chromium && bun run build && bun run preview & bun run capture`
- If files are missing, the site shows clearly labeled placeholders with copy-to-path instructions — no fakes. Build still succeeds.

## Deploy

`website/dist/` is static. Deploy to Netlify, Cloudflare Pages, or `bun run preview:website`.

## Stack

Vite + plain HTML/CSS/TS. ~22 KB HTML + 16 KB CSS + 2 KB JS (gzipped ~7 KB + 3.8 KB + 1 KB). Semantic HTML, accessible, reduced-motion aware, responsive at 960/640.
