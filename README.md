# Wildmere

**A little world. Entirely yours.**

A playable, original WebGL creative sandbox and its companion field-guide website. Start beside a turquoise lake, explore wooded hills and snowy limestone ridges, or take flight and reshape the terrain. The main menu looks into the same generated world you play in. All textures, terrain, clouds, and branding are original procedural artwork; no Minecraft assets are used.

The **website is at `/`** and the **preserved playable game is at `/play/`**. See [SITE.md](SITE.md) for website architecture, screenshot processing, accessibility, performance, verification, and deployment details. The rest of this README documents the game.

## Run Locally

Requires Bun 1.3+ and a modern desktop browser with WebGL2, hardware acceleration, and pointer lock. Development is local; there is no backend, account, API key, or external asset service. Fonts are bundled locally.

```bash
bun install
bun run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`, to visit the website. Follow a **Play** link, or open `http://localhost:5173/play/` directly. Wait for **Your wilderness is ready**, then click **Enter the world**. That click captures the mouse. If capture is denied, click **Keep exploring** to retry. Escape releases it.

```bash
bun run check
bun run build
bun run preview
```

Preview normally runs at `http://localhost:4173`. `check` runs strict TypeScript checking, formatting checks, and Bun unit tests. `build` checks TypeScript and creates `dist/`. `bun run format` formats source and documentation.

## Tooling Decision

**TypeScript + Three.js + Vite, with Bun for installation and scripts.** Three.js supplies WebGL resource management, cameras, lighting, indexed geometry, frustum culling, and raycasting. The game implements its own small voxel world and player controller. HTML/CSS handles menus and HUD; it is not updated through a UI framework every frame.

- A full engine such as Babylon.js or an ECS/physics stack would add systems and abstractions this small creative slice does not need.
- React or Svelte would be reasonable for a larger inventory/editor, but a handful of menus does not justify a second application lifecycle or render model.
- Raw WebGL would save some library bytes at the cost of handwritten shaders, lighting, picking, buffers, and resource lifecycle code. That is the wrong trade-off for this benchmark.
- Plain JavaScript or a single HTML file would be lighter in setup but weaker for maintaining chunk, input, and world-data contracts.
- Vite provides fast development and a straightforward production bundle. Bun remains the only package manager and script runner. Playwright and Prettier are development-only tools.

This is not a general-purpose game engine. The modest module boundary is enough to keep generation, rendering, physics, and UI independently understandable.

## Implementation Map

The implementation sequence was terrain/data first, then visible-face chunks, player collision and editing, game UI, and finally browser verification and screenshot composition.

| File                                                   | Responsibility                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `play/index.html`                                      | Full-viewport game canvas and minimal accessible app host                        |
| `src/terrain.ts`                                       | Seeded value noise, block definitions, lake/ridge terrain, beaches, trees, caves |
| `src/materials.ts`                                     | Original generated pixel-texture atlas and water material                        |
| `src/world.ts`                                         | Chunk data, edit overlay, visible-face meshes, streaming and disposal            |
| `src/player.ts`                                        | Mouse orientation, gravity, jumping, swimming, flight, AABB collision            |
| `src/ui.ts`                                            | Main menu, HUD, hotbar, pause, help, settings, toast feedback                    |
| `src/style.css`                                        | Responsive field-journal visual identity, keyboard focus and reduced motion      |
| `src/main.ts`                                          | Scene, sky, input, settings persistence, raycasting, photos and game loop        |
| `src/terrain.test.ts`                                  | Determinism, content, edit persistence, chunk seams and physics tests            |
| `scripts/screenshots.ts`                               | Chromium gameplay smoke checks and actual viewport captures                      |
| `package.json`, `bun.lock`, `tsconfig.json`            | Bun scripts, locked dependencies and strict typing                               |
| `screenshots/main-menu.png`, `screenshots/in-game.png` | Real game captures produced by the script                                        |

The original `index.ts` starter is unused. Vite builds two entries: `index.html` for the website and `play/index.html` for the game. Website source is isolated under `src/site/`; the game does not share its global styles.

## Controls

