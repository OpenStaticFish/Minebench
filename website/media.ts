/**
 * Website media: the manifest of optimised screenshots and icons, and the
 * markup that renders them (or an honest, labelled placeholder when missing).
 *
 * Pure functions only, so the Vite plugin (Node) and the unit tests (Bun) share
 * exactly the same code paths.
 */
import { existsSync, readFileSync } from "node:fs"

export interface MediaVariant {
  width: number
  /** File name inside `public/media/`. */
  file: string
}

export interface MediaShot {
  /** Intrinsic size of the source screenshot. */
  width: number
  height: number
  variants: MediaVariant[]
}

export interface MediaManifest {
  /** ISO timestamp of the last `bun run images` run. */
  generated: string
  shots: Record<string, MediaShot>
  /** Available block icon names (files are `icon-<name>.webp`). */
  icons: string[]
}

export const MANIFEST_PATH = "website/media.json"
export const SCREENSHOT_DIR = "screenshots"
/** Width of the `src` fallback; browsers without `srcset` support get this. */
const FALLBACK_WIDTH = 1280

export const emptyManifest = (): MediaManifest => ({ generated: "", shots: {}, icons: [] })

function sanitizeManifest(input: unknown): MediaManifest {
  if (!input || typeof input !== "object") return emptyManifest()
  const raw = input as Partial<MediaManifest>
  const shots: Record<string, MediaShot> = {}
  if (raw.shots && typeof raw.shots === "object") {
    for (const [name, shot] of Object.entries(raw.shots)) {
      if (!shot || typeof shot !== "object") continue
      const { width, height, variants } = shot as Partial<MediaShot>
      if (typeof width !== "number" || typeof height !== "number" || !Array.isArray(variants))
        continue
      const valid = variants.filter(
        (v): v is MediaVariant =>
          Boolean(v) &&
          typeof v.width === "number" &&
          typeof v.file === "string" &&
          /^[a-z0-9-]+\.webp$/.test(v.file),
      )
      if (valid.length > 0) shots[name] = { width, height, variants: valid }
    }
  }
  return {
    generated: typeof raw.generated === "string" ? raw.generated : "",
    shots,
    icons: Array.isArray(raw.icons)
      ? raw.icons.filter((i): i is string => typeof i === "string")
      : [],
  }
}

/** Read `website/media.json`; a missing or corrupt file yields an empty manifest (placeholders). */
export function loadMediaManifest(path: string = MANIFEST_PATH): MediaManifest {
  if (!existsSync(path)) return emptyManifest()
  try {
    return sanitizeManifest(JSON.parse(readFileSync(path, "utf8")))
  } catch {
    return emptyManifest()
  }
}

export const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  )

export interface ShotAttrs {
  name: string
  alt: string
  sizes: string
  /** Hero images: eager load with high fetch priority. */
  priority?: boolean
}

/** `<img>` markup with a responsive `srcset`, or a labelled placeholder when the shot is missing. */
export function renderShot(shot: MediaShot | undefined, attrs: ShotAttrs): string {
  const sorted = [...(shot?.variants ?? [])].sort((a, b) => a.width - b.width)
  if (!shot || sorted.length === 0) return renderPlaceholder(attrs)
  const src = sorted.find((v) => v.width >= FALLBACK_WIDTH) ?? sorted[sorted.length - 1]!
  const srcset = sorted.map((v) => `./media/${v.file} ${v.width}w`).join(", ")
  const loading = attrs.priority ? "eager" : "lazy"
  const priority = attrs.priority ? ' fetchpriority="high"' : ""
  return `<img class="shot__img" src="./media/${src.file}" srcset="${srcset}" sizes="${escapeHtml(attrs.sizes)}" width="${shot.width}" height="${shot.height}" alt="${escapeHtml(attrs.alt)}" loading="${loading}" decoding="async"${priority}>`
}

function renderPlaceholder(attrs: ShotAttrs): string {
  return (
    `<div class="shot__missing" role="img" aria-label="Placeholder: no screenshot yet. ${escapeHtml(attrs.alt)}">` +
    '<span class="shot__badge">Placeholder</span>' +
    '<p class="shot__title">No screenshot yet</p>' +
    `<p>Expected <code>${SCREENSHOT_DIR}/${escapeHtml(attrs.name)}.png</code>. Add one, then run <code>bun run images</code>.</p>` +
    "</div>"
  )
}

/**
 * Open Graph / Twitter image tags for link previews. Emitted only when the shot
 * exists *and* a public site URL is configured, because crawlers need absolute URLs.
 */
export function renderSocialImage(shot: MediaShot | undefined, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "")
  if (!shot || !/^https?:\/\//.test(base)) return ""
  const variant = shot.variants.find((v) => v.width >= 1200) ?? shot.variants.at(-1)
  if (!variant) return ""
  const url = `${base}/media/${variant.file}`
  const height = Math.round((shot.height * variant.width) / shot.width)
  return (
    `<meta property="og:image" content="${url}">` +
    `<meta property="og:image:width" content="${variant.width}">` +
    `<meta property="og:image:height" content="${height}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:image" content="${url}">`
  )
}

/** `<img>` for a generated block icon, or an empty string when that icon has not been generated. */
export function renderIcon(icons: readonly string[], name: string, className: string): string {
  if (!icons.includes(name) || !/^[a-z0-9-]+$/.test(name)) return ""
  const cls = className ? ` ${className}` : ""
  return `<img class="icon${cls}" src="./media/icon-${name}.webp" width="96" height="96" alt="" loading="lazy" decoding="async">`
}

const TOKEN = /<!--\s*(shot|icon|social-image)([^>]*?)-->/g
const ATTRIBUTE = /([a-z][\w-]*)="([^"]*)"/g

function parseAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const match of text.matchAll(ATTRIBUTE)) attrs[match[1]!] = match[2]!
  return attrs
}

/**
 * Replace media tokens in the page's HTML. Runs at build time and in the dev
 * server, so the shipped HTML is static.
 *   <!--shot name="…" alt="…" sizes="…" fetch="high"-->   screenshot or placeholder
 *   <!--icon name="…" class="…"-->                        block icon or nothing
 *   <!--social-image name="…"-->                          Open Graph tags (needs options.siteUrl)
 */
export function expandMediaTokens(
  html: string,
  manifest: MediaManifest,
  options: { siteUrl?: string } = {},
): string {
  if (
    !html.includes("<!--shot") &&
    !html.includes("<!--icon") &&
    !html.includes("<!--social-image")
  ) {
    return html
  }
  return html.replace(TOKEN, (token, kind: string, attrText: string) => {
    const attrs = parseAttrs(attrText)
    const name = attrs.name
    if (!name) throw new Error(`Media token is missing a name: ${token}`)
    if (kind === "social-image")
      return renderSocialImage(manifest.shots[name], options.siteUrl ?? "")
    if (kind === "shot") {
      if (!attrs.alt) throw new Error(`Shot "${name}" is missing alt text`)
      return renderShot(manifest.shots[name], {
        name,
        alt: attrs.alt,
        sizes: attrs.sizes ?? "100vw",
        priority: attrs.fetch === "high",
      })
    }
    return renderIcon(manifest.icons, name, attrs.class ?? "")
  })
}
