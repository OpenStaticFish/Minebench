/**
 * Procedural 16×16 block textures.
 *
 * Every tile is generated in code from seeded hashes (no image assets), so the
 * look is original, tiny to ship, and deterministic between reloads. Tiles are
 * stacked into a 2D texture array (one layer per tile) which avoids atlas bleeding.
 */

import { clamp, lerp } from "./noise"
import { hash2, mulberry32 } from "./rng"

export const TILE_SIZE = 16

export const TILE_NAMES = [
  "grass_top",
  "grass_side",
  "dirt",
  "stone",
  "cobble",
  "sand",
  "log_side",
  "log_top",
  "leaves",
  "planks",
  "glass",
  "water",
  "snow",
  "coal_ore",
  "iron_ore",
  "lamp",
  "bedrock",
] as const

export type TileName = (typeof TILE_NAMES)[number]

export const TILE_INDEX: Record<TileName, number> = Object.fromEntries(
  TILE_NAMES.map((name, i) => [name, i]),
) as Record<TileName, number>

type RGB = readonly [number, number, number]
type RGBA = readonly [number, number, number, number]

const hex = (h: string): RGB => {
  const n = Number.parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
]
const scale = (c: RGB, f: number): RGB => [
  clamp(c[0] * f, 0, 255),
  clamp(c[1] * f, 0, 255),
  clamp(c[2] * f, 0, 255),
]
const opaque = (c: RGB): RGBA => [c[0], c[1], c[2], 255]

/**
 * Tileable smooth value noise in [0, 1]. `freqX`/`freqY` are whole numbers of
 * lattice cells across the tile; anisotropic frequencies give directional grain.
 */
function vnoise(x: number, y: number, freqX: number, freqY: number, salt: number): number {
  const fx = (x / TILE_SIZE) * freqX
  const fy = (y / TILE_SIZE) * freqY
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const wrap = (v: number, f: number) => ((v % f) + f) % f
  const xa = wrap(x0, freqX)
  const xb = wrap(x0 + 1, freqX)
  const ya = wrap(y0, freqY)
  const yb = wrap(y0 + 1, freqY)
  const h = (a: number, b: number) => hash2(a + salt * 101, b + salt * 37, 0x5eed)
  return lerp(lerp(h(xa, ya), h(xb, ya), sx), lerp(h(xa, yb), h(xb, yb), sx), sy)
}

/** A few seeded points inside the tile, used for cobble cells and ore blobs. */
function sites(count: number, salt: number): Array<[number, number, number]> {
  const rand = mulberry32(salt)
  return Array.from({ length: count }, () => [rand() * 16, rand() * 16, rand()])
}

/** Toroidal Chebyshev distance so patterns tile seamlessly and stay blocky. */
function nearest(points: Array<[number, number, number]>, x: number, y: number) {
  let d1 = 99
  let d2 = 99
  let id = 0
  for (const [px, py, pid] of points) {
    let dx = Math.abs(x + 0.5 - px)
    let dy = Math.abs(y + 0.5 - py)
    dx = Math.min(dx, 16 - dx)
    dy = Math.min(dy, 16 - dy)
    const d = Math.max(dx, dy)
    if (d < d1) {
      d2 = d1
      d1 = d
      id = pid
    } else if (d < d2) {
      d2 = d
    }
  }
  return { d1, d2, id }
}

// Palette — earthy, slightly desaturated, with a few bright accents.
const GRASS_A = hex("#5da83a")
const GRASS_B = hex("#8ad656")
const DIRT_A = hex("#7a4e2d")
const DIRT_B = hex("#9c6b40")
const STONE_A = hex("#777b80")
const STONE_B = hex("#9ea2a7")
const SAND_A = hex("#d9c78c")
const SAND_B = hex("#f1e6b3")
const SNOW_A = hex("#e6edf4")
const SNOW_B = hex("#ffffff")
const LEAF_A = hex("#3e8a2e")
const LEAF_B = hex("#6fc247")
const PLANK_A = hex("#b58a50")
const PLANK_B = hex("#d6b373")
const BARK_A = hex("#5b3d22")
const BARK_B = hex("#7b5636")
const WATER_A = hex("#2a63c0")
const WATER_B = hex("#3b7bd8")

const COBBLE_SITES = sites(9, 0xc0bb1e)
const COAL_SITES = sites(5, 0xc0a1)
const IRON_SITES = sites(5, 0x1207)

const grassPixel = (x: number, y: number): RGB => {
  const n = vnoise(x, y, 4, 4, 1) * 0.55 + hash2(x, y, 11) * 0.45
  let c = mix(GRASS_A, GRASS_B, n)
  const r = hash2(x, y, 12)
  if (r < 0.07) c = scale(c, 0.82)
  else if (r > 0.95) c = scale(c, 1.12)
  return c
}
const dirtPixel = (x: number, y: number): RGB => {
  const n = vnoise(x, y, 4, 4, 2) * 0.5 + hash2(x, y, 13) * 0.5
  let c = mix(DIRT_A, DIRT_B, n)
  const r = hash2(x, y, 14)
  if (r < 0.1) c = scale(c, 0.8)
  else if (r > 0.96) c = scale(c, 1.14)
  return c
}
const stonePixel = (x: number, y: number): RGB => {
  const n = vnoise(x, y, 3, 3, 31) * 0.6 + hash2(x, y, 32) * 0.4
  let c = mix(STONE_A, STONE_B, n)
  if (hash2(x, y, 33) < 0.05) c = scale(c, 0.74)
  return c
}
const orePixel = (
  x: number,
  y: number,
  pts: Array<[number, number, number]>,
  base: RGB,
  shine: RGB,
): RGB => {
  const { d1, id } = nearest(pts, x, y)
  if (d1 <= 1.6 + id * 0.6) {
    const n = hash2(x, y, 41)
    return n > 0.72 ? shine : scale(base, 0.85 + n * 0.3)
  }
  return stonePixel(x, y)
}

