# Verdant Isles

An original, playable browser voxel sandbox. Explore the **Cedar Coast**, reshape its beaches, and build with a small creative inventory. This is a game prototype, with a game menu and HUD, rather than a marketing website. All terrain colors, cloud forms, and interface artwork are original; no Minecraft assets are used.

## Run with Bun

Requires Bun and a modern desktop browser with WebGL and keyboard/mouse input.

```bash
bun install
bun run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`) and append `/play/` for the game. The root URL now hosts its companion website. If the port is occupied, Vite prints the next available port.

```bash
bun run check       # strict TypeScript + four game tests and two website tests
bun run build       # typecheck and production bundle in dist/
bun run preview     # serves that build, normally localhost:4173
```

Everything needed by the game, including fonts, is served locally. Playwright is a development-only dependency; visitors do not download it.

## Stack and decisions

**Three.js + strict TypeScript + Vite**, using **Bun** for installation and every script.

- Three.js provides tested WebGL rendering, indexed geometry, frustum culling, lighting, fog, and GPU resource disposal. The game owns its voxel data, collision, movement, and grid raycast.
- Plain TypeScript and DOM overlays are sufficient for these small menus. React or Svelte would add a second lifecycle without simplifying the game loop. UI, physics, generation, and rendering remain separate modules.
- Vite supplies fast development, CSS/font handling, and a reproducible production bundle. Raw browser modules would leave production packaging and TypeScript compilation to custom tooling.
- Raw WebGL would spend this prototype's complexity budget on shader/buffer management. Babylon.js or a full ECS/game engine would be useful for a larger game, but brings abstractions this compact creative slice doesn't need.
- Visible-face meshes are deliberately simpler than greedy meshing. They remove internal faces without thousands of cube draw calls. Greedy meshing and workers are appropriate next optimizations, rather than prerequisites for this world size.

## Implementation map

| File | Responsibility |
| --- | --- |
| `play/index.html` | Canvas host and game entry |
| `src/main.ts` | Renderer, sky/light/clouds, input, game states, screenshot download |
| `src/terrain.ts` | Fixed-seed noise, coast/mountain heights, caves, seam-safe trees |
| `src/blocks.ts` | Block IDs, inventory, solid classification, original color palette |
| `src/world.ts` | Chunk data/cache, edit journal, face meshing, disposal, voxel DDA |
| `src/player.ts` | Mouse-look, AABB collision, gravity, jumping, creative flight |
| `src/ui.ts`, `src/style.css` | Game menu, HUD, pause, controls, settings, responsive styles |
| `src/terrain.test.ts` | Determinism/materials, edit retention, selection, physics checks |
| `scripts/screenshots.ts` | Real full-viewport PNG capture |
| `scripts/smoke.ts` | Browser gameplay smoke verification |
| `vite.config.ts`, `tsconfig.json`, `package.json`, `bun.lock` | Build configuration and locked dependencies |
| `screenshots/main-menu.png`, `screenshots/in-game.png` | Captured game screenshots, 1440 × 900 |

Implementation order: establish the rendering/tooling foundation → deterministic voxel data and efficient chunk faces → player collision/input and block edits → menus/HUD/settings → browser verification and screenshot review.

## Controls

Click **Enter the world** to capture the mouse. Escape releases it and pauses. If your browser declines pointer lock, click the world to try again.

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Space | Jump, or ascend while flying |
| F | Toggle creative flight; indicator appears in top-right HUD |
| Shift | Descend while flying |
| Ctrl | Move faster |
| Left mouse | Break targeted block |
| Right mouse | Place selected block on targeted face |
| 1–8 / scroll wheel | Select building block |
| Escape | Pause / release pointer lock |
| P | Download a PNG of the rendered world (without DOM HUD) |
| H | Toggle HUD and selection outline for clean photography |

The hotbar also has clickable, labeled buttons when the mouse is released. Controls are available from both main and pause menus. Settings adjust **view distance (2–5 chunks)** and **mouse sensitivity (0.2–2×)** immediately and persist locally. Edits cannot overlap the player's collision volume; the bottom world layer cannot be removed.

## Screenshot workflow

The two PNGs already in `screenshots/` are real captures of this application. To regenerate them:

```bash
# Once: install the headless browser
bunx playwright install chromium

# Terminal 1
bun run dev

# Terminal 2 (use the actual port printed by Vite)
bun run screenshots
```

If using another port or the production preview:

```bash
GAME_URL=http://127.0.0.1:5174 bun run screenshots
# Or, after build and preview:
GAME_URL=http://127.0.0.1:4173 bun run screenshots
```

This captures the full browser viewport, including the real DOM menu/HUD, at 1440 × 900 into:

- `screenshots/main-menu.png`
- `screenshots/in-game.png`

The capture script loads `/play/` and `/play/?capture=game`. The latter starts the **same generated world, player camera, meshing, and HUD** at the standard spawn without requesting pointer lock. Input simulation waits until you click the world; no substitute scene or image is used. Software WebGL is enabled for headless environments. Waits ensure rendering and local fonts are ready.

