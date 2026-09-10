# Cubewild — marketing site

The public-facing website for the Cubewild voxel sandbox prototype (the game
itself lives in the repository root). It is a single static page built with
Vite and semantic HTML, using the real in-game screenshots captured by the game
benchmark.

## Quick start

From the repository root (Bun workspace — `bun install` covers both projects):

```bash
bun install
bun run dev:all         # game :5173 + website :5174 in one command
bun run site:dev        # website dev server only
bun run site:build      # static output in site/dist/
bun run site:preview    # serve the built site on http://localhost:4174
bun run site:typecheck
bun run site:check      # typecheck + production build
bun run site:shots      # rebuild + capture review screenshots
```

Or work inside `site/` directly with `bun run dev`, `bun run build`,
`bun run preview`, `bun run shots`.

The easiest local setup is `bun run dev:all`: it hosts both Vite dev servers in
one process, and every Play button points at the game dev server
(`http://localhost:5173`) and opens it in a new tab. Ctrl+C stops both.

## Tooling choice

**Bun workspace + Vite + strict TypeScript + semantic HTML/CSS with ~2 kB of
progressive-enhancement JavaScript. No UI framework.**

- **Vite** gives a fast dev server, production build and preview without
  imposing a runtime framework. The repo already builds its game with Vite, so
  this is one tool to maintain, and the site remains a plain static bundle that
  can be dropped on any host.
- **No React/Svelte/Astro.** The site is one page. A framework would add tens of
  kB of runtime, hydration and a build layer for zero user-visible benefit. The
  only interactive parts — a mobile menu, a screenshot lightbox, a sticky header
  state and dev-mode play links — are ~90 lines of DOM code.
- **HTML partials + a 60-line Vite plugin.** Sections are authored as small
  files (`site/sections/*.html`) and inlined at build time, so the page stays
  maintainable without pulling in a template engine. The same plugin injects
  responsive `<img>` markup from the prepared screenshot manifest.
- **Image pipeline in headless Chromium.** The real 1.3 MB PNG captures are
  converted to responsive WebP variants (640–1920 px) plus a 24 px inline LQIP
  placeholder at build time. Chromium is already a dev dependency for visual
  checks, so no native image tooling is required and the pipeline works on any
  machine that can run Playwright.
- **Why not heavier:** Next.js/Astro bring routing, SSR and hydration the site
  does not use; a static host + this build is simpler and faster.
- **Why not lighter (hand-written HTML with no build):** no asset hashing, no
  image pipeline, no partials, no dev server, and the screenshots would need to
  be converted by hand. Vite is the minimum that keeps the workflow maintainable.

## What is on the page

| Section | Content |
| --- | --- |
| Hero | Game title, pitch, primary “Play the prototype” CTA, facts, hotbar motif, live in-game screenshot backdrop |
| About | What the game is, how generation works, prototype framing, world facts card |
| Screenshots | Both real captures in framed figures with captions and a lightbox |
| Features | 10 concrete features, each with a pixel-art icon and honest detail |
| Controls | Full keyboard/mouse reference in the same groups as the game UI |
| Technical highlights | Face-culled meshing, deterministic worldgen, streaming budget, water pass, verification, a real code snippet and measured stats |
| Development status | Working today / Next up / Not planned, plus known rough edges |
| CTA | Play button, controls link, and locally-runnable commands |
| Footer | Navigation, project meta, original-work disclaimer |

## Screenshot handling

- Sources: `screenshots/main-menu.png` and `screenshots/in-game.png` in the
  repository root (produced by `bun run shots` in the game project).
- `site/scripts/prepare-assets.ts` runs automatically before dev/build. It
  resizes them into `site/public/screenshots/*.webp`, generates the inline LQIP
  previews and writes `site/.generated/screenshots.json`.
- `site/vite.config.ts` replaces `<!--@screenshot:key ...-->` markers with
  `<img srcset>` markup (or hero background markup with `bg`).
- **If a screenshot is missing**, the manifest records it and the build renders
  a dashed, clearly labelled placeholder that explains how to produce the real
  capture — the site never shows a fake image and still builds cleanly.

The bundle also documents the deploy story: `bun run site:build:full` builds the
game and copies it to `site/dist/play/`, so the whole experience is one static
folder with the website at `/` and the playable prototype at `/play/`.

## Accessibility notes

- Semantic landmarks (`header`, `nav`, `main`, `section`, `footer`), one `h1`,
  ordered headings, and an ARIA-labelled primary/footer navigation.
