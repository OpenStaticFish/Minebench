import { mulberry32 } from "./rng";

/**
 * Seeded classic Perlin noise with a shuffled permutation table.
 * Original implementation, no external noise dependency, deterministic per seed.
 */

const GRAD3 = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
] as const;

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad3(hash: number, x: number, y: number, z: number): number {
  const g = GRAD3[hash % 12] as readonly [number, number, number];
  return g[0] * x + g[1] * y + g[2] * z;
}

export class Noise {
  private readonly perm: Uint8Array;

  constructor(seed: number) {
    const random = mulberry32(seed >>> 0);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = p[i] as number;
      p[i] = p[j] as number;
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255] as number;
  }

  /** 2D Perlin noise, roughly in [-1, 1]. */
  noise2(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const perm = this.perm;

    const aa = perm[(perm[X] as number) + Y] as number;
    const ab = perm[(perm[X] as number) + Y + 1] as number;
    const ba = perm[(perm[X + 1] as number) + Y] as number;
    const bb = perm[(perm[X + 1] as number) + Y + 1] as number;

    const x1 = grad3(aa, xf, yf, 0) + u * (grad3(ba, xf - 1, yf, 0) - grad3(aa, xf, yf, 0));
    const x2 =
      grad3(ab, xf, yf - 1, 0) + u * (grad3(bb, xf - 1, yf - 1, 0) - grad3(ab, xf, yf - 1, 0));
    return (x1 + v * (x2 - x1)) * 1.4;
  }

  /** 3D Perlin noise, roughly in [-1, 1]. */
  noise3(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    const perm = this.perm;

    const a = (perm[X] as number) + Y;
    const aa = (perm[a] as number) + Z;
    const ab = (perm[a + 1] as number) + Z;
    const b = (perm[X + 1] as number) + Y;
    const ba = (perm[b] as number) + Z;
    const bb = (perm[b + 1] as number) + Z;

    const x1 = grad3(perm[aa] as number, xf, yf, zf) +
      u * (grad3(perm[ba] as number, xf - 1, yf, zf) - grad3(perm[aa] as number, xf, yf, zf));
    const x2 = grad3(perm[ab] as number, xf, yf - 1, zf) +
      u * (grad3(perm[bb] as number, xf - 1, yf - 1, zf) - grad3(perm[ab] as number, xf, yf - 1, zf));
    const y1 = x1 + v * (x2 - x1);

    const x3 = grad3(perm[aa + 1] as number, xf, yf, zf - 1) +
      u * (grad3(perm[ba + 1] as number, xf - 1, yf, zf - 1) - grad3(perm[aa + 1] as number, xf, yf, zf - 1));
    const x4 = grad3(perm[ab + 1] as number, xf, yf - 1, zf - 1) +
      u * (grad3(perm[bb + 1] as number, xf - 1, yf - 1, zf - 1) - grad3(perm[ab + 1] as number, xf, yf - 1, zf - 1));
    const y2 = x3 + v * (x4 - x3);

    return (y1 + w * (y2 - y1)) * 1.2;
  }
}

export function fbm2(noise: Noise, x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise.noise2(x * frequency, y * frequency) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / norm;
}

export function fbm3(
  noise: Noise,
  x: number,
  y: number,
  z: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise.noise3(x * frequency, y * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1] — good for mountain crests. */
export function ridged2(noise: Noise, x: number, y: number, octaves: number): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise.noise2(x * frequency, y * frequency));
    sum += n * n * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}