const GENERATORS: Record<TileName, (x: number, y: number) => RGBA> = {
  grass_top: (x, y) => opaque(grassPixel(x, y)),
  grass_side: (x, y) => {
    const edge = 3 + (hash2(x, 0, 21) < 0.55 ? 1 : 0) + (hash2(x, 0, 22) < 0.2 ? 1 : 0)
    return opaque(y < edge ? grassPixel(x, y) : dirtPixel(x, y))
  },
  dirt: (x, y) => opaque(dirtPixel(x, y)),
  stone: (x, y) => opaque(stonePixel(x, y)),
  cobble: (x, y) => {
    const { d1, d2, id } = nearest(COBBLE_SITES, x, y)
    const n = hash2(x, y, 51)
    if (d2 - d1 < 1.1) return opaque(scale(hex("#45484c"), 0.85 + n * 0.3))
    const c = mix(STONE_A, STONE_B, 0.25 + id * 0.6 + (n - 0.5) * 0.2)
    return opaque(scale(c, 1 - d1 * 0.04))
  },
  sand: (x, y) => {
    const n = vnoise(x, y, 3, 3, 61) * 0.4 + hash2(x, y, 62) * 0.6
    let c = mix(SAND_A, SAND_B, n)
    if (hash2(x, y, 63) < 0.05) c = scale(c, 0.86)
    return opaque(c)
  },
  log_side: (x, y) => {
    const n = vnoise(x, y, 6, 2, 71) * 0.65 + hash2(x, y, 72) * 0.35
    let c = mix(BARK_A, BARK_B, n)
    if (hash2(x, y, 73) < 0.06) c = scale(c, 0.72)
    return opaque(c)
  },
  log_top: (x, y) => {
    const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
    if (r > 6) {
      const n = hash2(x, y, 74)
      return opaque(scale(mix(BARK_A, BARK_B, n), 1))
    }
    const ring = Math.floor(r) & 1
    const n = hash2(x, y, 75) * 0.2
    return opaque(scale(ring ? hex("#c9a268") : hex("#946d3d"), 0.92 + n))
  },
  leaves: (x, y) => {
    if (hash2(x, y, 81) < 0.09) return [0, 0, 0, 0]
    const n = vnoise(x, y, 4, 4, 82) * 0.5 + hash2(x, y, 83) * 0.5
    let c = mix(LEAF_A, LEAF_B, n)
    if (hash2(x, y, 84) > 0.94) c = scale(c, 1.2)
    return opaque(c)
  },
  planks: (x, y) => {
    const row = y >> 2
    const seamX = x === ((row * 7 + 3) & 15)
    if ((y & 3) === 3 || seamX) return opaque(scale(hex("#6f4a28"), 0.9 + hash2(x, y, 91) * 0.2))
    const grain = vnoise(x, y, 2, 6, 92) * 0.6 + hash2(x, y, 93) * 0.4
    return opaque(mix(PLANK_A, PLANK_B, grain))
  },
  glass: (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return opaque(hex("#dff4ff"))
    const d = x + y
    if ((d === 6 || d === 7) && x < 7) return [255, 255, 255, 170]
    if ((d === 11 || d === 12) && x > 3 && x < 11) return [255, 255, 255, 150]
    return [0, 0, 0, 0]
  },
  // Deliberately low-contrast: the tile repeats on every block, so any strong
  // pattern would read as a grid. Movement comes from the shader ripple instead.
  water: (x, y) => {
    const n = vnoise(x, y, 2, 2, 101) * 0.6 + hash2(x, y, 102) * 0.2 + 0.1
    return opaque(mix(WATER_A, WATER_B, n))
  },
  snow: (x, y) => {
    const n = vnoise(x, y, 3, 3, 111) * 0.5 + hash2(x, y, 112) * 0.5
    return opaque(mix(SNOW_A, SNOW_B, n))
  },
  coal_ore: (x, y) => opaque(orePixel(x, y, COAL_SITES, hex("#26282b"), hex("#45484c"))),
  iron_ore: (x, y) => opaque(orePixel(x, y, IRON_SITES, hex("#c98f66"), hex("#e9b892"))),
  lamp: (x, y) => {
    const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
    const n = hash2(x, y, 121) * 0.12
    if (r > 6) return opaque(scale(hex("#b8863a"), 0.9 + n))
    return opaque(mix(hex("#ffd978"), hex("#fff3bd"), clamp(1 - r / 6.5 + n, 0, 1)))
  },
  bedrock: (x, y) => {
    const n = vnoise(x, y, 2, 2, 131) * 0.6 + hash2(x, y, 132) * 0.4
    return opaque(mix(hex("#26282b"), hex("#575b61"), n))
  },
}

/** Generate one tile as raw RGBA bytes, row-major, 16×16. */
export function generateTile(name: TileName): Uint8Array {
  const gen = GENERATORS[name]
  const out = new Uint8Array(TILE_SIZE * TILE_SIZE * 4)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const px = gen(x, y)
      out.set(px, (y * TILE_SIZE + x) * 4)
    }
  }
  return out
}

/** All tiles stacked layer-by-layer, ready for a 2D texture array upload. */
export function buildAtlas(): { data: Uint8Array; width: number; height: number; depth: number } {
  const depth = TILE_NAMES.length
  const data = new Uint8Array(TILE_SIZE * TILE_SIZE * 4 * depth)
  TILE_NAMES.forEach((name, layer) => {
    data.set(generateTile(name), layer * TILE_SIZE * TILE_SIZE * 4)
  })
  return { data, width: TILE_SIZE, height: TILE_SIZE, depth }
}
