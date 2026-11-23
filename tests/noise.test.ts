import { describe, expect, test } from "bun:test"
import { SimplexNoise } from "../game/core/noise"
import { hash2, hashSeed, mulberry32 } from "../game/core/rng"

describe("seeded randomness", () => {
  test("hashSeed is stable and case sensitive", () => {
    expect(hashSeed("loamlands")).toBe(hashSeed("loamlands"))
    expect(hashSeed("Loamlands")).not.toBe(hashSeed("loamlands"))
  })

  test("hash2 is deterministic per coordinate and varies across coordinates", () => {
    expect(hash2(12, -34, 7)).toBe(hash2(12, -34, 7))
    const values = new Set<number>()
    for (let i = 0; i < 200; i++) values.add(hash2(i, 3, 7))
    expect(values.size).toBeGreaterThan(190)
    for (let i = 0; i < 200; i++) {
      const v = hash2(i, -9, 7)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  test("mulberry32 reproduces the same sequence for the same seed", () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 50; i++) expect(a()).toBe(b())
  })
})

describe("SimplexNoise", () => {
  test("is deterministic for a seed and differs across seeds", () => {
    const n1 = new SimplexNoise(1)
    const n2 = new SimplexNoise(1)
    const n3 = new SimplexNoise(2)
    let differs = false
    for (let i = 0; i < 100; i++) {
      const x = i * 0.37
      expect(n1.noise2(x, -x)).toBe(n2.noise2(x, -x))
      expect(n1.noise3(x, x * 0.5, 2)).toBe(n2.noise3(x, x * 0.5, 2))
      if (n1.noise2(x, -x) !== n3.noise2(x, -x)) differs = true
    }
    expect(differs).toBe(true)
  })

  test("outputs stay within the documented range", () => {
    const n = new SimplexNoise(99)
    for (let i = 0; i < 2000; i++) {
      const x = (i % 97) * 0.913
      const y = (i % 31) * 1.7
      const z = i * 0.113
      expect(Math.abs(n.noise2(x, y))).toBeLessThanOrEqual(1)
      expect(Math.abs(n.noise3(x, y, z))).toBeLessThanOrEqual(1)
      expect(Math.abs(n.fbm2(x, y, 4))).toBeLessThanOrEqual(1)
      const r = n.ridged2(x, y, 3)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
    }
  })
})
