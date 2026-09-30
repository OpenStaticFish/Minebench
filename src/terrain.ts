import { Block } from './blocks';

export const CHUNK = 16;
export const HEIGHT = 64;
export const SEA = 12;
export const SEED = 74821;
export function hash(x: number, z: number, seed = SEED): number {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, z: number, scale: number): number {
  x /= scale; z /= scale;
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(x - ix), v = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
export function elevation(x: number, z: number): number {
  const lake = Math.exp(-((x + 5) ** 2 / 650 + (z - 5) ** 2 / 1200));
  const ridge = Math.exp(-((z + 48) ** 2 / 650)) * (0.6 + noise(x, z, 23));
  return Math.max(4, Math.min(49, Math.floor(15 + noise(x, z, 44) * 10 + noise(x, z, 12) * 3 - lake * 16 + ridge * 22)));
}
export function cave(x: number, y: number, z: number): boolean {
  // Winding horizontal galleries intersect exposed slopes, producing real openings.
  const center = 12 + Math.sin(x * 0.09) * 3;
  const line = -31 + Math.sin(x * 0.06) * 7;
  return y > 3 && Math.abs(y - center) < 2.5 && Math.abs(z - line) < 3.1;
}
const index = (x: number, y: number, z: number) => x + z * CHUNK + y * CHUNK * CHUNK;
export function generateChunk(cx: number, cz: number): Uint8Array {
  const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  const put = (wx: number, y: number, wz: number, block: Block) => {
    const x = wx - cx * CHUNK, z = wz - cz * CHUNK;
    if (x >= 0 && x < CHUNK && z >= 0 && z < CHUNK && y >= 0 && y < HEIGHT) data[index(x, y, z)] = block;
  };
  for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
    const wx = cx * CHUNK + x, wz = cz * CHUNK + z, h = elevation(wx, wz);
    for (let y = 0; y <= Math.max(h, SEA); y++) {
      let b = y > h ? Block.Water : y === h ? (h <= SEA + 1 ? Block.Sand : h > 32 ? Block.Stone : Block.Grass) : y > h - 3 ? (h <= SEA + 1 ? Block.Sand : Block.Dirt) : Block.Stone;
      if (y <= h && cave(wx, y, wz)) b = Block.Air;
      data[index(x, y, z)] = b;
    }
  }
  // Trees are chosen globally; including nearby anchors makes chunk boundaries seamless.
  for (let tz = cz * CHUNK - 3; tz < (cz + 1) * CHUNK + 3; tz++) for (let tx = cx * CHUNK - 3; tx < (cx + 1) * CHUNK + 3; tx++) {
    if (tx % 5 !== 0 || tz % 5 !== 0 || hash(tx, tz, 123) < 0.57) continue;
    const h = elevation(tx, tz);
    if (h <= SEA + 2 || h > 31) continue;
    const tall = 4 + Math.floor(hash(tx, tz) * 3);
    for (let y = h + tall - 2; y <= h + tall + 1; y++) {
      const r = y === h + tall + 1 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > r * 2 - 1) continue;
        put(tx + dx, y, tz + dz, Block.Leaves);
      }
    }
    for (let y = h + 1; y <= h + tall; y++) put(tx, y, tz, Block.Wood);
  }
  return data;
}
export const blockIndex = index;