| Input                 | Action                                                      |
| --------------------- | ----------------------------------------------------------- |
| WASD or arrow keys    | Move                                                        |
| Mouse                 | Look while pointer-locked                                   |
| Space                 | Jump; swim upward in water; ascend during flight            |
| Double-tap Space or F | Toggle creative flight on/off; state is shown at upper left |
| Shift                 | Descend during flight                                       |
| Left Ctrl             | Hold to sprint on foot or boost flight speed (1.65×)        |
| Left mouse button     | Break the targeted block, up to 7 blocks away               |
| Right mouse button    | Place the selected block against the target face            |
| 1–8 or scroll wheel   | Select a block                                              |
| Escape                | Pause and release the mouse                                 |
| P                     | Download a canvas-only PNG photograph                       |
| H                     | Hide/show the in-game HUD                                   |

There are eight unlimited building materials: meadow/grass, earth, limestone, sand, cedar, canopy/leaves, timber planks, and snow. Water is world scenery and swimmable, not a selectable building material. Flight still collides with terrain. Use jumping to climb one-block steps on foot. There is no automatic step-up.

The main and pause menus include **How to play**. Settings expose immediate view-distance and mouse-sensitivity changes. Settings are remembered in local storage when available; blocked storage does not prevent play. Native buttons, sliders, modal dialog focus, visible focus rings, and live status messages support keyboard use in the menus. The 3D game itself requires visual navigation and desktop input; it is not screen-reader playable. Smaller windows are supported, but touch movement is not implemented.

## Screenshots

The two supplied PNGs are real 1440×900 browser screenshots. To recreate them, install Chromium once and run:

```bash
bunx playwright install chromium
bun run screenshots
```

On a supported Linux distribution missing browser libraries, `bunx playwright install --with-deps chromium` installs the required system dependencies and may request elevated privileges.

The script starts its own development server on port **4175**, waits for generated chunks and bundled fonts, captures the actual main menu, clicks into the game with real pointer lock, and captures the grounded default spawn with its HUD. It then tests block selection, breaking, placement, flight, movement, pause, settings, photo download, and a 640×720 viewport. It checks for uncaught browser errors and stops its server afterward. Leave port 4175 free.

- `screenshots/main-menu.png`: title and interactive menu over the generated basin.
- `screenshots/in-game.png`: actual on-foot gameplay, lake, trees, mountains, sky, crosshair, and hotbar.

The test uses software WebGL for reproducibility, so its frame rate is not representative of a hardware-accelerated laptop. Relative look/button events in the block-interaction test are dispatched through the normal DOM input listeners to avoid Chromium headless absolute-coordinate warps under pointer lock. The test never substitutes a different scene, teleports the player, or paints fake terrain/HUD.

To verify the production build with the same browser checks:

```bash
bun run build
WILDMERE_PREVIEW=1 bun run screenshots
```

**Manual viewport workflow:** run the game at 1440×900 or your preferred desktop size. At the main menu, use your browser/OS screenshot tool and save `screenshots/main-menu.png`. Click **Enter the world**, let the player settle, and capture `screenshots/in-game.png` without moving the mouse. Avoid Escape before that capture, since it deliberately opens the pause menu. To recover the original composition, reload the tab; this also resets edits.

**Photo shortcut:** press **P**, or use **Capture a photo** in the pause menu, to download `wildmere-photo.png`. This exports only the WebGL canvas, not the HTML menu/HUD. It is useful for clean landscape photos, but is **not** a substitute for the two viewport screenshots above. Browsers do not allow an ordinary game page to write directly to a project folder; the automation script can do so. No placeholder images are used.

## World and Performance

