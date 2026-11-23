import { describe, expect, test } from "bun:test"
import { type Box, boxOverlapsSolid, isGrounded, moveBox } from "../game/core/collision"

// A 5×5 floor at y=0 and a wall at x=3 (y 1..3).
const isSolid = (x: number, y: number, z: number) =>
  (y === 0 && Math.abs(x) <= 2 && Math.abs(z) <= 2) || (x === 3 && y >= 1 && y <= 3 && z === 0)

const player = (x: number, y: number, z: number): Box => ({
  minX: x - 0.3,
  maxX: x + 0.3,
  minY: y,
  maxY: y + 1.8,
  minZ: z - 0.3,
  maxZ: z + 0.3,
})

describe("collision", () => {
  test("falling onto the floor clamps the box on top of it", () => {
    const box = player(0, 5, 0)
    const r = moveBox(box, 0, -10, 0, isSolid)
    expect(r.hitY).toBe(true)
    expect(box.minY).toBeCloseTo(1.001, 6)
    expect(isGrounded(box, isSolid)).toBe(true)
  })

  test("walking into a wall stops at the wall while sliding along it", () => {
    const box = player(2, 1.001, 0)
    const r = moveBox(box, 3, 0, 0, isSolid)
    expect(r.hitX).toBe(true)
    expect(box.maxX).toBeCloseTo(2.999, 6)
    const r2 = moveBox(box, 1, 0, 2, isSolid)
    expect(r2.hitX).toBe(true)
    expect(r2.hitZ).toBe(false)
    expect(box.maxZ).toBeCloseTo(2.3, 6)
  })

  test("free movement is unaffected", () => {
    const box = player(0, 1.001, 0)
    const r = moveBox(box, 0.5, 0, -0.25, isSolid)
    expect(r).toEqual({ hitX: false, hitY: false, hitZ: false })
    expect(box.minX).toBeCloseTo(0.2, 6)
    expect(box.maxZ).toBeCloseTo(0.05, 6)
  })

  test("overlap detection", () => {
    expect(boxOverlapsSolid(player(3, 1, 0), isSolid)).toBe(true)
    expect(boxOverlapsSolid(player(0, 1.001, 0), isSolid)).toBe(false)
  })
})
