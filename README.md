# Bracken Vale

A field guide and a playable desktop voxel sandbox. The **homepage (`/`)** introduces Alder Basin with real game captures, controls, and build notes. **Play Bracken Vale** opens the existing **game (`/play/`)**: start on a grassy bluff, fly down to the red-roofed shelter, or cut a stairway into the mountain.

**Website documentation:** [design, source map, image workflow, static deployment, and verification checklist](docs/site.md).

[Title-screen capture](screenshots/main-menu.png) · [In-game capture](screenshots/in-game.png)

## Run locally

Use **Bun** (tested with 1.4.2). The development/build machine also needs Node 22.12+ (or 20.19+) for Vite and the native Sharp image optimizer. The site works as ordinary static HTML; playing requires a desktop browser with WebGL 2, a keyboard, and a mouse.

```sh
bun install
bun run dev
```

Open the URL printed by Vite. Choose **Play Bracken Vale**, then **Enter world**, or go directly to `/play/`. No account, external asset service, or server-side game process is needed.

```sh
bun run check     # Strict TypeScript checking + Bun's unit tests
bun run build     # Type-check and produce dist/
bun run preview   # Serve the production build locally
bun run site:review # Check the built website and capture desktop/mobile previews
```

## Controls

| Action | Control |
| --- | --- |
| Move / look | **WASD** / mouse |
| Look without pointer lock | Arrow keys, or hold the middle mouse button and drag |
| Jump; ascend in water | **Space** |
| Toggle creative flight | **F** or double-tap **Space** |
| Fly up / down | **Space** / **Shift** |
| Break / place selected block | Left / right mouse button, within six blocks |
| Select one of eight materials | **1–8** or scroll wheel |
| Pause and release cursor | **Esc**; leaving the window also pauses |
| Resume | **Resume world**, or **Enter** from the pause heading |
| Save a PNG with the current UI | **P**; there is also a camera button on the menus |

**Field guide** is available from the title and pause screens. **Settings** changes chunk radius and pointer sensitivity immediately and remembers both locally. The speaker button enables a synthesized wind bed and occasional bird calls. Audio starts off.

## Capture the benchmark images

The two included **1600 × 900** PNGs were taken from a running production preview. To regenerate both from a fresh session:

```sh
bun run screenshots
```

The script starts its own local Vite server, opens Chromium, waits for the fonts and the terrain mesh queue, captures the menu, clicks **Enter world**, captures the playable HUD, then closes the browser and server. It overwrites:

- `screenshots/main-menu.png`
- `screenshots/in-game.png`

It uses `chromium` or `google-chrome` on your PATH. For another installation, set `CHROME_PATH` to its executable. If Chrome is not installed, Playwright can install a compatible headless browser: `bunx playwright-core install --only-shell chromium`. Linux installations also need Chrome's usual system libraries.

```sh
bun run screenshots --verify                    # Capture + browser interaction checks
GAME_URL=http://127.0.0.1:4173 bun run screenshots  # Use a running preview instead
```

`CAPTURE_DIR` overrides the output directory. Use the actual preview port if it differs.

**Manual capture:** open the game in a fresh tab, allow the valley to fill in, then click the camera button for `main-menu.png`. Click **Enter world** and press **P** for `in-game.png`. Move the two downloads into `screenshots/` using those exact names. The shortcut redraws WebGL and composites the live interface at matching resolution; it does not require screen-sharing permission.

## Tooling and implementation

**Three.js + strict TypeScript + Vite**, with Bun for packages, scripts, and tests. Three.js provides the camera, frustum culling, buffer geometry, texture upload, and GPU resource lifecycle. The game owns the voxel data, meshing, targeting, and collision. Vite provides a fast development loop and a static production build.

Raw WebGL would save library bytes but require recreating much of that rendering infrastructure. A full game engine would add scene, physics, and asset systems for a world that is already a collision grid. A reactive UI framework would add little to four menu views and a HUD: semantic DOM buttons, labels, and sliders suffice. The screenshot encoder loads on demand; Playwright is development-only.

The implementation follows four steps:

1. **Generate a world.** Seed `1847` drives coordinate-based noise, river bends, stepped highlands, groves, and carved rock galleries. The starting valley combines that generation with shaped ridges and an editable trail shelter. Tree crowns can span chunks without depending on generation order.
2. **Turn data into scenery.** Build indexed, textured faces into one mesh per horizontal chunk. Bake directional shading, corner occlusion, and short shadows into vertex colors. Add a gradient sky, instanced cloud boxes, and a light ripple shader for the river.
3. **Make the grid playable.** A substepped, axis-separated player box handles walking, gravity, jumping, swimming, and flight. A grid-traversal ray identifies the first solid voxel and its neighboring face. Edits update block data, reject placement inside the player, and rebuild the affected meshes.
4. **Expose and verify the loop.** Title, pause, guide, and settings share one screen controller. A separate browser capture script operates the ordinary UI and validates it against the actual rendered output.

