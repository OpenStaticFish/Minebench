/**
 * Renders isometric block icons from the game's procedural tiles, the same way
 * the in-game hotbar does (top face + two shaded side faces), so the website's
 * icons are literally made of the game's own textures.
 */
import type { BlockDef } from "../../game/core/blocks"
import { type buildAtlas, TILE_SIZE } from "../../game/core/textures"

type Atlas = ReturnType<typeof buildAtlas>
type RGB = readonly [number, number, number]

const SUPERSAMPLE = 4

type RGBA = readonly [number, number, number, number]

/** Fully transparent texels (glass, leaf holes) become a faint tint so the block silhouette still reads. */
const TINT: RGB = [205, 232, 255]

function texel(atlas: Atlas, tile: number, u: number, v: number): RGBA {
  const tx = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor(u * TILE_SIZE)))
  const ty = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor(v * TILE_SIZE)))
  const o = ((tile * TILE_SIZE + ty) * TILE_SIZE + tx) * 4
  const alpha = atlas.data[o + 3]!
  if (alpha === 0) return [TINT[0], TINT[1], TINT[2], 0.3]
  return [atlas.data[o]!, atlas.data[o + 1]!, atlas.data[o + 2]!, alpha / 255]
}

/** Invert `p = origin + u·a + v·b`; returns null when (u, v) falls outside the unit square. */
function uvAt(
  px: number,
  py: number,
  origin: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): [number, number] | null {
  const det = a[0] * b[1] - b[0] * a[1]
  const dx = px - origin[0]
  const dy = py - origin[1]
  const u = (dx * b[1] - b[0] * dy) / det
  const v = (a[0] * dy - dx * a[1]) / det
  return u >= 0 && u < 1 && v >= 0 && v < 1 ? [u, v] : null
}

/** Returns RGBA pixels for a `size`×`size` icon of `block`. */
export function renderBlockIcon(atlas: Atlas, block: BlockDef, size: number): Uint8Array {
  const s = size * 0.92
  const cx = size / 2
  const t0 = size * 0.04
  const faces = [
    // origin, basis a, basis b, tile, shade
    { o: [cx, t0], a: [s / 2, s / 4], b: [-s / 2, s / 4], tile: block.tiles.top, shade: 1 },
    {
      o: [cx - s / 2, t0 + s / 4],
      a: [s / 2, s / 4],
      b: [0, s / 2],
      tile: block.tiles.side,
      shade: 0.72,
    },
    { o: [cx, t0 + s / 2], a: [s / 2, -s / 4], b: [0, s / 2], tile: block.tiles.side, shade: 0.55 },
  ] as const

  const out = new Uint8Array(size * size * 4)
  const samples = SUPERSAMPLE * SUPERSAMPLE
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = x + (sx + 0.5) / SUPERSAMPLE
          const py = y + (sy + 0.5) / SUPERSAMPLE
          for (const face of faces) {
            const uv = uvAt(px, py, face.o, face.a, face.b)
            if (!uv) continue
            const color = texel(atlas, face.tile, uv[0], uv[1])
            r += color[0] * face.shade * color[3]
            g += color[1] * face.shade * color[3]
            b += color[2] * face.shade * color[3]
            n += color[3]
            break
          }
        }
      }
      const o = (y * size + x) * 4
      if (n > 0) {
        // Colours were pre-multiplied by alpha above; un-premultiply for straight RGBA.
        out[o] = Math.round(r / n)
        out[o + 1] = Math.round(g / n)
        out[o + 2] = Math.round(b / n)
        out[o + 3] = Math.round((n / samples) * 255)
      }
    }
  }
  return out
}
