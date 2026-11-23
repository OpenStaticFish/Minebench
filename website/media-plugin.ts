/**
 * Vite plugin: expands media tokens in the landing page's HTML at build/dev
 * time (see website/media.ts) so screenshots ship as static markup and missing
 * ones become labelled placeholders — no client-side JavaScript involved.
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import type { Plugin } from "vite"
import { expandMediaTokens, loadMediaManifest, MANIFEST_PATH, SCREENSHOT_DIR } from "./media.ts"

export function mediaPlugin(): Plugin {
  let root = process.cwd()
  /** Public deployment URL; when set, link-preview image tags become absolute. */
  let siteUrl = process.env.SITE_URL ?? ""
  let warnedStale = false

  /** Nudge when screenshots changed after the last `bun run images`. */
  const warnIfStale = (log: { warn(message: string): void }) => {
    if (warnedStale) return
    const manifest = loadMediaManifest(join(root, MANIFEST_PATH))
    const generated = Date.parse(manifest.generated)
    if (Number.isNaN(generated)) return
    const dir = join(root, SCREENSHOT_DIR)
    let newer: string[] = []
    try {
      newer = readdirSync(dir)
        .filter((f) => f.endsWith(".png") && !f.startsWith("site-"))
        .filter((f) => statSync(join(dir, f)).mtimeMs > generated + 1000)
    } catch {
      return
    }
    if (newer.length > 0) {
      warnedStale = true
      log.warn(
        `[media] ${newer.join(", ")} changed since the last \`bun run images\`; ` +
          "the site is serving older copies in public/media/.",
      )
    }
  }

  return {
    name: "loamlands:media",
    enforce: "pre",
    configResolved(config) {
      root = config.root
      siteUrl = process.env.SITE_URL ?? config.env.SITE_URL ?? ""
    },
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // Only the landing page carries media tokens (the game lives at /play/).
        if (ctx.path !== "/index.html") return html
        warnIfStale(this)
        return expandMediaTokens(html, loadMediaManifest(join(root, MANIFEST_PATH)), { siteUrl })
      },
    },
  }
}
