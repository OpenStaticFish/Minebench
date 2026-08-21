# Screenshot workflow — Vox Crest

## Required files
- `screenshots/main-menu.png` — shot of the main menu (not the HUD)
- `screenshots/in-game.png`  — shot of the generated world with HUD

Both must be real captures from the running game.

## Option A — In-game P key (recommended)
1. `bun install && bun run dev` → http://localhost:3000
2. **Main menu**: keep the menu open, press `P`. Browser downloads `main-menu.png`. Move it to `screenshots/main-menu.png`.
3. **In-game**: click `▶ PLAY`, click canvas to lock mouse, frame a view with sky + hills + trees + water + HUD, press `P` → `in-game.png` → move to `screenshots/in-game.png`.

Browser security prevents writing directly to `screenshots/`; the game triggers a download. Move the file manually.

## Option B — Browser DevTools
- DevTools → `Cmd/Ctrl+Shift+P` → `Capture screenshot` (or `Capture node screenshot` on `#game-root`) → save with the names above.

## Option C — Playwright (automated)
```bash
bun add -d playwright
bunx playwright install chromium
bun run build
bun run preview &   # serves http://localhost:4173
# in another terminal:
bun run capture
# → writes screenshots/main-menu.png and screenshots/in-game.png automatically
```

Screenshots should show:
- Menu: title VOX CREST, Play button, seed/view/sensitivity controls.
- In-game: terrain depth, grass tops / dirt / stone layers, sand near water, trees, water surface, clouds, crosshair + hotbar + coords + flight badge.