- A skip link to `#main`; all interactive elements are real links/buttons with
  visible `:focus-visible` rings.
- The mobile menu is a `<button>` with `aria-expanded` and `aria-controls`;
  Escape closes it and returns focus.
- The screenshot lightbox uses native `<dialog>` + `showModal()` (focus
  containment for free), is labelled by its title, closes on Escape/backdrop,
  restores focus to the trigger, and degrades to plain image links without JS.
- Every screenshot has descriptive `alt` text; decorative SVGs are
  `aria-hidden`; the hero backdrop image is intentionally empty-alt.
- Decorative icons are hidden from assistive tech; copy carries the meaning.
- `prefers-reduced-motion` disables smooth scrolling, the scroll hint animation
  and hover transforms.
- Colour contrast: body/muted text on the ink palette is ≥ 4.5:1; amber buttons
  use dark ink text; focus rings use the high-contrast accent.
- Content is never hidden behind hover-only effects; the “view full size” hint
  is an enhancement on top of a normal link.

## Performance notes

- **~2.2 kB JS (0.9 kB gzip), ~26 kB CSS (5.6 kB gzip), 30 kB HTML (7.5 kB gzip).**
  No framework runtime, no client-side data fetching.
- Screenshots are responsive WebP: ~20–90 kB per viewport-sized variant instead
  of 1.3 MB PNGs; the hero image is the only eager load (`fetchpriority="high"`),
  everything below the fold is `loading="lazy"`.
- Every image declares `width`/`height` from the real capture dimensions, so
  there is no layout shift; fonts are locally bundled `woff2` with `font-display:
  swap` and a system fallback.
- All content and screenshots render with JavaScript disabled; the script only
  upgrades the menu, lightbox, header and (in dev) play links.

## Verification checklist

Executed in this environment (Linux, Bun 1.4, Node 24, headless Chromium):

| Check | Result |
| --- | --- |
| `bun install` (workspace) | ✅ installs game + site |
| `bun run dev:all` | ✅ starts game :5173 + site :5174, Play opens the game in a new tab, Ctrl+C stops both |
| `bun run site:dev` | ✅ Vite dev server on :5174 |
| `bun run site:build` | ✅ static output in `site/dist/` |
| `bun run site:preview` | ✅ serves the build on :4174 |
| `bun run site:typecheck` | ✅ strict `tsc --noEmit` clean |
| `bun run site:check` | ✅ typecheck + production build |
| `bun run site:shots` | ✅ desktop + full-page + mobile captures, zero console errors |
| `bun run site:build:full` | ✅ game copied to `site/dist/play/`; `/play/` boots the game and its menu Play button starts play with the mouse |
| Game smoke test | ✅ 16/16 checks including clicking Play with real mouse input |
| Missing-screenshot fallback | ✅ verified by temporarily removing `screenshots/`; labelled placeholders render and the build passes |
| Real screenshots used | ✅ via build-time manifest + `srcset` (not placeholders) |
| Hero, pitch, showcase, features, controls, tech, status, CTA, footer | ✅ all present |
| Responsive | ✅ 1440, 1024, 390 px verified |
| Semantic HTML / alt text / keyboard / contrast / reduced motion | ✅ per accessibility notes |
| Game project still passes | ✅ `bun run check` and `bun run smoke` unaffected by the workspace |

## Limitations and next steps

- No contact form, newsletter or analytics — not required, and would add
  tracking/privacy surface.
- The site is one page; if a blog/devlog arrives, a content collection (Astro or
  plain Markdown + the same Vite pipeline) would be the next step.
- Social preview uses one in-game capture (`og:image`); a bespoke 1200×630 OG
  card would be a nice polish.
- The Play button assumes the game is deployed at `/play/` (or
  `VITE_PLAY_URL`); subpath deployments need `base` adjusted in both configs.

## Self-critique

- The build-time HTML plugin is custom code; for a bigger site a maintained
  template engine would be the right call. At this size (~60 lines) it removes a
  dependency instead of adding one.
- The screenshot pipeline depends on Playwright for image encoding. That is a
  deliberate trade: it avoids native `sharp` binaries (which failed in this
  environment) and works anywhere Chromium runs, but the first build is slower
  than a native encoder and results are cached by source mtime.
- The hero leans on one strong screenshot; with only two real captures, that is
  the honest maximum. More captures (caves, desert, night) would strengthen the
  showcase without changing the code — just re-run `bun run shots` and rebuild.
