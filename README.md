# Verdant Isles · Website & playable prototype

A warm, editorial field guide to an original browser voxel sandbox. The companion website lives at **`/`**; the existing playable game lives at **`/play/`**. Real captures from the game are the visual foundation, not mockups or stock game art.

The page presents a quiet coast worth exploring, shows what you can build, explains controls and technical details, and clearly identifies the game as an **alpha creative-mode prototype**. Every play CTA opens the actual local game. There are no invented download, community, newsletter, or purchase flows.

## Setup, development, production

```bash
bun install
bun run dev
```

Open the URL Vite prints, normally `http://localhost:5173`:

- `/` — marketing/information website
- `/play/` — playable game

```bash
bun run check       # asset preparation, strict TypeScript, six focused Bun tests
bun run build       # asset preparation, typechecking, static production build
bun run preview     # production preview, normally http://localhost:4173
```

If a port is occupied, Vite selects another and prints its URL. Asset preparation runs automatically before dev, build, and check. All fonts and images are served locally; the website requires no API keys, backend, CDN, or external font service.

Deploy **the entire `dist/` folder** to a static host. Both `index.html` and `play/index.html` are emitted, so clean-directory URLs work on hosts that serve directory indexes. Do not configure a catch-all rewrite that replaces `/play/` with the website entry. Paths assume deployment at a domain root; subdirectory deployment needs coordinated base-path changes.

## Tooling choice and trade-offs

**Semantic HTML + CSS + a small strict TypeScript enhancement layer, built with the existing Vite toolchain and Bun.**

- This is a content-led, single-page website. Plain HTML keeps all marketing content in the initial response, gives predictable semantics, and has no hydration/runtime framework cost.
- TypeScript handles only mobile navigation and a native screenshot dialog. Production website-specific JS is **1.69 kB minified / 0.81 kB gzipped**, plus Vite's approximately 0.40 kB gzipped module-preload helper. The page does **not** import or preload the Three.js renderer; browser tests verify this separation.
- Vite already solves local development, CSS/font processing, and production bundling in this repository. Its multi-page build keeps the website and game independent without introducing another toolchain.
- React, Next.js, or Svelte would add a component/runtime abstraction with little value for this page. Astro would be a reasonable choice for a larger editorial site, but here a second framework/build setup would add more than it removes.
- Bare HTML without a build tool would be lighter in dependencies, but would leave local font packaging, static asset preparation, TypeScript, and the existing game integration to custom tooling.
- HTML sections are intentionally kept in one readable document for a single page. Styling, interactive behavior, fallback transformation, and checks live in focused files. If this grows into multiple content pages, reusable templates or Astro would become worthwhile.

## Design and implementation plan

1. Preserve the playable prototype at a separate `/play/` entry.
2. Build a game-specific editorial layout: forest green, warm paper, cedar/rust accents, locally bundled Fraunces headings and DM Sans body text, original line-drawn voxel icons.
3. Lead with the actual in-game shoreline capture, then exploration/building/flight features, a main-menu postcard, controls, developer notes, honest status, and a final play CTA.
4. Add small, accessible enhancements: collapsible mobile navigation and an enlargable screenshot dialog.
5. Verify real assets, image fallbacks, desktop/mobile layout, keyboard behavior, accessibility scans, and the game route; capture site previews.

## Created and modified files

| File | Purpose |
| --- | --- |
| `index.html` | Website content, semantic sections, metadata, navigation and play links |
| `play/index.html` | Game host, moved from the previous root entry |
| `site/style.css` | Website typography, palette, original visual details, responsive layout and reduced-motion styles |
| `site/main.ts` | Mobile nav state, screenshot dialog, runtime missing-capture messaging |
| `site/capture-html.ts` | Build/dev HTML fallback transformation, including alt text and honest captions |
| `site/capture-html.test.ts` | Real/missing/partially available screenshot HTML tests |
| `public/favicon.svg` | Original voxel-outline favicon |
| `scripts/prepare-site.ts` | Copies real screenshots and creates clearly labeled fallbacks when needed |
| `scripts/site-smoke.ts` | Browser checks, axe scans, desktop/mobile/hero site screenshots |
| `scripts/screenshots.ts`, `scripts/smoke.ts` | Existing game workflows updated to `/play/` |
| `vite.config.ts` | Independent website/game HTML entries and capture fallback transform |
| `package.json`, `bun.lock` | Bun scripts, locally packaged Fraunces and development-only axe tooling |
| `tsconfig.json` | Typed JSON manifest support |
| `.gitignore` | Generated `public/images/` assets excluded; regenerated automatically |
| `README.md` | Website setup, decisions, verification and limitations |
| `GAME.md` | Preserved game documentation, with updated routes |
| `screenshots/website-desktop.png`, `website-mobile.png`, `website-hero.png` | Actual browser captures of the website |

## Real screenshots and fallbacks

Source-of-truth files:

```text
screenshots/in-game.png
screenshots/main-menu.png
```

`bun run prepare:site` copies them to `public/images/` and writes a small availability manifest. The in-game screenshot is the high-priority hero visual; the menu screenshot is a lazy-loaded postcard farther down the page. Both can be enlarged, preserving their original composition and HUD/menu details.

