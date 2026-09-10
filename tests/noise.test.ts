import { describe, expect, test } from "bun:test";
import { fbm2, Noise } from "../src/core/noise";
import { hash2i, mulberry32 } from "../src/core/rng";

describe("Noise", () => {
  test("is deterministic for a given seed", () => {
    const a = new Noise(1234);
    const b = new Noise(1234);
    for (let i = 0; i < 100; i++) {
      const x = i * 0.37;
      const y = i * -0.11;
      expect(a.noise2(x, y)).toBe(b.noise2(x, y));
      expect(a.noise3(x, y, 3.5)).toBe(b.noise3(x, y, 3.5));
    }
  });

  test("differs between seeds", () => {
    const a = new Noise(1);
    const b = new Noise(2);
    let differences = 0;
    for (let i = 0; i < 50; i++) {
      const x = i * 0.5 + 0.173;
      const y = i * 0.25 + 0.418;
      if (a.noise2(x, y) !== b.noise2(x, y)) differences++;
    }
    expect(differences).toBeGreaterThan(40);
  });

  test("stays in a sane range", () => {
    const noise = new Noise(99);
    for (let i = 0; i < 2000; i++) {
      const value = noise.noise2(i * 0.13, i * -0.07);
      expect(value).toBeGreaterThan(-1.5);
      expect(value).toBeLessThan(1.5);
    }
    for (let i = 0; i < 500; i++) {
      const value = noise.noise3(i * 0.21, i * 0.05, i * -0.31);
      expect(value).toBeGreaterThan(-1.7);
      expect(value).toBeLessThan(1.7);
    }
  });

  test("fbm2 returns normalised values", () => {
    const noise = new Noise(7);
    for (let i = 0; i < 500; i++) {
      const value = fbm2(noise, i * 0.05, i * 0.03, 4);
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThan(1.3);
    }
  });
});

describe("random helpers", () => {
  test("mulberry32 is deterministic", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  test("hash2i is stable and normalised", () => {
    expect(hash2i(10, -4, 5)).toBe(hash2i(10, -4, 5));
    for (let x = -10; x < 10; x++) {
      for (let z = -10; z < 10; z++) {
        const value = hash2i(x, z, 123);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });
});
