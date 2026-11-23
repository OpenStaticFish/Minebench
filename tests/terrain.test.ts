import { describe, expect, test } from "bun:test"
import { B } from "../game/core/blocks"
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT } from "../game/core/chunk"
import { findSpawn } from "../game/core/spawn"
import { Biome, type ColumnInfo, SEA_LEVEL, TerrainGenerator } from "../game/core/terrain"
import { World } from "../game/core/world"

const SEED = 1234
const gen = new TerrainGenerator(SEED)

function generateArea(seed: number, radius = 3): Map<string, Chunk> {
  const g = new TerrainGenerator(seed)
  const out = new Map<string, Chunk>()
  for (let cz = -radius; cz <= radius; cz++) {
    for (let cx = -radius; cx <= radius; cx++) {
      const chunk = new Chunk(cx, cz)
      g.generate(chunk)
      out.set(chunk.key, chunk)
    }
  }
  return out
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function countBlocks(chunks: Map<string, Chunk>, id: number): number {
  let n = 0
  for (const chunk of chunks.values()) for (const b of chunk.data) if (b === id) n++
  return n
}

describe("terrain generation", () => {
  test("is deterministic for a seed", () => {
    const a = generateArea(SEED, 1)
    const b = generateArea(SEED, 1)
    for (const [key, chunk] of a) expect(sameBytes(chunk.data, b.get(key)!.data)).toBe(true)
    const c = generateArea(SEED + 1, 1)
    let differs = false
    for (const [key, chunk] of a) if (!sameBytes(chunk.data, c.get(key)!.data)) differs = true
    expect(differs).toBe(true)
  })

  test("heights stay in world bounds and bedrock is at the bottom", () => {
    for (let z = -500; z <= 500; z += 25) {
      for (let x = -500; x <= 500; x += 25) {
        const col = gen.column(x, z)
        expect(col.height).toBeGreaterThanOrEqual(3)
        expect(col.height).toBeLessThanOrEqual(WORLD_HEIGHT - 8)
      }
    }
    const chunks = generateArea(SEED, 1)
    for (const chunk of chunks.values()) {
      for (let z = 0; z < CHUNK_SIZE; z++)
        for (let x = 0; x < CHUNK_SIZE; x++) {
          expect(chunk.get(x, 0, z)).toBe(B.Bedrock)
        }
    }
  })

  test("water fills up to sea level over low ground and shores are sandy", () => {
    // Find one submerged and one beach column by scanning heights, then verify the
    // generated blocks in those columns.
    const find = (predicate: (c: ColumnInfo) => boolean) => {
      for (let z = -400; z <= 400; z += 8) {
        for (let x = -400; x <= 400; x += 8) {
          const c = gen.column(x, z)
          if (predicate(c)) return { x, z, c }
        }
      }
      return null
    }
    const submerged = find((c) => c.height < SEA_LEVEL)
    const beach = find((c) => c.biome === Biome.Beach)
    expect(submerged).not.toBeNull()
    expect(beach).not.toBeNull()
    for (const spot of [submerged!, beach!]) {
      const chunk = new Chunk(spot.x >> 4, spot.z >> 4)
      gen.generate(chunk)
      const lx = spot.x & 15
      const lz = spot.z & 15
      if (spot.c.height < SEA_LEVEL) expect(chunk.get(lx, SEA_LEVEL, lz)).toBe(B.Water)
      if (spot.c.biome === Biome.Beach) expect(chunk.get(lx, spot.c.height, lz)).toBe(B.Sand)
    }
  })

  test("produces a variety of biomes, trees, ores and caves", () => {
    const biomes = new Set<number>()
    for (let z = -1500; z <= 1500; z += 75)
      for (let x = -1500; x <= 1500; x += 75) {
        biomes.add(gen.column(x, z).biome)
      }
    expect(biomes.size).toBeGreaterThanOrEqual(5)

    const chunks = generateArea(SEED, 4)
    expect(countBlocks(chunks, B.Log)).toBeGreaterThan(20)
    expect(countBlocks(chunks, B.Leaves)).toBeGreaterThan(countBlocks(chunks, B.Log) * 4)
    expect(countBlocks(chunks, B.CoalOre)).toBeGreaterThan(0)
    expect(countBlocks(chunks, B.IronOre)).toBeGreaterThan(0)

    let carved = 0
    for (const chunk of chunks.values()) {
      for (let z = 0; z < CHUNK_SIZE; z++)
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const height = gen.column(chunk.originX + x, chunk.originZ + z).height
          for (let y = 7; y < height - 4; y++) if (chunk.get(x, y, z) === B.Air) carved++
        }
    }
    expect(carved).toBeGreaterThan(0)
  })

  test("trees crossing chunk borders are identical regardless of generation order", () => {
    // Generate the same region twice with different traversal orders; results must match.
    const a = generateArea(SEED, 2)
    const b = new Map<string, Chunk>()
    const g = new TerrainGenerator(SEED)
    for (let cx = 2; cx >= -2; cx--)
      for (let cz = 2; cz >= -2; cz--) {
        const chunk = new Chunk(cx, cz)
        g.generate(chunk)
        b.set(chunk.key, chunk)
      }
    for (const [key, chunk] of a) expect(sameBytes(chunk.data, b.get(key)!.data)).toBe(true)
  })
})

describe("world", () => {
  test("setBlock persists, marks the chunk dirty and reports border neighbours", () => {
    const world = new World(SEED, gen)
    const c0 = world.ensureChunk(0, 0)
    const c1 = world.ensureChunk(1, 0)
    c0.dirty = false
    c1.dirty = false
    expect(world.getBlock(16, 40, 4)).toBe(c1.get(0, 40, 4))
    world.setBlock(16, 40, 4, B.Lamp)
    expect(world.getBlock(16, 40, 4)).toBe(B.Lamp)
    expect(c1.dirty).toBe(true)
    // A block on the x=0 border of chunk 1 touches chunk 0's x=15 faces.
    expect(c0.dirty).toBe(true)
    world.setBlock(16, 40, 4, B.Air)
    expect(world.getBlock(16, 40, 4)).toBe(B.Air)
  })

  test("out-of-range and unloaded coordinates are safe", () => {
    const world = new World(SEED, gen)
    expect(world.getBlock(0, -1, 0)).toBe(B.Air)
    expect(world.getBlock(0, WORLD_HEIGHT, 0)).toBe(B.Air)
    expect(world.getBlock(9999, 10, 9999)).toBe(B.Air)
    expect(world.setBlock(9999, 10, 9999, B.Stone)).toEqual([])
  })
})

describe("spawn", () => {
  test("spawn is on dry, solid ground and deterministic", () => {
    const spawn = findSpawn(gen)
    expect(findSpawn(gen)).toEqual(spawn)
    const col: ColumnInfo = gen.column(Math.floor(spawn.x), Math.floor(spawn.z))
    expect(col.height).toBeGreaterThan(SEA_LEVEL)
    expect(spawn.y).toBe(col.height + 1)
  })
})
