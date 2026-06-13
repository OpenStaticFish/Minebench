I want you to act as a senior frontend/game engineer, technical designer, and product-minded prototype developer.

Your task is to build a browser-based WebGL Minecraft-like voxel sandbox game prototype and make it easy to capture real screenshots of the game for a later marketing website benchmark.

This is being used as a model capability benchmark. I will run the result locally and compare different models based on tooling decisions, implementation quality, design quality, maintainability, accessibility where relevant, performance, gameplay completeness, screenshot readiness, and whether the chosen technical approach is appropriate for a browser game prototype.

Do not stop to ask clarification questions. This is a benchmark prompt. If anything is ambiguous, make the best product/design/engineering decision you can, explain the assumption briefly, and continue implementing. Do not block progress waiting for user input.

Important scope boundary:

* This prompt is for building the playable game prototype, not a marketing website.
* Do not build a landing page, marketing site, pricing page, documentation site, or website-style product page.
* Do create a minimal local app shell only as needed to host and run the game.
* Do make the game easy to screenshot for the later website prompt.
* The later website benchmark will use screenshots produced by this project, especially `screenshots/main-menu.png` and `screenshots/in-game.png`.

Game concept:

* Build a browser-based WebGL voxel sandbox prototype inspired by block-based survival/creative games.
* Do not use copyrighted Minecraft assets.
* Do not pretend this is an official Minecraft product.
* Do not copy Minecraft branding, logos, art, text, sounds, textures, or UI.
* The game should feel like an original indie voxel prototype with its own simple visual identity.
* Aim for a compact but convincing creative-mode slice: generated terrain, responsive movement, editable blocks, a usable menu/HUD, and screenshots that can sell the prototype visually.

Framework/tooling decision requirement:

* You must choose the framework/tooling yourself.
* Do not ask me what framework to use.
* Pick what you think is the most appropriate option for this type of browser game prototype.
* Use Bun as the package manager and script runner.
* Provide Bun-based commands for install, development, production build, preview, and checks.
* Do not use npm, pnpm, or yarn commands unless you have a specific reason and explain it clearly.
* Explain why you chose it.
* Also explain why you did not choose heavier or lighter alternatives.
* The choice itself will be scored.
* Avoid overengineering.
* Avoid underengineering.
* Prefer the simplest stack that still produces a playable, maintainable, performant WebGL prototype.
* If you choose Three.js, Babylon.js, raw WebGL, React, Svelte, Vite, plain TypeScript, or anything else, justify the choice based on this project’s needs.
* The project should be easy to run locally with Bun.

Core game requirements:

* Build a playable browser-based voxel sandbox prototype.
* The prototype must include at least:

  * Main menu screen
  * In-game HUD
  * Procedural voxel terrain
  * Chunk-based world loading or clear chunk-like world organization
  * Gravity-based movement
  * Creative flight
  * Mouse-look camera controls
  * Block breaking
  * Block placement
  * Basic block selection or hotbar
  * Pause/menu screen
  * Settings for at least view distance and pointer/mouse sensitivity
  * Procedural clouds or sky treatment
  * Screenshot capture support
* The game should run locally in a modern desktop browser.
* The experience should be interactive, not just a static 3D scene.
* The game should feel like a real playable prototype, not a placeholder cube demo.
* Prioritize a stable, playable core over a large feature list that only works superficially.

Gameplay expectations:

* Start at a main menu with a clear title, start/play action, controls/help access, and settings access.
* Entering the game should place the player in a generated world with a useful initial camera position.
* Use pointer lock or an equivalent mouse-look interaction for gameplay.
* Show a crosshair while in-game.
* Raycast from the camera for block breaking and placement.
* Prevent placing blocks inside the player collision volume if collision is implemented.
* Include simple player collision against terrain if practical; if not, be honest and keep movement usable.
* Include gravity and jumping when not flying.
* Include a clear flying state indicator or HUD text.
* Include a pause state that releases pointer lock and lets the player resume or return to the menu.

World/content requirements:

* Generate terrain procedurally.
* Use deterministic generation from a seed or document how the random generation works.
* Organize terrain into chunks, for example 16x16 horizontal columns, and generate/render chunks based on view distance.
* Store block data in a structure that supports editing individual blocks.
* Rebuild or update affected chunk meshes after block breaking/placement.
* Only render visible block faces or otherwise explain the chosen optimization.
* Include biome-like terrain variation or at least visibly varied terrain regions.
* Include several terrain features such as:

  * Trees
  * Beaches or shorelines
  * Hills
  * Mountains
  * Water
  * Caves, cave openings, or carved terrain pockets
