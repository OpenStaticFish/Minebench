import { describe, expect, test } from "bun:test"
import { B } from "../game/core/blocks"
import { Chunk, WORLD_HEIGHT } from "../game/core/chunk"
import { type BlockSource, buildChunkMesh, type MeshData } from "../game/core/mesher"

const empty: BlockSource = { getBlock: () => 0 }

function faceCount(md: MeshData | null): number {
  return md ? md.faceCount : 0
}

describe("chunk mesher", () => {
  test("a lone block has exactly six faces with directional shading", () => {
    const chunk = new Chunk(0, 0)
    chunk.set(5, 10, 5, B.Stone)
    const { opaque, water } = buildChunkMesh(chunk, empty)
    expect(faceCount(water)).toBe(0)
    expect(opaque).not.toBeNull()
    expect(opaque!.faceCount).toBe(6)
    expect(opaque!.vertexCount).toBe(24)
    expect(opaque!.indices.length).toBe(36)
    // top face is fully lit, bottom face is half lit
    const lights: number[] = []
    for (let v = 0; v < opaque!.vertexCount; v++) lights.push(opaque!.data[v * 2 + 1]!)
    expect(lights[0]).toBe(Math.round(0.86 * 255)) // +X
    expect(Math.max(...lights)).toBe(255)
    expect(Math.min(...lights)).toBe(Math.round(0.5 * 255))
  })

  test("faces between two opaque blocks are culled, including across chunk borders", () => {
    const chunk = new Chunk(0, 0)
    chunk.set(0, 1, 0, B.Stone)
    chunk.set(1, 1, 0, B.Stone)
    const { opaque } = buildChunkMesh(chunk, empty)
    expect(opaque!.faceCount).toBe(10)

    const neighbour = new Chunk(1, 0)
    chunk.set(15, 1, 0, B.Stone)
    neighbour.set(0, 1, 0, B.Stone)
    const world: BlockSource = {
      getBlock: (x, y, z) => (x >= 16 ? neighbour.get(x - 16, y, z) : chunk.get(x, y, z)),
    }
    expect(buildChunkMesh(chunk, world).opaque!.faceCount).toBe(15) // 10 + 6 - 1 shared
  })

  test("bottom layer faces are culled and the sky above is never culled", () => {
    const chunk = new Chunk(0, 0)
    chunk.set(2, 0, 2, B.Stone)
    expect(buildChunkMesh(chunk, empty).opaque!.faceCount).toBe(5)
    chunk.set(2, WORLD_HEIGHT - 1, 2, B.Stone)
    expect(buildChunkMesh(chunk, empty).opaque!.faceCount).toBe(11)
  })

  test("water is meshed separately with a lowered surface and shared faces culled", () => {
    const chunk = new Chunk(0, 0)
    chunk.set(0, 5, 0, B.Water)
    chunk.set(1, 5, 0, B.Water)
    const { opaque, water } = buildChunkMesh(chunk, empty)
    expect(opaque).toBeNull()
    expect(water!.faceCount).toBe(10)
    const ys = Array.from(water!.positions).filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys)).toBeCloseTo(5.88, 5)
    expect(Math.min(...ys)).toBe(5)
  })

  test("ambient occlusion darkens vertices tucked into corners", () => {
    // A block with neighbours to the side and above-front: the shared corner of
    // its +Z face is fully occluded (level 0), the rest of that face is not.
    const chunk = new Chunk(0, 0)
    chunk.set(0, 1, 0, B.Stone)
    chunk.set(1, 1, 1, B.Stone)
    chunk.set(0, 2, 1, B.Stone)
    const { opaque } = buildChunkMesh(chunk, empty)
    const lights: number[] = []
    for (let v = 0; v < opaque!.vertexCount; v++) lights.push(opaque!.data[v * 2 + 1]!)
    const faceLight = Math.round(0.8 * 255)
    const cornerLight = Math.round(0.8 * 0.52 * 255)
    expect(lights).toContain(faceLight)
    expect(lights).toContain(cornerLight)
  })

  test("glowing blocks ignore occlusion and leaves keep faces between leaves", () => {
    const chunk = new Chunk(0, 0)
    chunk.set(0, 1, 0, B.Lamp)
    chunk.set(1, 1, 0, B.Lamp)
    const lamp = buildChunkMesh(chunk, empty).opaque!
    let allLit = true
    for (let v = 0; v < lamp.vertexCount; v++) if (lamp.data[v * 2 + 1] !== 255) allLit = false
    expect(allLit).toBe(true)

    const leaves = new Chunk(0, 0)
    leaves.set(0, 1, 0, B.Leaves)
    leaves.set(1, 1, 0, B.Leaves)
    expect(buildChunkMesh(leaves, empty).opaque!.faceCount).toBe(12)
  })
})
