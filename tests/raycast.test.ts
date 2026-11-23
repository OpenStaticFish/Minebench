import { beforeEach, describe, expect, test } from "bun:test"
import { B } from "../game/core/blocks"
import { raycastVoxel } from "../game/core/raycast"

const blocks = new Map<string, number>()
const set = (x: number, y: number, z: number, id: number) => blocks.set(`${x},${y},${z}`, id)
const getBlock = (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? B.Air

describe("voxel raycast", () => {
  beforeEach(() => blocks.clear())

  test("hits the first block along +X and reports the facing normal", () => {
    set(3, 0, 0, B.Stone)
    const hit = raycastVoxel(0.5, 0.5, 0.5, 1, 0, 0, 8, getBlock)
    expect(hit).toMatchObject({ x: 3, y: 0, z: 0, nx: -1, ny: 0, nz: 0, id: B.Stone })
    expect(hit!.distance).toBeCloseTo(2.5, 6)
  })

  test("diagonal rays land on the right face", () => {
    set(2, 2, 2, B.Log)
    const hit = raycastVoxel(0.5, 0.5, 0.5, 1, 1, 1, 10, getBlock)
    expect(hit).toMatchObject({ x: 2, y: 2, z: 2 })
    expect(hit!.nx + hit!.ny + hit!.nz).toBe(-1)
  })

  test("returns null beyond reach and ignores water", () => {
    set(30, 0, 0, B.Stone)
    expect(raycastVoxel(0.5, 0.5, 0.5, 1, 0, 0, 8, getBlock)).toBeNull()
    set(2, 0, 0, B.Water)
    expect(raycastVoxel(0.5, 0.5, 0.5, 1, 0, 0, 8, getBlock)).toBeNull()
  })
})
