/**
 * Small deterministic PRNG helpers. Everything in world generation is driven by
 * these so a seed always reproduces the exact same world.
 */

/** mulberry32 — tiny, fast, good enough for procedural content. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** xmur3 string hash, used to turn a player-visible seed string into a number. */
export function hashStringToSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Deterministic 3D integer hash in [0, 1). */
export function hash3i(x: number, y: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Deterministic 2D integer hash in [0, 1). */
export function hash2i(x: number, z: number, seed: number): number {
  return hash3i(x, 0, z, seed);
}
