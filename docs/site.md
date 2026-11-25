# Bracken Vale field guide

The homepage at `/` is a print-inspired field guide to a specific playable place. Its cover pairs the game's lettering with a photograph-like plate taken from the spawn overlook. The two full captures, illustrated feature notes, controls, current build status, and launch link are ordinary page content. Every **Play** link opens `/play/` in the same tab.

## Run and deploy

Install Bun and a current Node runtime (22.12+ recommended). Bun manages packages, the lockfile, scripts, TypeScript checks, and tests. The Vite dev/build commands use its normal Node runtime for Sharp's native image encoder.

```sh
bun install
bun run dev        # Open the printed localhost URL; / is the site.
bun run check      # Strict type-checking and 17 Bun tests.
bun run build      # Produce both pages and their assets in dist/.
bun run preview    # Serve that static build locally.
```

Deploy the **contents of `dist/` at the domain root** on any static host supporting directory indexes. Keep `play/index.html` and `assets/` alongside the homepage. No server rendering, database, remote fonts, or client-side routing is required. A subdirectory deployment would need path adjustments.

## Tooling decision and implementation

**Semantic HTML, CSS, and a small TypeScript enhancement, built with the existing Vite installation.** One information page doesn't need React hydration, Next.js routing, or a second application workspace. Astro could also produce static HTML, but its component/content layer offers little for this single page. Unprocessed HTML alone would leave responsive image production, cache naming, and integration with the game build as manual steps.

1. Give the homepage and game independent HTML entries. Linking to play is enough; the marketing page never initializes Three.js.
2. Turn the two source PNGs into responsive images at build time. Put the real view first, then use explicitly diagrammatic artwork to explain terrain, flight, and edits.
3. Keep navigation, copy, controls, status, and launch links in HTML. Enhance the mobile section menu and full-frame gallery with TypeScript.
4. Check the actual static output in a browser, including keyboard and no-JavaScript paths.

| File | Responsibility |
| --- | --- |
| `index.html` | Homepage content, landmarks, navigation, figures, controls, status, CTA, and footer |
| `site/site.css` | Paper/forest palette, typography, responsive layouts, focus and motion treatment |
| `site/enhance.ts` | Collapsible mobile nav and native dialog gallery; no game imports |
| `vite.config.ts`, `play/index.html` | Independent site and game entries |
| `scripts/capture-images.ts` | HTML image markers, Sharp encoding, dev serving, hashed build assets, missing-file fallbacks |
| `screenshots/in-game.png`, `screenshots/main-menu.png` | Unmodified source game captures |
| `public/field/cube.svg`, `symbols.svg`, `contours.svg` | Site mark, local icon sprite, contour-line motif |
| `public/field/{terrain,flight,build}.svg`, `scripts/illustrate.ts` | Original isometric explanatory diagrams and their reproducible drawing source |
| `scripts/capture.ts` | Capture the real game at its `/play/` route |
| `scripts/review-site.ts`, `tests/capture-images.test.ts` | Browser checks, review PNGs, missing-file regression test |
| `package.json`, `bun.lock`, `README.md`, `docs/site.md` | Commands, dependencies, setup, design, and verification |

## Replacing screenshots

Keep the two PNG filenames above in **`screenshots/`**, not `public/`. `bun run screenshots` regenerates them by running the game. Refresh the development page after replacing the files, or rebuild for production.

The cover trims the upper and lower HUD rows from the in-game PNG; its responsive frame may crop the sides. The gallery keeps both complete compositions, including the game's own menus and HUD. Full-size links work without JavaScript. When a source file is absent, its slot becomes a text panel naming the expected file. No substitute illustration is presented as a screenshot.

The grassy cross-sections beneath the cover are explanatory diagrams. To redraw those SVGs after changing their source: `bun run scripts/illustrate.ts`.

## Accessibility and performance

- Skip link, header navigation, named sections, one main heading, description lists, native links/buttons, and visible keyboard focus. Informative screenshots have descriptive alt text. Decorative illustrations have empty alt text because the adjacent text supplies the meaning.
- **Enter** opens a focused gallery link; **Left/Right** switch frames; **Escape** closes the modal and returns focus to the opener. Without JavaScript, links go directly to the complete images and section navigation stays visible on mobile.
- Measured solid-color contrast: primary ink on paper **11.86:1**, muted text on paper **6.02:1**, and dark CTA text on amber **6.85:1**. No essential information depends on color or hover. There is no autoplay; optional color transitions respect reduced motion.
- Sharp and Playwright are build/review tools, never visitor downloads. The screenshot pipeline emits 640-, 1024-, and 1600-pixel WebPs for the supplied images. The 640-pixel cover is about **29 kB**; even the full-width cover is about **133 kB**, versus roughly 1.5 MB for its source PNG.
- The hero is high priority; the lower gallery is lazy-loaded. Dimensions and aspect ratios reserve space. The homepage enhancement is about **1 kB gzip**, plus Vite's small preload helper. The separate game bundle loads only when navigating to play.

## Visual review

After `bun run build`, run:

```sh
bun run site:review
```

The command serves the build on a local port, drives Chromium, and closes both processes when finished. It writes `out/site-review/desktop.png`, `mobile.png`, and `full-page.png`. It uses the same local Chrome discovery as the game capture script: `CHROME_PATH` can name an executable; `bunx playwright-core install --only-shell chromium` installs a compatible alternative. Set `SITE_URL` to exercise an already-running server.

### Verification checklist

- [x] Local Bun setup, dev server, production build, and production preview.
- [x] Static tooling choice and trade-offs documented; game runtime excluded from homepage requests.
- [x] Hero and game pitch, screenshot showcase, illustrated features, controls, technical highlights, development status, launch CTA, and footer.
- [x] Both real game screenshots appear in the site. An isolated production build with neither PNG present rendered all three labelled fallback slots and passed the browser review. Source captions and diagrams are distinct.
- [x] Responsive layout checked at 320, 390, 900, and 1440 pixels wide. Desktop and mobile review images are reproducible.
- [x] Semantic content, meaningful image alternatives, deliberate contrast, keyboard-operable links, mobile navigation, and modal focus return.
- [x] Guide and gallery remain usable without JavaScript. The launch CTA reaches the existing game's **Enter world** menu.

## Limitations and next steps

The catalogue format makes the controls and prototype limits easy to find, but two stills of the spawn area cannot fully demonstrate editing or flying. The next useful content would be an actual before/after capture of a player-built bridge and a shot from inside the cave. Browser checks here use Chromium; they are not a screen-reader audit or a cross-browser performance score. The site is mobile-friendly, while the game itself remains a desktop keyboard-and-mouse prototype.
