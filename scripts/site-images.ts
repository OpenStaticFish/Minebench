import { access } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";

const descriptions = {
  "in-game":
    "Actual Wildmere gameplay: a turquoise lake, sandy shoreline, block-built trees and snowy mountains, with the creative-mode hotbar visible.",
  "main-menu":
    "The Wildmere main menu over its generated woodland lake, with the Enter the world button and Stillwater Basin destination label.",
};

export async function screenshotAssets(root: string): Promise<Plugin> {
  const assets = new Map<string, Buffer>();
  const available = new Set<string>();
  const source =
    process.env.WILDMERE_SCREENSHOTS_DIR ?? resolve(root, "screenshots");
  for (const name of ["in-game", "main-menu"] as const) {
    const path = resolve(source, `${name}.png`);
    try {
      await access(path);
    } catch {
      continue;
    }
    try {
      const versions = await Promise.all(
        [720, 1440].map(async (width) => {
          const image = await sharp(path)
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: 83 })
            .toBuffer();
          return [`${name}-${width}.webp`, image] as const;
        }),
      );
      versions.forEach(([name, buffer]) => assets.set(name, buffer));
      available.add(name);
    } catch (error) {
      console.warn(
        `Screenshot ${name}.png could not be processed; using the labelled fallback.`,
        error instanceof Error ? error.message : "Invalid image",
      );
    }
  }
  return {
    name: "wildmere-screenshot-assets",
    generateBundle() {
      for (const [name, source] of assets)
        this.emitFile({ type: "asset", fileName: `media/${name}`, source });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.split("?")[0]?.replace(/^\/media\//, "");
        const image = name ? assets.get(name) : undefined;
        if (!image) {
          next();
          return;
        }
        response.setHeader("Content-Type", "image/webp");
        response.setHeader("Cache-Control", "no-cache");
        response.end(image);
      });
    },
    // Post-transform: these optimized assets are emitted above, not source imports.
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (!available.has("in-game"))
          html = html.replace(
            "ACTUAL IN-GAME CAPTURE",
            "SCREENSHOT NOT YET AVAILABLE",
          );
        if (available.size < 2) {
          html = html.replace(
            /Two views from the running prototype\.\s+The same world/,
            "Some captures are not available yet. The playable world",
          );
          html = html.replace(
            /Captured in Wildmere, field build 0\.1\.\s+Select a photograph to see\s+the full frame\./,
            "Available photographs are real game captures. Missing screenshots are labelled above.",
          );
        }
        return html.replace(
          /<!-- screenshot:(in-game|main-menu):(hero|gallery) -->/g,
          (_, name: keyof typeof descriptions, placement: string) => {
            if (!available.has(name))
              return `<div class="missing-shot" role="img" aria-label="${name} screenshot not yet available"><span class="pixel-mark" aria-hidden="true">+</span><strong>A view is waiting here.</strong><span>Real game screenshot not available.</span><small>Add screenshots/${name}.png and restart the server or rebuild.</small></div>`;
            return `<a class="screenshot-link" href="./media/${name}-1440.webp" data-lightbox="${name}" aria-label="Enlarge ${name === "in-game" ? "in-game" : "main menu"} screenshot"><img src="./media/${name}-1440.webp" srcset="./media/${name}-720.webp 720w, ./media/${name}-1440.webp 1440w" sizes="${placement === "hero" ? "(max-width: 1280px) 94vw, 1280px" : "(max-width: 700px) 94vw, 620px"}" width="1440" height="900" alt="${descriptions[name]}" ${placement === "hero" ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'} decoding="async"><span class="enlarge-icon" aria-hidden="true">+</span></a>`;
          },
        );
      },
    },
  };
}