The hero source is about **165 kB**, and the menu source about **790 kB**. Originals are retained losslessly; responsive resizing is done by layout, not by generating smaller image variants. The hero figure has a reserved aspect ratio, and images have explicit width/height to reduce layout shifts. This prototype favors a portable Bun-only asset preparation step over a native image-processing dependency. WebP/AVIF variants are a sensible next performance improvement, especially for the larger menu PNG.

If either source is absent, preparation generates an **explicitly labeled SVG missing-screenshot panel**. Vite changes the HTML image path, alt text, caption, and affected showcase copy. This is also correct in the static production HTML when JavaScript is disabled. The site still builds and presents the missing asset honestly. A stale PNG in the generated directory is not referenced when its source is absent.

After replacing screenshots, restart dev or rebuild. To regenerate real game captures:

```bash
bunx playwright install chromium
# Keep a dev or preview server running:
GAME_URL=http://127.0.0.1:4173 bun run screenshots
bun run prepare:site
```

See [GAME.md](GAME.md) for exact manual capture steps and gameplay documentation.

## Browser verification and site screenshots

```bash
# Once for browser checks:
bunx playwright install chromium

# With a dev or preview server running:
SITE_URL=http://127.0.0.1:4173 bun run check:site
GAME_URL=http://127.0.0.1:4173 bun run check:browser
```

`check:site` verifies sections, loaded real images, alt attributes, no game renderer on the website, screenshot dialog/focus restoration/Escape, mobile nav state, a visible skip link, no horizontal overflow at **320, 390, 768, and 1440 px**, no page exceptions, the local game link, and desktop/mobile axe scans tagged WCAG A/AA. It saves:

- `screenshots/website-desktop.png` — full page at 1440 px wide
- `screenshots/website-mobile.png` — full page at 390 px wide
- `screenshots/website-hero.png` — desktop viewport composition

The existing gameplay smoke check also passes after the route move. Tests use the actual production preview in this environment. Automated accessibility checks are useful coverage, not a claim of exhaustive accessibility certification.

## Accessibility and performance

- Header/main/footer landmarks, named navigation, linked section headings, logical heading hierarchy, and definition lists for controls.
- Useful image alt text and decorative icons hidden from assistive technology.
- Actual links for navigation/play; labeled buttons for menu and image dialogs. Visible keyboard focus, mobile nav `aria-expanded`, and Escape handling.
- Native `<dialog>` supplies modal focus containment and restores focus to the opener; browser tests check close focus and Escape behavior.
- Forest-on-paper contrast, darker muted text, and light-on-forest technical copy. A low-contrast stamp caught by axe was darkened; final desktop/mobile scans report no violations in the tested tags.
- Important information is always visible, not hover- or animation-dependent. Reduced-motion preference disables smooth scrolling and hover movement.
- Layout works from narrow mobile through large desktop widths. The game is clearly labeled desktop-only; the website is fully responsive.
- Fonts are bundled locally with `font-display: swap`. Hero loads eagerly with high fetch priority; menu loads lazily. No background video, autoplay WebGL, scroll animation library, trackers, external embed, or client UI framework.
- Static content and play links remain usable without JS in the production build. The mobile nav toggle and screenshot enlargement are JS enhancements; footer section links and the main play CTA remain available.

## Verified checklist

- [x] Local `bun install` and dev server work.
- [x] Production build and preview work.
- [x] Strict TypeScript and six Bun tests pass.
- [x] Website and preserved game browser checks pass against the production build.
- [x] Tooling choice is justified; no unnecessary client framework.
- [x] Hero and clear game pitch.
- [x] Prominent showcase with both real game screenshots.
- [x] Features, accurate controls, and technical highlights.
- [x] Honest development/prototype status.
- [x] Working play CTA and complete footer.
- [x] Responsive layout with tested 320–1440 px overflow behavior.
- [x] Semantic HTML, accessible links/buttons, image alt text, and visible keyboard focus.
- [x] Color contrast considered and automated desktop/mobile accessibility scans pass.
- [x] Real screenshots used when present; missing screenshots handled honestly and tested.
- [x] No fake feature claims, fake screenshots, placeholder-only sections, or nonfunctional marketing CTA.

Manual review: tab through the header and CTA, open/close both screenshot dialogs, check mobile menu and footer links, try browser zoom, follow a play link, and compare site copy to the game controls. Screen-reader testing across platforms and a measured field performance audit are still valuable follow-ups.

## Limitations and self-critique

This is a single-page prototype website. There is no live changelog, CMS, mailing list, or community destination because those services do not exist for this project. The future-work copy is candid rather than a release commitment. The playable game retains its documented limitations: session-only edits, decorative water, and desktop input.

The strongest qualities are the real-game imagery, consistent editorial identity, accurate feature/status copy, and clean split between static site and WebGL game. The weakest point is image delivery: the larger menu PNG has no responsive WebP/AVIF variants yet. Some decorative captions are compact, while explanatory body and control text are larger. The long single-page layout would benefit from richer captures of builds or caves once those are photographed; the page currently reuses the two real benchmark captures rather than inventing scenes.

Next improvements: generated modern-format image variants → more genuine in-game build/cave captures → cross-platform screen-reader and zoom review → deployment-specific social card/canonical metadata → reusable content templates if the site expands. No hosting deployment or field Core Web Vitals measurement is claimed.
