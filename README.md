# VOX CREST — Indie Voxel Sandbox (Game + Marketing Site)

Two benchmarks, one prototype. **Game** is the playable WebGL voxel sandbox (`index.html` → :3000). **Website** is the marketing/information site for that game (`website/` → :3001). Both share the same cohesive visual identity, Bun toolchain, and honest placeholder handling for screenshots.

![Typecheck](https://img.shields.io/badge/typecheck-passing-brightgreen) ![Bun](https://img.shields.io/badge/bun-1.3+-black) ![Three.js](https://img.shields.io/badge/three-0.185-blue) ![Website](https://img.shields.io/badge/site-vanilla+Vite-lightgrey)

---

## Live Quickstart — One Command

```bash
bun install
bun run dev:all       # ← ONE COMMAND: website :3001 + game :3000 together
# Open http://localhost:3001 → click “Play prototype →” (goes to /play.html which embeds the game)
# Or open game directly at http://localhost:3000
```

More granular:

```bash
# Game alone
bun run dev           # :3000  (alias dev:game)
bun run build         # → dist/
bun run preview       # :4173

# Website alone
bun run dev:website   # :3001
bun run build:website # → website/dist/
bun run preview:website # :4174

# Both (build / preview)
bun run build:all
bun run preview:all   # :4174 + :4173
bun run start         # alias for dev:all

# Checks
bun run check         # game
bun run check:website # site
bun run sync:screenshots # copy real screenshots to site public if they exist
```

Bun is the only required runtime. Do not use `npm`/`pnpm`/`yarn`.

---

# PART A — GAME PROTOTYPE

## A1) Game / Product Interpretation

Prompt: browser WebGL voxel creative slice that feels like a real game, not a cube demo — menu, HUD, terrain, chunks, gravity, flight, mouse-look, break/place, hotbar, pause/settings, clouds, screenshot readiness.

**Interpretation — Vox Crest:** quiet frontier at the edge of a block archipelago. Low beaches, rolling plains, steep highlands. You crest a hill and see water, trees, cave mouths. Built for screenshots: horizon reads in one glance. Original name, diamond-cut mark ◈, Space Grotesk + JetBrains Mono, muted-slate panels with voxel green/blue/sand, wireframe highlight, blocky cards. No Minecraft logos/textures.

## A2) Game Tooling & Justification

**Chosen: Vite + Three.js + TypeScript + Bun**

| Need | How it satisfies |
|---|---|
| WebGL voxel, chunk meshes, fog, lights, DDA ray, pointer lock | Three.js — smallest mature WebGL renderer, no engine overhead |
| Fast dev + build + preview, `bun run dev/build/preview` | Vite — instant HMR, esbuild, preview server |
| Maintainability | TS strict + split modules (`world.ts`/`chunk.ts`/`mesher.ts`/`player.ts`) |
| Bun requirement | Bun runs Vite natively, lockfile is Bun's |

**Not heavier:** Babylon.js (larger), React+R3F (extra reconciler, lock complexity), Unity/Godot (huge, not Bun-local). **Not lighter:** Raw WebGL (error-prone), 2D canvas (not WebGL), no bundler (unmaintainable). Vite+Three is the *simplest stack that still yields a performant, maintainable WebGL prototype*.

## A3) Game Trade-offs

- **Column chunks 16×96×16 vs 16³** — columns simplify heightmap; cubic would stream vertically but adds bookkeeping. Kept chunk-based + view-culled.
- **Face-culling vs greedy** — face-culling simple O(n), enough for view 2–8; greedy would cut verts ~5× but code-heavy — deferred.
- **Vertex-colors vs textures** — no atlas load, palette controllable, terrain readable (grass top, sand shore, water translucent).
- **AABB sampling vs physics engine** — hand-rolled axis-separated AABB, tight flight, no dep.
- **Value-noise vs simplex-noise** — ~40 lines, fully seeded, FBM+warp varied enough.

Not overkill (one mesh per chunk + water, one material each), not too limited (strict TS, rebuild without leaks, live settings).

## A4) Game Implementation Plan

1. Scaffold Vite+TS+Three + shell HTML/CSS.
2. Blocks palette + seeded value-noise helpers.
3. `World` (Map of `Chunk`), `Chunk` Uint8Array, `mesher` visible-face BufferGeometry (solid vs water split).
4. Terrain: FBM height + biome lerp + warp + caves (3D carve) + trees + beaches + water plane.
5. `Player` — yaw/pitch, pointer-lock, gravity/jump, flight double-tap Space/F, AABB.
6. DDA ray, break/place, hotbar 1–9+wheel, highlight, spawn.
7. Lights, FogExp2 tied to view, cloud clusters, sky gradient.
8. Menu → play, seed/view/sens/FOV live, pause/resume, `P` screenshot.
9. Capture script + docs + checks.

## A5) Game Structure

```
.
├── index.html              # game entry
├── vite.config.ts
├── tsconfig.json
├── screenshots/            # real captures (main-menu.png, in-game.png)
├── scripts/capture.ts      # Playwright auto-capture, sync:screenshots
├── src/
│   ├── main.ts
│   ├── style.css
│   └── game/
│       ├── blocks.ts
│       ├── noise.ts
│       ├── world.ts
│       ├── chunk.ts
│       ├── mesher.ts
│       ├── player.ts
│       ├── raycast.ts
│       ├── clouds.ts
│       └── game.ts         # scene, renderer, UI, loop
```

## A6) Game Controls

| Action | Input |
|---|---|
| Move | WASD |
| Look | Mouse (click to lock) |
| Jump / Fly up | Space (hold when flying) |
| Toggle flight | Double-tap Space or F |
| Fly down | Shift / Ctrl |
| Sprint (fly) | Ctrl while flying |
| Break | Left click |
| Place | Right click |
| Select | 1–9 / Scroll (Grass, Dirt, Stone, Sand, Wood, Leaves, Water, Brick, Glass) |
| Pause | Esc |
| Screenshot | P |

HUD: coords, biome, chunks, fly badge, view, FPS. Crosshair + wireframe highlight. Settings view 2–8, sens 0.5–6, FOV 60–95 live + persisted.

## A7) Game Screenshot Capture

**P key (recommended):** `bun run dev` → :3000 → keep menu open → **P** → move download to `screenshots/main-menu.png`; click Play → lock → frame sky/hills/trees/water/HUD → **P** → `screenshots/in-game.png`. Then `bun run sync:screenshots` copies to `website/public/screenshots/` for the site.

Browser security prevents direct write to `screenshots/`; game triggers download you move. Canvas `preserveDrawingBuffer:true`. DevTools capture also works. Automated: `bun add -d playwright && bunx playwright install chromium && bun run build && bun run preview & bun run capture`.

## A8) Performance (Game)

One mesh per chunk (solid) + optional water, single draw call each, disposed on unload; dt capped 50ms; `pixelRatio` ≤2; fog density scales with view; ~28 cloud clusters cheap; no shadows, no per-frame allocations, texture-free.

---

# PART B — MARKETING WEBSITE

## B1) Product / Design Interpretation

Prompt: marketing/information site for the *existing* game — hero, pitch, showcase, features, controls, tech, status, CTA, footer. Must feel like a real indie voxel game’s landing page, not a generic SaaS dash.

**Interpretation — same Vox Crest world:** I treat the site as the game’s storefront. Same diamond ◈ mark, same slate/green/blue/sand palette, same blocky cards and grid, sky strip and cloud motifs — so the transition from site to game feels continuous. Copy is written as if the prototype is live and honest about its boundaries. Screenshot showcase is the hero of the page; if files are missing, the site admits it with labeled placeholders and copy-to-path instructions rather than faking renders.

Assumption: site is *static* and outbound-links to the game. I do not embed the WebGL canvas (heavy, duplicates the benchmark) — I link to `http://localhost:3000` (dev) / `:4173` (preview) and explain how to run locally.

## B2) Website Tooling & Justification

**Chosen: Vite + vanilla HTML/CSS/TypeScript — same toolchain as the game, but no framework runtime for the site.**

- **Why Vite (again):** Already installed for the game. Gives `bun run dev:website/build:website/preview:website` with HMR, preview server, and `vite build` static output to `website/dist/` — zero new dependencies, deployable as static hosting (Netlify, Cloudflare Pages, etc.). Shares `bun.lock`.
- **Why vanilla (no React/Astro/Next/Svelte):** This is a content marketing page, not an app. Seven sections + nav + tiny interactions need < 2 KB JS (mobile nav toggle, screenshot fallback, observer). React would ship ~40 KB runtime + hydration for no gain. Astro is excellent for content but would add a second framework and config for a page that Vite already builds statically. Next.js adds server, bundle size, complexity not needed for a static site.
- **Why not even lighter (single HTML file, no bundler):** Without Vite we lose TS checking (`check:website`), HMR while iterating, and `preview:website` parity with the game. A minimal bundler keeps the site maintainable and checkable without cost.

**Result:** ~22 KB HTML + 16 KB CSS + 2 KB JS gzipped ~6 KB + ~3.8 KB + ~1 KB — fast, no layout shift, no heavy deps.

## B3) Website Trade-offs

- **Shared toolchain vs isolated site:** Sharing Vite+Bun keeps install one-step (`bun install` works for both) and palette consistent, but couples configs. Mitigated by `website/vite.config.ts` with absolute `root`/`publicDir`/`outDir` so `dist/` (game) and `website/dist/` (site) never collide.
- **Static HTML vs component framework:** Static is simplest, most accessible, best Lighthouse. Cost is manual section markup — acceptable for 8 sections; if site grew to blog/docs, Astro would become preferable.
- **Plain CSS vs Tailwind/CSS-in-JS:** Plain CSS keeps bundle tiny and avoids `any` CSS-purge setup; BEM-ish classes + CSS vars (`--accent`, `--panel`, etc.) mirror the game’s `src/style.css` for visual continuity. Tailwind would add build weight for little benefit here.
- **Public screenshots via copy vs Vite asset import:** Site reads from `website/public/screenshots/` served at `/screenshots/`. Real game captures live at `screenshots/` (benchmark spec). A tiny `sync:screenshots` script bridges them; alternatively Vite could import via `../screenshots` but `publicDir` copy is more explicit and handles missing files honestly via JS fallback.

**Not overkill:** no framework, no router, no state. **Not too limited:** strict TS, semantic HTML, responsive grid, accessible nav, reduced-motion aware, image `onerror` fallback.

## B4) Website Implementation Plan

1. Scaffold `website/` with Vite vanilla, TS strict, plain CSS.
2. Layout semantic HTML: skip-link, header/nav, main (hero → pitch → showcase → features → controls → tech → status → CTA), footer.
3. Hero with eyebrow + headline + CTA + browser-frame visual (promotes `in-game.png`).
4. Screenshot showcase: two `figure`s (in-game large, menu secondary) with `img` + hidden `.img-placeholder` that JS reveals on `error`/`404`. Help card with copy-to-path code blocks for both `screenshots/` and `website/public/screenshots/`.
5. Features (6 cards), Controls (3 cards with `<dl>` + `<kbd>`), Tech (player + dev columns + stack card + code snippet), Status (done/next), CTA band.
6. CSS: same vars as game, blocky cards, pixel grid in placeholders, cloud/sky gradients, responsive 960/640 breakpoints, focus-visible, contrast-checked.
7. TS: mobile nav toggle, screenshot existence check via `error` + `fetch HEAD` fallback, intersection-observer fade-in (disabled under `prefers-reduced-motion`).
8. Build plumbing: `website/vite.config.ts` with absolute paths, `website/tsconfig.json`, `package.json` scripts, `sync:screenshots`.

## B5) Website Structure

```
website/
├── index.html          # semantic landing, all 9 required sections
├── play.html           # embeds game via iframe (/play.html → :3000 dev / :4173 preview, auto-detected)
├── vite.config.ts      # root/publicDir/outDir absolute, ports 3001/4174, multi-page (main + play)
├── tsconfig.json       # strict, bundler, isolatedModules
├── public/screenshots/
│   └── README.md       # where real PNGs go; site shows labeled placeholders if missing
├── src/
│   ├── main.ts         # ~70 lines: nav, screenshot fallback, observer
│   └── style.css       # ~500 lines: vars, header, hero, browser-frame, grids, responsive
└── dist/               # built static site (22 KB html + 5.5 KB play + 16 KB css + 2 KB js)
```

Root plumbing:
- `package.json` adds `dev:website`, `build:website`, `preview:website`, `build:all`, `sync:screenshots`, `check:website`.
- `screenshots/README.md` + `website/public/screenshots/README.md` document both copy locations.

## B6) Setup & Run (Website)

```bash
bun install
bun run dev:all           # ONE COMMAND: website :3001 + game :3000 — open :3001 → Play
bun run dev:website       # site alone :3001 (HMR)
bun run build:website     # → website/dist/
bun run preview:website   # :4174
bun run preview:all       # both previews :4174 + :4173
bun run check:website     # tsc --noEmit --project website/tsconfig.json
bun run build:all         # both builds
```

`website/play.html` embeds the game (`/play.html` → iframe to `http://localhost:3000` in dev, `:4173` in preview, auto-detected). Direct link still works at `:3000`/`:4173`.

Deploy `website/dist/` as static (drag to Netlify, `wrangler pages publish website/dist`, etc.). No env vars needed.

## B7) Screenshot Notes (Website)

Spec expects `screenshots/main-menu.png` and `screenshots/in-game.png` from the game benchmark. Website serves from `website/public/screenshots/` at URL `/screenshots/…`.

- **If real files exist:** `bun run sync:screenshots` copies `screenshots/*.png` → `website/public/screenshots/*.png`. The site’s `src/main.ts` finds the images and hides placeholders. Promoted visual: `in-game.png` in hero + showcase main; `main-menu.png` in showcase secondary.
- **If missing:** `img` fires `error`, JS shows `.img-placeholder` with dashed border, grid texture, and honest label: “IN-GAME PLACEHOLDER — Add `screenshots/in-game.png` and `website/public/screenshots/in-game.png`. Capture with **P** in the running game.” No fakes, correct `alt` text still present. `fetch HEAD` guard handles cached 404s.

Build still succeeds when images are missing; placeholders keep layout stable (fixed `aspect-ratio`, no shift). `alt` attributes describe what the screenshot *should* show.

## B8) Accessibility Notes

- Semantic: `<header>`/`<nav>`/`<main>`/`<section aria-labelledby>`/`<figure>`/`<figcaption>`/`<footer>`, skip link, heading hierarchy, `<dl>` for controls.
- Buttons/links: real `<a>` and `<button>`, `aria-expanded` on nav toggle, `aria-label` on icon brand.
- Contrast: text `#e8eef4` on `#0f1419` (~13:1), muted `#9aa8b8` on panel (~5.5:1), `kbd` borders, focus-visible `outline:2px solid #6bc259`.
- Keyboard: nav links, CTAs, toggle all reachable; no content hover-only; mobile nav closes on link click.
- Alt text: both showcase images and hero image have descriptive alt covering terrain, HUD, and menu; placeholders have visible text equivalents.
- Reduced motion: `prefers-reduced-motion: reduce` disables `scroll-behavior` and observer animations; no auto-playing video.
- Text size: base 15px, headings `Space Grotesk`, mono body, line-height 1.6, no tiny text.

## B9) Performance Notes (Website)

- No framework runtime. Total shipped: ~2 KB JS (nav + fallback + observer), 16 KB CSS, 22 KB HTML — gzipped ~1 KB + 3.8 KB + 6.6 KB. Game’s 560 KB Three bundle is *not* shipped with the site.
- Images lazy except hero (`loading="eager"` vs `lazy` for showcase), `aspect-ratio` reserves space to avoid CLS, `preconnect` for Google Fonts.
- Vite `emptyOutDir` for `website/dist`, CSS is single file, JS is single module, no layout-shift on placeholder swap (same aspect box).
- Score-friendly: static HTML, no client fetch for content, no heavy deps.

## B10) Verification Checklist

**Commands (all verified in this env):**
```bash
bun install            # ✓
bun run check          # ✓ game tsc
bun run check:website  # ✓ site tsc
bun run build          # ✓ game → dist/ (560 KB)
bun run build:website  # ✓ site → website/dist/ (22 KB html + 5.5 KB play + 16 KB css + 2 KB js)
bun run preview        # ✓ :4173 serves game
bun run preview:website # ✓ :4174 serves site
bun run dev:all        # ✓ ONE COMMAND: site :3001 + game :3000 (website Play → /play.html iframe)
bun run preview:all    # ✓ both previews
bun run sync:screenshots # ✓ honest placeholder handling when missing
```

**Game checklist (manual play):**
- [ ] Menu, HUD, terrain, chunks, gravity, flight, mouse-look, break/place, hotbar, pause/settings, view/sens/FOV, clouds, P screenshots — all wired (see `src/game/`).

**Website checklist (required sections & a11y/perf):**
- [x] Framework choice justified (Vite+vanilla, why not heavier/lighter)
- [x] Hero — eyebrow + headline + CTAs + browser-frame with in-game visual
- [x] Pitch — “tiny sandbox that feels like a place”
- [x] Showcase — two figures (in-game + menu) with alt text, prominent, honest placeholders
- [x] Features — 6 cards covering terrain, chunks, flight, build, landforms, sky
- [x] Controls — 3 cards with WASD, mouse, Space, double-tap, Shift/Ctrl, LMB/RMB, 1–9, Esc, P
- [x] Tech — player + dev columns, stack card, run-locally snippet, outbound links to game
- [x] Status — honest prototype language (done/next)
- [x] CTA — “Crest the next ridge” with Play + capture link
- [x] Footer — brand, play/build/meta columns, honest disclaimer
- [x] Responsive — 960px/640px breakpoints, mobile nav toggle
- [x] Semantic HTML, accessible links/buttons, focus-visible, alt text, contrast checked
- [x] Reduced-motion aware, no hover-only content
- [x] No heavy deps, real screenshots used if present, placeholders labeled when missing, no fakes

## B11) Limitations & Next (Website)

- No blog/docs — if content grew, migrate to Astro with content collections.
- Screenshots are static files, not responsive `srcset` — would add optimized `avif`/`webp` + `srcset` for larger deployments.
- No i18n. Copy is hand-authored EN only; lorem ipsum avoided, but tone could be localized.
- Playwright CI that asserts `screenshots/*.png` and `website/public/screenshots/*.png` exist before `build:website` would be next.

## B12) Honest Self-Critique (Website)

- **Strengths:** One-toolchain coherence (game + site share palette, Bun, Vite), tiny JS, honest missing-screenshot UX, semantic/responsive/accessible baseline without overclaiming. Build/preview parity makes local benchmark fair.
- **Weaknesses:** No image optimization pipeline beyond Vite hashing; hero copy could be A/B tested; site and game share no design tokens file (vars duplicated across `src/style.css` and `website/src/style.css` — intentional to keep game self-contained, but a shared token would be DRYer.
- **Another day:** Add shared `tokens.css`, `avif` pipeline, Playwright CI, and a minimal “embed game” iframe toggle for visitors who want to peek without leaving the page.

---

# Cross-Cutting Notes

- **No Minecraft IP:** No logos, textures, sounds, art, or brand copy. Original “Vox Crest” only.
- **Scope boundary respected:** Game is playable prototype, site is marketing — site links to game rather than re-implementing it.
- **Screenshots:** Real captures preferred; placeholders are clearly labeled and build-safe. Never faked.
- **Feedback:** https://github.com/anomalyco/opencode — note via Muse Spark.

## License

Original code. Not affiliated with Mojang/Minecraft.