* Include multiple block types, for example:

  * Grass
  * Dirt
  * Stone
  * Sand
  * Wood
  * Leaves
  * Water or a water-like block/surface
* Use simple original materials, colors, or generated textures.
* Make terrain readable from screenshots: grass tops, dirt/stone layers, sand near water, tree trunks/leaves, and distinct water treatment should be visually distinguishable.
* Do not import copyrighted voxel game assets.

Controls requirements:

* Include clear in-game controls and/or a controls panel.
* Implement controls comparable to:

  * WASD movement
  * Mouse look
  * Space jump / fly up
  * Double-tap Space toggle flying, or another clearly documented flight toggle
  * Shift or Ctrl fly down when flying
  * Mouse buttons for block breaking and placing
  * Number keys or scroll wheel for block selection if a hotbar is present
  * Escape pause / release pointer lock
* Controls should be usable without needing to inspect the source code.
* Settings changes should affect gameplay immediately where practical, especially view distance and mouse sensitivity.

Screenshot requirements:

* Make it easy to capture at least two real screenshots from the running game:

  * `screenshots/main-menu.png`
  * `screenshots/in-game.png`
* Include a clear screenshot workflow in the README or final instructions.
* Add an in-game screenshot button or keyboard shortcut that captures the canvas or viewport if practical.
* Prefer a keyboard shortcut such as `P` or a visible menu button for screenshot capture.
* If browser security prevents directly saving files into `screenshots/`, download the PNG and document the exact filenames to save.
* If practical, include a simple Playwright/Puppeteer/Bun script or documented browser workflow for capturing the two screenshots.
* The main menu screenshot should show the game title/menu state, not a website landing page.
* The in-game screenshot should show actual generated terrain, HUD, and playable world state.
* The in-game screenshot should be composed from a good default spawn or camera angle, showing sky, terrain depth, trees, water, and at least part of the HUD.
* Do not fake screenshots.
* Do not create placeholder image files and claim they are game screenshots.
* If automated screenshot capture is not implemented, state that honestly and provide exact manual steps to capture the screenshots.
* The game should visually compose well enough that the screenshots are useful for a later website benchmark.

Visual/design requirements:

* Create a strong visual identity suitable for an indie voxel sandbox prototype.
* Use a cohesive color palette.
* Use readable typography for UI overlays.
* Use spacing, layout, and hierarchy well in menus and HUD.
* Include game-like visual details where appropriate, such as blocky panels, pixel/voxel-inspired accents, terrain layers, sky/cloud motifs, or grid details.
* Use an original game name in the UI; do not use `Minecraft`, `Mineclone`, or official Minecraft-style branding.
* The game should look good in screenshots.
* The game should remain usable on common desktop viewport sizes.
* Mobile support is optional unless your chosen technical approach makes it practical, but the app should not completely break on smaller windows.

Performance requirements:

* The game should be reasonably fast and lightweight for a prototype.
* Avoid unnecessary dependencies.
* Use sensible geometry organization for voxels.
* Avoid rendering thousands of separate cube meshes when a chunk mesh or merged geometry approach is practical.
* Chunk meshes should be disposable/rebuildable without leaking geometries, buffers, materials, event listeners, or animation loops.
* Avoid obvious memory leaks in game loops, event listeners, and generated geometry.
* Keep draw calls and generated world size appropriate for a browser benchmark.
* Include a view distance setting that affects world/chunk rendering or generation.
* Keep terrain size, chunk count, and cloud effects reasonable so the prototype remains responsive on typical laptops.

Implementation requirements:

* Use TypeScript if the chosen stack benefits from it.
* Keep the code organized and maintainable.
* Avoid overuse of `any`.
* Avoid a large messy single file unless the chosen approach genuinely makes that appropriate.
* Include or update `package.json` scripts for development, building, previewing, and any checks you add.
* Use Bun lockfile/dependency workflows and document Bun as the expected runtime.
* Include setup and run instructions.
* Include a production build command.
* Include a preview command if supported by the chosen tooling.
* The project should run locally with clear commands.

Recommended commands:

Use Bun commands for:

```bash
bun install
bun run dev
bun run build
bun run preview
```

If you add checks, expose them through Bun scripts such as `bun run check`, `bun run lint`, or `bun run typecheck`.

