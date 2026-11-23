/**
 * Procedural terrain generator.
 *
 * Deterministic from a seed: the same seed always yields the same heights,
 * biomes, caves, ores and trees. A chunk can be generated independently of its
 * neighbours because every decision is a pure function of world coordinates.
 */
import { B } from "./blocks"
import { CHUNK_SIZE, type Chunk, chunkIndex, WORLD_HEIGHT } from "./chunk"
import { clamp, SimplexNoise, smoothstep } from "./noise"
import { hash2 } from "./rng"

export const SEA_LEVEL = 46
/** Above this height the surface is bare rock. */
export const ROCK_LINE = 80
/** Above this height (± jitter) snow settles. */
export const SNOW_LINE = 92

export const Biome = {
  Ocean: 0,
  Beach: 1,
  Plains: 2,
  Forest: 3,
  Desert: 4,
  Mountain: 5,
  Snow: 6,
} as const
export type Biome = (typeof Biome)[keyof typeof Biome]

export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.Ocean]: "Ocean",
  [Biome.Beach]: "Beach",
  [Biome.Plains]: "Plains",
  [Biome.Forest]: "Forest",
  [Biome.Desert]: "Desert",
  [Biome.Mountain]: "Mountain",
  [Biome.Snow]: "Snowy Peaks",
}

export interface ColumnInfo {
  /** y of the topmost terrain block (water may sit above it). */
  height: number
  biome: Biome
}

const TREE_DENSITY: Record<Biome, number> = {
  [Biome.Ocean]: 0,
  [Biome.Beach]: 0,
  [Biome.Plains]: 0.0045,
  [Biome.Forest]: 0.032,
  [Biome.Desert]: 0,
  [Biome.Mountain]: 0,
  [Biome.Snow]: 0.003,
}

const SURFACE: Record<Biome, number> = {
  [Biome.Ocean]: B.Sand,
  [Biome.Beach]: B.Sand,
  [Biome.Plains]: B.Grass,
  [Biome.Forest]: B.Grass,
  [Biome.Desert]: B.Sand,
  [Biome.Mountain]: B.Stone,
  [Biome.Snow]: B.Snow,
}

const FILLER: Record<Biome, number> = {
  [Biome.Ocean]: B.Dirt,
  [Biome.Beach]: B.Sand,
  [Biome.Plains]: B.Dirt,
  [Biome.Forest]: B.Dirt,
  [Biome.Desert]: B.Sand,
  [Biome.Mountain]: B.Stone,
  [Biome.Snow]: B.Stone,
}

export class TerrainGenerator {
  private readonly noise: SimplexNoise

  constructor(readonly seed: number) {
    this.noise = new SimplexNoise(seed)
  }

  /** Height and biome of a world column. Pure function of (x, z, seed). */
  column(x: number, z: number): ColumnInfo {
    const n = this.noise
    const continental = n.fbm2(x * 0.0016, z * 0.0016, 4)
    // Lower gain on the hill octaves keeps single-block stair noise down.
    const hills = n.fbm2(x * 0.01 + 500, z * 0.01 - 300, 4, 2.1, 0.4) * 8
    const ridge = n.ridged2(x * 0.0045 - 1000, z * 0.0045 + 800, 3)
    const mountainMask = smoothstep(-0.15, 0.4, n.fbm2(x * 0.0011 + 3000, z * 0.0011 + 3000, 2))
    const raw = SEA_LEVEL + 4 + continental * 26 + hills + ridge * ridge * 78 * mountainMask
    const height = Math.floor(clamp(raw, 3, WORLD_HEIGHT - 8))
    return { height, biome: this.biomeFor(x, z, height) }
  }

  private biomeFor(x: number, z: number, height: number): Biome {
    const depth = SEA_LEVEL - height
    if (depth >= 2) return Biome.Ocean
    if (depth >= -1) return Biome.Beach
    const n = this.noise
    const snowJitter = n.noise2(x * 0.05 + 1200, z * 0.05 - 900) * 4
    if (height > SNOW_LINE + snowJitter) return Biome.Snow
    if (height > ROCK_LINE) return Biome.Mountain
    const temperature = n.fbm2(x * 0.0014 + 9000, z * 0.0014 - 7000, 3)
    const moisture = n.fbm2(x * 0.0017 - 4000, z * 0.0017 + 6000, 3)
    if (temperature > 0.28 && moisture < 0.05) return Biome.Desert
    if (moisture > 0.1) return Biome.Forest
    return Biome.Plains
  }

