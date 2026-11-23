/**
 * Builds the website's media from real sources:
 *  - `screenshots/*.png`   → `public/media/<name>-<width>.webp`  (responsive WebP)
 *  - the game's own tiles  → `public/media/icon-<block>.webp`      (isometric block icons)
 * and writes `website/media.json`, which the site reads at build time. A shot
 * listed nowhere in that manifest renders as a clearly labelled placeholder.
 *
 *   bun run images          rebuild everything from the current screenshots
 *
 * Encoding happens in headless Chrome (see scripts/lib/imaging.ts), so there is
 * no native image library to install.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { B, blockDef } from "../game/core/blocks"
import { buildAtlas } from "../game/core/textures"
import type { MediaManifest, MediaShot } from "../website/media"
import { renderBlockIcon } from "./lib/block-icon"
import { ImageEncoder, pngSize } from "./lib/imaging"

const ROOT = resolve(import.meta.dir, "..")
const MEDIA_DIR = join(ROOT, "public", "media")
/** Responsive widths; the source width is always included too (capped). */
const SHOT_WIDTHS = [640, 960, 1280]
const MAX_WIDTH = 1920
const ICON_SIZE = 96
const ICONS: ReadonlyArray<readonly [string, number]> = [
  ["grass", B.Grass],
  ["dirt", B.Dirt],
  ["stone", B.Stone],
  ["cobblestone", B.Cobblestone],
  ["sand", B.Sand],
  ["log", B.Log],
  ["leaves", B.Leaves],
  ["planks", B.Planks],
  ["glass", B.Glass],
  ["water", B.Water],
  ["snow", B.Snow],
  ["coal-ore", B.CoalOre],
  ["iron-ore", B.IronOre],
  ["lamp", B.Lamp],
]

const formatKb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`

export async function buildMedia(): Promise<MediaManifest> {
  rmSync(MEDIA_DIR, { recursive: true, force: true })
  mkdirSync(MEDIA_DIR, { recursive: true })
  const encoder = await ImageEncoder.create()
  const manifest: MediaManifest = { generated: new Date().toISOString(), shots: {}, icons: [] }

  try {
    const shotDir = join(ROOT, "screenshots")
    const files = readdirSync(shotDir).filter((f) => f.endsWith(".png") && !f.startsWith("site-"))
    for (const file of files.sort()) {
      const name = file.slice(0, -4)
      const source = new Uint8Array(readFileSync(join(shotDir, file)))
      const size = pngSize(source)
      const widths = [...SHOT_WIDTHS.filter((w) => w < size.width), Math.min(size.width, MAX_WIDTH)]
      const shot: MediaShot = { width: size.width, height: size.height, variants: [] }
      let bytes = 0
      for (const width of widths) {
        const out = await encoder.fromImage(source, width)
        writeFileSync(join(MEDIA_DIR, `${name}-${out.width}.webp`), out.data)
        shot.variants.push({ width: out.width, file: `${name}-${out.width}.webp` })
        bytes += out.bytes
      }
      manifest.shots[name] = shot
      console.log(
        `  screenshots/${file} (${formatKb(source.length)}) → ${widths.join("/")}w WebP, ${formatKb(bytes)} total`,
      )
    }
    if (files.length === 0)
      console.log("  no screenshots found in screenshots/ (the site will show placeholders)")

    const atlas = buildAtlas()
    for (const [name, id] of ICONS) {
      const rgba = renderBlockIcon(atlas, blockDef(id), ICON_SIZE)
      const out = await encoder.fromRgba(rgba, ICON_SIZE, ICON_SIZE, "image/webp", 0.95)
      writeFileSync(join(MEDIA_DIR, `icon-${name}.webp`), out.data)
      manifest.icons.push(name)
    }
    console.log(`  ${ICONS.length} block icons rendered from the game's tiles`)
  } finally {
    await encoder.close()
  }

  writeFileSync(join(ROOT, "website", "media.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

if (import.meta.main) {
  const manifest = await buildMedia()
  console.log(
    `Media ready: ${Object.keys(manifest.shots).length} screenshots, ${manifest.icons.length} icons → public/media/ + website/media.json`,
  )
}
