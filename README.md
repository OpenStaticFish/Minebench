# Blockvale

A browser-based voxel sandbox game prototype built with Three.js + TypeScript, developed and run with Bun. Chunked procedurally generated terrain (fixed seed), block breaking/placing, day sky with sun and clouds, and a full menu / HUD / pause / settings flow — plus a marketing landing page for the prototype.

![In-game screenshot](screenshots/in-game.png)

## What's in this repo

The Vite build produces **two pages** (see `vite.config.ts`):

- `index.html` — the marketing/information website (`src/site/`).
- `play.html` — the playable game (`src/game/`, `src/ui/`, entry `src/main.ts`).

Each page has its own entry chunk, so visiting the landing page never downloads the 540 kB game bundle. All CTA buttons on the site link to `play.html`, where the real prototype runs.

## Interpretation of the brief

The task (see `mineclone.md`) was a playable voxel sandbox prototype in the spirit of a Minecraft-like benchmark: a single-page app with no build step required for the user beyond serving static files, deterministic procedural terrain, real-time first-person controls, block editing, and polished menus. "Polish" was weighted heavily, so equal effort went into the UI shell (main menu, pause, settings that persist) and the engine internals (greedy face culling, baked ambient occlusion, chunk streaming with per-frame budgets).

## Tooling choices and trade-offs

- **Bun** instead of npm/node for installs, scripts, and test-running — faster installs and a first-class TS runner for the automation scripts.
- **Three.js** for rendering: hand-rolled WebGL was rejected to keep the prototype focused on game systems; Three gives us materials, fog, and buffer geometry management for free.
- **Vite** for dev/build. The production build in `dist/` is fully static — open it through any static server.
- **No framework** for UI: overlays are plain DOM elements, which keeps the bundle small and avoids a virtual DOM for things that update a few times per second.
- **Procedural textures**: all block textures are generated at startup into one atlas canvas — no asset pipeline, no downloads, tiny repo.
- **Playwright** (with SwiftShader software WebGL) for automated screenshots and engine smoke tests, so verification works headlessly on machines without a GPU.

Trade-off acknowledged: software rendering caps the headless FPS used during automated checks (~10–25 FPS); on real hardware with a GPU the render loop is lightweight (few draw calls per chunk, one atlas texture).

## Setup

```bash
bun install        # or: npm install
bun run dev        # dev server (site at /, game at /play.html)
bun run build      # production build of both pages into dist/
bun run preview    # serve the production build
```

## Marketing website

The landing page is a static, near-zero-JS page (`index.html` + `src/site/`):

- Sections: hero, pitch, screenshot showcase, features, controls, technical highlights, project status, CTA, footer.
- Visual identity: pixel typography (Press Start 2P), grass/dirt/stone "strata" dividers, box-shadow pixel clouds, blocky inset-shadow cards — echoing the in-game UI palette.
- ~0.15 kB of JS (footer year + font/CSS bundling) and one stylesheet; no framework.
- Uses optimized WebP copies of the benchmark screenshots. Raw captures stay untouched in `screenshots/`; run `bun run images` to regenerate `public/screenshots/*.webp` (uses ffmpeg's libwebp encoder when available, falls back to copying the PNGs).

Site-specific scripts:

```bash
bun run site:shots   # full-page captures: screenshots/site-desktop.png + site-mobile.png
bun run site:check   # static checks over dist/: sections present, all referenced assets resolve, alt text on every <img>
bun run check        # typecheck + build + site:check
```

## Controls

| Input                | Action                                   |
| -------------------- | ---------------------------------------- |
| Click (in game)      | Lock pointer / capture mouse             |
| WASD                 | Move                                     |
| Space                | Jump (double-tap: toggle fly)            |
| Shift                | Sprint (fly: descend)                    |
| F                    | Toggle fly mode                          |
| Left click           | Break block                              |
| Right click          | Place selected block                     |
| 1–9 / mouse wheel    | Select hotbar slot                       |
| Esc                  | Pause menu (auto-pauses on pointer exit) |
| P                    | Save screenshot to `in-game.png`         |

Settings (render distance, FOV, clouds) live in the pause menu and persist in `localStorage` under `blockvale.settings.v1`.

## Automated screenshot workflow

`bun run screenshots` starts a preview server, launches headless Chromium (software WebGL), opens `play.html`, captures the main menu, then enters the game, waits for the spawn area to fully mesh, flies the camera to a scenic vantage (scans for a shoreline target and picks the best view), and saves:

- `screenshots/main-menu.png`
- `screenshots/in-game.png`

To retake the in-game shot manually: play, frame your shot, press **P** — the browser downloads `in-game.png`.

## Verification checklist (all automated)

Run everything with `bun run check` (typecheck + build), then:

- `bun run smoke` — headless engine assertions (opens `play.html`):
  - breaking a block removes exactly 1 voxel from the world data;
  - placing a block adds exactly 1 voxel (and is rejected inside the player);
  - gravity + collision: a falling player comes to rest on terrain within tolerance;
  - pointer-lock pause/resume state transitions.
- `bun run screenshots` — full render pipeline exercises menus, pointer lock, chunk streaming, and both deliverable images.

## Performance notes

- Face culling: only faces adjacent to non-opaque blocks are emitted; leaf-vs-leaf faces are skipped.
- Baked per-vertex ambient occlusion (with the classic quad-flip fix) — no runtime AO cost.
- Chunk streaming with generation/meshing budgets (4 gens, 2 meshes per frame) to avoid hitches; far meshes are disposed while voxel data (and your edits) are kept.
- One texture atlas, two materials, one draw call per chunk mesh.

## Known limitations (honest)

- Fixed world seed (`20260905`) — same terrain every run, by design for reproducible benchmarks.
- Edits are session-only (no save/load of modified worlds).
- Water is static (no flow), and swimming is simplified (slow walk + float).
- World height is 64 blocks; no mobs, crafting, or inventory beyond the 9-slot hotbar.
- Headless/software-GL runs are slow; visual quality is identical on real GPUs.