**Manual full-UI capture:** open `/play/`, take a browser/OS viewport screenshot, and save it as `screenshots/main-menu.png`. Open `/play/?capture=game`, wait for terrain, and save another viewport screenshot as `screenshots/in-game.png`. Use a 1440 × 900 viewport for the supplied composition. A browser screenshot captures the menu/HUD; **P** captures only the WebGL canvas and downloads `in-game-world.png` or `main-menu-world.png`. Browsers cannot directly write into your repository's screenshot folder.

## Verification

```bash
bun run check
bun run build
# With a running dev or preview server:
GAME_URL=http://127.0.0.1:5173 bun run check:browser
```

The lightweight browser script verifies actual pointer lock, keyboard movement, flight, settings, selection, edits, PNG download, pause/resume, return to menu, and menu usability at 640 × 640. Relative mouse deltas and edit mouse events are dispatched to the normal input listeners because headless absolute mouse coordinates wrap unreliably under pointer lock. It does not bypass world mutation or physics. The browser page must have no runtime errors.

### Completed checklist

- [x] `bun install`, `bun run dev`, `bun run build`, and `bun run preview` verified in this environment.
- [x] `bun run check` passes strict typechecking, four game tests and two website fallback tests.
- [x] `bun run check:browser` passes browser gameplay smoke checks.
- [x] Framework/tooling justified; Bun is the package manager and script runner.
- [x] Main menu and in-game HUD.
- [x] Seeded procedural voxel terrain and chunk-based loading/unloading.
- [x] Editable block data, boundary mesh rebuilds, and retained edits after unloading.
- [x] Efficient visible-face meshes, shared materials, disposed replaced geometry.
- [x] Gravity, collision, jumping, creative flight, and mouse look.
- [x] Block breaking, placement, player-overlap prevention, hotbar/scroll selection.
- [x] Pause/resume/menu, view distance, and sensitivity settings.
- [x] Procedural clouds/sky/fog and terrain variation.
- [x] Trees, shores, hills/mountain ridges, water, carved cave galleries/openings.
- [x] Controls documented in the game and README.
- [x] Screenshot workflow documented and successfully run.
- [x] Real `screenshots/main-menu.png` and `screenshots/in-game.png` generated.
- [x] No placeholder-only gameplay systems or fake screenshot claims.

**Manual feel checklist:** try walking uphill (jump onto full-height steps), jumping against a wall, flying into terrain, placing near your feet, editing across a chunk boundary, scrolling the hotbar, pausing during movement, and exploring beyond the initial view. Confirm settings feel comfortable on your mouse and hardware. Automated tests establish functionality; subjective movement feel still benefits from human review.

## World and performance notes

- Seed **74821**, 16 × 16 horizontal chunks, 64-block vertical range, water level 12. Noise forms a basin, rolling meadows, and a northern mountain ridge. Tree anchors are sampled globally so leaves/trunks line up at chunk borders. Carved winding galleries intersect slopes north of the basin.
- Radius 3 displays up to **49 chunks**; radius 2 displays 25 and radius 5 displays 121. Only exposed voxel faces are emitted into indexed opaque/water geometry, at most two meshes per chunk. Frustum culling removes off-camera chunks. Clouds use one instanced draw call.
- Chunk mesh construction is queued with an approximately 8 ms per-frame budget. One individual chunk can exceed that budget; there is no worker. Immediate editing rebuilds the changed chunk and its loaded cardinal neighbors to ensure correct borders.
- Chunk buffers outside a one-chunk data halo are unloaded; edited cells remain in a sparse session journal and reapply on regeneration. Old GPU geometry is disposed on rebuild/unload; materials/cloud geometry are shared for the app lifetime. One animation loop is used.
- Pixel ratio is capped at 1.5. No expensive real-time shadows or postprocessing. Fog softens chunk boundaries. Reduced-motion preference stops the menu camera drift and cloud animation.
- Runtime diagnostics are available as read-only `window.verdant.state`: loaded mesh count, draw calls, triangles, player state, selection, and edited-cell count. Headless software rendering is useful for functional checks, **not** a representative laptop GPU FPS benchmark.

## Scope, limitations, and honest self-critique

This is a complete creative-mode prototype, not a survival game. No crafting, enemies, inventory scarcity, sound, multiplayer, day/night cycle, or mobile touch controls. Edits persist within the current tab, including returning to the menu, but **refreshing discards them**. Settings persist independently. The fixed seed is not user-editable.

Water is non-solid decoration, with no buoyancy, swimming, flow, or underwater effects. Transparent chunk sorting can show minor artifacts. Sunstone is a warm-colored building block, not a dynamic light source. Collision works in flight as well as on foot, but there is no automatic stair stepping. Caves are simple carved galleries, not a full underground biome. Small windows remain usable; the game is designed primarily for desktop.

The strengths are the coherent menu/HUD, real editable world, compact architecture, and reproducible capture workflow. The weakest visual points are the simple block-color surfaces, lack of ambient occlusion/shadows, and abrupt grassy/dirt cliff transitions around the basin. Main-thread generation/edit remeshing is the main scaling limitation. The renderer bundle is about 130 kB gzipped plus small app/CSS and locally bundled fonts; the stack is lean relative to a full engine but still includes Three.js's renderer.

Next improvements, in order: persistent world saves → worker meshing and greedy faces → vertex ambient occlusion and richer original procedural textures → smoother terrain transitions/step movement → swimming and sound. These improve the existing playable slice without expanding into a shallow survival feature list.