### Source map

| Files | Responsibility |
| --- | --- |
| `play/index.html`, `index.ts`, `src/app.ts` | Game host, lifecycle, input routing, simulation loop, settings storage |
| `src/world.ts` | Deterministic chunks, trees, caves, shelter, sparse edit overrides |
| `src/player.ts` | Collision, movement, ray traversal, editing rules |
| `src/mesh.ts`, `src/atlas.ts` | Exposed-face geometry, shading, generated pixel textures |
| `src/scene.ts`, `src/sky.ts`, `src/river.ts` | Chunk streaming, GPU resource ownership, sky and water |
| `src/interface.ts`, `src/style.css`, `src/art.ts`, `public/mark.svg` | Menu, HUD, keyboard focus styles, original field icons and block specimens |
| `src/sound.ts`, `src/capture.ts` | Opt-in synthesized ambience and browser PNG downloads |
| `scripts/capture.ts`, `screenshots/` | Reproducible browser capture, smoke checks, resulting PNGs |
| `tests/{world,player,mesh}.test.ts` | Generation, collision, edit persistence, and chunk seam regressions |
| `package.json`, `bun.lock`, `tsconfig.json`, `src/env.d.ts` | Reproducible dependencies, Bun commands, strict compiler configuration |

Game textures, terrain, shelter, icons, and sounds are generated or drawn here. Barlow Condensed and IBM Plex Mono are bundled locally. Distribution notices are under `public/licenses/`.

## Performance notes

- Each chunk is a `16 × 16 × 80` byte array. A one-chunk data neighborhood lets the mesher see across boundaries. Raw arrays outside the working set are evicted; only sparse edits survive eviction.
- Radius **3–9**, default **8**, bounds the square of loaded meshes (289 at default). One shared terrain material and atlas serve all chunks, including the water. Three.js culls offscreen chunk meshes. There is no object per block.
- Nearby chunks in the viewing direction get priority. The renderer checks a roughly 6 ms generation budget **between chunks**; a single expensive chunk can exceed it. Superseded and unloaded geometries are disposed.
- Pixel ratio is capped at 1.6. The menu draws less often once streamed. Reduced-motion preference stops ambient animation. No fixed FPS across hardware is claimed.

## Verification checklist

Verified locally with Bun and desktop Chromium:

- [x] Installation, dev, check, build, and preview commands have been exercised. The suite includes 16 game tests and a separate missing-captures check for the website. The game also passed `bun run screenshots --verify`.
- [x] Bun manages and runs the project; the rendering and UI stack and its alternatives are explained above.
- [x] Main menu, playable HUD, crosshair, eight-slot hotbar, target outline, flight indicator, guide, and pause/resume/title flow.
- [x] Seeded, streamed terrain includes varied hills, snowy peaks, trees, sand, water, and a walk-in cave. Sky, clouds, and water are rendered in the game.
- [x] Individual blocks are editable. Revisited chunks retain changes during the session. Internal faces are culled; a seam test checks that removing a neighbor exposes exactly one quad.
- [x] Gravity, jumping, collisions, creative flight, pointer-lock mouse-look, selection, breaking, and placement. Unit tests cover body intersections, negative coordinates, and boundary targeting; browser checks perform a break/place pair through mouse input.
- [x] Both settings affect the running game and survive reload. Sliders and menu controls are keyboard-focusable. Compact desktop and narrow-window menu navigation were exercised.
- [x] Controls and capture workflows are documented. Both required PNGs are real game frames. The browser smoke check also downloads both manual-capture filenames and compares the menu download against a viewport capture.

**Quick hands-on route:** walk downhill and jump a ledge. Press **F**, fly toward the red roof, and descend with **Shift**. Near the ground, aim at a block until its name appears; break it, select shale with **3**, and replace it. Reduce view distance in Settings, travel away, then return and inspect the edit. The cave follows the bank near **X 22, Y 16, Z −19**.

## Limits and next improvements

The strongest slice is the starting valley: the view doubles as an orientation aid, and what you see is editable. Farther out, repeated river basins and a small material palette make exploration less distinctive. Water is a wadeable surface, not a fluid simulation. There is no crafting, multiplayer, touch movement, or cross-reload world save. Returning to the title preserves this tab's session; refreshing reconstructs the seed.

The first improvement would be exporting the existing sparse edit map to IndexedDB, so a build can outlive the tab. For larger view distances, profile meshing on integrated GPUs before adding workers or greedy face merging. Desktop Chromium was exercised here; other browsers and hardware have not been performance-certified.