Quality/testing requirements:

* Include at least a basic verification checklist.
* Include any lint/typecheck/build commands that are relevant to your chosen stack.
* If you include automated checks, keep them appropriate for the project.
* Do not add a heavy test setup just to look impressive.
* If practical, include a simple screenshot capture or visual review command for the game.
* If you cannot run commands in your environment, state that clearly and explain exactly what I should run locally.
* Do not claim commands pass unless they have actually been run successfully in the current environment.

Decision-making requirements:

* Explain your tooling choice.
* Explain trade-offs.
* Explain why the stack is not overkill for this prototype.
* Explain why the stack is not too limited for this prototype.
* If you choose a very simple stack, explain how it remains maintainable.
* If you choose a rendering/game framework, explain what value it adds.
* Prioritize good judgement over novelty.

No fake compliance requirements:

* Do not fake gameplay features in comments.
* Do not claim screenshot capture works unless the implementation actually supports it or the manual workflow is documented.
* Do not claim accessibility/performance work was done unless it is reflected in the code or relevant documentation.
* Do not leave critical sections as TODOs.
* Do not silently omit required gameplay systems.
* Do not provide only pseudocode.
* Do not mark a feature as implemented unless the code path exists and can be tested.
* If a requirement is missing or only partially implemented, mark it as missing or partial honestly.
* Do not hide missing features behind comments, empty components, placeholder classes, or optimistic claims.
* Prefer a complete, polished, appropriately scoped prototype over a huge overengineered one.

Deliverables:

1. Brief game/product interpretation.
2. Tooling/framework choice and justification.
3. Trade-off explanation, including why the choice is not overkill.
4. Implementation plan.
5. Full implementation, showing every file that should be created or modified.
6. Bun setup and run instructions.
7. Bun build/preview/check instructions.
8. Controls documentation.
9. Screenshot capture instructions for `screenshots/main-menu.png` and `screenshots/in-game.png`.
10. Performance notes.
11. Verification checklist.
12. Limitations and suggested next improvements.
13. Honest self-critique.

The final checklist must include at least:

* `bun install` works
* `bun run dev` works
* `bun run build` works
* `bun run preview` works, if supported
* Any added Bun check/lint/typecheck script works
* Framework/tooling choice is justified
* Bun is used as the package manager and script runner
* Game has a main menu
* Game has an in-game HUD
* Game has procedural voxel terrain
* Game has chunk-based loading or chunk-like organization
* Block data supports edits
* Chunk meshes or visible faces are handled efficiently
* Game has gravity-based movement
* Game has creative flight
* Game has mouse-look controls
* Game has block breaking
* Game has block placement
* Game has basic block selection or hotbar
* Game has pause/menu/settings UI
* Game has view distance control
* Game has mouse sensitivity control
* Game has clouds or sky treatment
* Terrain includes visible variation
* Terrain includes trees, hills/mountains, water, and cave-like features where practical
* Controls are documented in the UI or README
* Screenshot workflow is documented
* `screenshots/main-menu.png` can be captured from the actual game
* `screenshots/in-game.png` can be captured from the actual game
* No fake screenshots or placeholder screenshots are claimed as real
* No fake compliance or placeholder-only gameplay systems

Scoring guidance:

Higher-quality answers should score better for:

* Sensible framework/tooling choice
* Correct Bun usage
* Clear justification of technical decisions
* Good judgement around simplicity vs maintainability
* Playable game feel
* Procedural terrain quality
* Chunk/world organization
* Efficient visible-face or chunk mesh rendering
* Working block editing with chunk updates
* Responsive controls
* Useful menus/settings/HUD
* Screenshot readiness
* Good visual identity
* Good performance for a browser prototype
* Clean implementation
* Clear setup/build instructions
* Honest self-critique

Lower-quality answers should score worse for:

* Building a marketing website instead of the game
* Ignoring the Bun requirement without a strong reason
* Overengineered stack without justification
* Underpowered stack that makes the result hard to maintain
* Static non-playable demos
* Generic cube scenes with no meaningful terrain/gameplay
* Missing required gameplay systems
* Poor controls
* Poor performance from excessive individual meshes
* Block breaking/placement that only changes visuals temporarily or cannot persist in world data
* Fake screenshot usage
* Placeholder systems marked as complete
* Claims that do not match the implementation
* Asking clarification questions instead of making a decision

Begin by briefly explaining your game/product interpretation, then choose the tooling, justify it, plan, and implement.