  /** Whether a cave is carved at this block. Spaghetti tunnels plus larger caverns. */
  caveAt(x: number, y: number, z: number): boolean {
    const n = this.noise
    const a = n.noise3(x * 0.021, y * 0.034, z * 0.021)
    const b = n.noise3(x * 0.021 + 70.3, y * 0.034 - 20.1, z * 0.021 + 44.7)
    if (a * a + b * b < 0.01) return true
    return n.noise3(x * 0.013 - 300, y * 0.021 + 100, z * 0.013 + 200) > 0.64
  }

  /** Whether a tree sprouts in this column. */
  treeAt(x: number, z: number): boolean {
    const col = this.column(x, z)
    return this.isTreeAt(x, z, col)
  }

  private isTreeAt(x: number, z: number, col: ColumnInfo): boolean {
    if (col.height <= SEA_LEVEL + 2) return false
    const density = TREE_DENSITY[col.biome]
    return density > 0 && hash2(x, z, this.seed ^ 0x51ed) < density
  }

  private oreAt(x: number, y: number, z: number): number {
    const n = this.noise
    if (n.noise3(x * 0.11, y * 0.11, z * 0.11) > 0.66) return B.CoalOre
    if (y < 44 && n.noise3(x * 0.1 + 900, y * 0.1 + 900, z * 0.1 + 900) > 0.68) {
      return B.IronOre
    }
    return B.Air
  }

  /** Fill a chunk's block data from scratch. */
  generate(chunk: Chunk): void {
    const ox = chunk.originX
    const oz = chunk.originZ
    const cols: ColumnInfo[] = new Array(CHUNK_SIZE * CHUNK_SIZE)
    let maxY = chunk.maxY
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const col = this.column(ox + x, oz + z)
        cols[x + z * CHUNK_SIZE] = col
        this.fillColumn(chunk, x, z, ox + x, oz + z, col)
        const top = Math.max(col.height, SEA_LEVEL) + 1
        if (top > maxY) maxY = top
      }
    }
    // Trees are evaluated with a margin so canopies that cross chunk borders
    // are written identically by every chunk they touch.
    for (let z = -3; z < CHUNK_SIZE + 3; z++) {
      for (let x = -3; x < CHUNK_SIZE + 3; x++) {
        const inside = x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE
        const col = inside ? cols[x + z * CHUNK_SIZE]! : this.column(ox + x, oz + z)
        if (this.isTreeAt(ox + x, oz + z, col)) this.placeTree(chunk, ox + x, oz + z, col)
      }
    }
    chunk.maxY = maxY
    chunk.dirty = true
  }

  private fillColumn(
    chunk: Chunk,
    x: number,
    z: number,
    wx: number,
    wz: number,
    col: ColumnInfo,
  ): void {
    const data = chunk.data
    const base = x + (z << 4)
    const { height, biome } = col
    data[base] = B.Bedrock
    let surface = SURFACE[biome]
    if (biome === Biome.Ocean && SEA_LEVEL - height > 4) surface = B.Dirt
    const filler = FILLER[biome]
    for (let y = 1; y <= height; y++) {
      let id: number
      if (y === height) id = surface
      else if (y >= height - 3) id = filler
      else id = this.oreAt(wx, y, wz) || B.Stone
      data[base + (y << 8)] = id
    }
    for (let y = height + 1; y <= SEA_LEVEL; y++) data[base + (y << 8)] = B.Water
    // Carve caves only under dry land so lakes never drain into hollows.
    if (height > SEA_LEVEL) {
      for (let y = 7; y < height; y++) {
        if (this.caveAt(wx, y, wz)) data[base + (y << 8)] = B.Air
      }
    }
  }

  private placeTree(chunk: Chunk, x: number, z: number, col: ColumnInfo): void {
    const rand = hash2(x, z, this.seed ^ 0x7a3e)
    const trunkHeight = 4 + Math.floor(rand * 3)
    const baseY = col.height + 1
    const ox = chunk.originX
    const oz = chunk.originZ
    const put = (wx: number, wy: number, wz: number, id: number, onlyIfAir: boolean) => {
      const lx = wx - ox
      const lz = wz - oz
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 0 || wy >= WORLD_HEIGHT) return
      const i = chunkIndex(lx, wy, lz)
      if (onlyIfAir && chunk.data[i] !== 0) return
      chunk.data[i] = id
      if (wy + 1 > chunk.maxY) chunk.maxY = wy + 1
    }
    for (let i = 0; i < trunkHeight; i++) put(x, baseY + i, z, B.Log, false)
    const topY = baseY + trunkHeight - 1
    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy < 0 ? 2 : 1
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dz === 0 && dy <= 0) continue
          const corner = Math.abs(dx) === radius && Math.abs(dz) === radius
          if (corner && (dy >= 0 || hash2(x * 31 + dx, z * 31 + dz, this.seed + dy) < 0.5)) {
            continue
          }
          put(x + dx, topY + dy, z + dz, B.Leaves, true)
        }
      }
    }
  }
}