- Fixed seed **8317**, 16×16 horizontal chunks, 88-block vertical storage. Terrain extends horizontally as you move; the scenic basin and ridge are anchored around the origin.
- Grass, dirt layers, sand shores, stone, snowcaps, trees with cross-chunk crowns, a lake and winding dry cave pockets are generated deterministically. Beyond the basin the landscape becomes lower rolling wooded terrain rather than an endless sequence of identical lakes.
- Chunk block data uses `Uint8Array`. An edit overlay restores changed blocks when a chunk unloads and is regenerated. **Edits persist only within this tab's session**, not across a reload.
- Only exposed voxel faces are emitted into indexed chunk geometry. Each chunk has at most one opaque land mesh and one transparent water mesh. There are no individual cube meshes for terrain.
- Boundary edits rebuild the affected chunk and any loaded face-neighbor sharing that border. Replaced/unloaded geometries are disposed; shared materials and textures are retained. The world has one animation loop.
- View distance defaults to **12 chunks (192 blocks)** and is adjustable from 2 to **24 chunks (384 blocks)**. Fog is pushed toward the outer part of that range. Existing saved settings at the old default of 6 upgrade to 12 once; deliberately lower settings are preserved. Pending chunks are ordered nearest-first and built within a soft 7 ms per-frame budget; one chunk may exceed this. Mesh unloading has a small hysteresis margin, while unedited chunk data is discarded farther away. Edited data is retained sparsely for the session.
- Doubling the view radius loads roughly four times as many chunks. Higher distances need more memory and loading time; use 2–6 on smaller laptops. Draw calls vary with the camera, distance, movement and boundary hysteresis. No hardware FPS benchmark is claimed.
- Clouds use a single instanced draw. The sun and fog are inexpensive; there are no real-time shadows, postprocessing passes, or expensive sky simulation. Pixel ratio is capped at 1.75. Texture mipmaps reduce distant shimmer.
- The production JavaScript is roughly **137 KB gzip** plus CSS and locally bundled fonts. Vite warns that the single minified JS chunk exceeds 500 KB; this is chiefly Three.js. Splitting that same eagerly needed renderer would not reduce initial game download, so the warning is documented rather than hidden.
- `preserveDrawingBuffer` makes canvas photographs reliable but costs some rendering efficiency. Terrain meshing is main-thread and not greedy-merged. Sustained large editing sessions increase the sparse edit overlay's memory usage.

## Verification Checklist

The following were exercised in this workspace, not inferred from implementation alone:

- [x] `bun install` completes and updates `bun.lock`.
- [x] `bun run dev` serves the working game, exercised by the screenshot script.
- [x] `bun run build` produces a production bundle.
- [x] `bun run preview` serves the production game, exercised by the same browser script.
- [x] `bun run check` passes strict types, formatting, and Bun tests.
- [x] Framework choice and heavier/lighter alternatives are justified above; Bun is used throughout.
- [x] Main menu, in-game HUD, hotbar, pause, help and settings are implemented and browser-tested.
- [x] Procedural terrain has deterministic chunks, editable block data, visible-face geometry and boundary rebuilds.
- [x] Tests check water, trees, varied heights, snow, beaches and cave pockets; actual landscape is visible in the screenshots.
- [x] Gravity, landing, jumping, collision and creative flight have physics tests.
- [x] Browser checks exercise mouse look, pointer lock, movement, flight, block breaking, placement and selection.
- [x] Placement checks the player's collision volume; bedrock/build ceiling are protected.
- [x] View distance changes chunk count; sensitivity changes update immediately; pause releases pointer lock.
- [x] Sky, sun, instanced procedural clouds and water are rendered.
- [x] Controls are available in-game and documented above.
- [x] Real `screenshots/main-menu.png` and `screenshots/in-game.png` are generated by the documented workflow.
- [x] Canvas PNG download is browser-tested; its HUD exclusion is explicitly documented.
- [x] Browser smoke checks report no uncaught JavaScript errors and no horizontal overflow at 640×720.
- [x] No fake screenshots, imported game assets, placeholder-only systems or claimed survival features.

For a human playthrough, also try repeatedly crossing chunk boundaries, building beside a border, swimming from deep water to the beach, pausing/resuming several times, and running at distances 2, 12 and 24 on your own GPU. Double-tap Space within 280 ms to start or stop flying; a single tap still jumps or ascends. These are useful acceptance checks beyond the short automated smoke route.

## Limitations and Self-Critique

This is a compact creative prototype, not a survival game: no crafting, inventory limits, enemies, sound, multiplayer, saving, fluid propagation, world regeneration UI, day/night cycle or touch controls. Water renders a static transparent top surface; it has no physical flow or refraction, and its side walls are not modeled. Removing blocks at a shore does not cause flooding. Cave pockets are simple cuts, not a connected underground exploration system. The vertical build ceiling is 88 blocks; flight is capped above it. Extremely distant coordinates are not suitable for endless play because of floating-point precision.

The strongest parts are the coherent main menu/game presentation, screenshot-ready spawn, editable deterministic chunks, and deliberately small stack. The visual weak points are repetitive tree shapes, terraced ridges, basic lighting without ambient occlusion or cast shadows, and highly transparent water. Low-end devices can hitch on chunk builds, particularly after changing view distance. The browser smoke test is useful but not a substitute for long play sessions or cross-browser GPU testing.

The most valuable next improvements would be **IndexedDB world saves**, **worker-based greedy meshing**, a more varied tree/rock palette, and lightweight ambient occlusion. Add those before inventory/crafting or more menus; stability and visual depth matter more than widening the feature list.
