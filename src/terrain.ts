export const CHUNK = 16;
export const DEFAULT_VIEW_DISTANCE = 12;
export const MAX_VIEW_DISTANCE = 24;
export const HEIGHT = 88;
export const SEA = 17;
export const SEED = 8317;
export enum Block {
  Air,
  Grass,
  Dirt,
  Stone,
  Sand,
  Wood,
  Leaves,
  Water,
  Snow,
  Planks,
}
export const BLOCKS = [
  { id: Block.Grass, name: "Meadow", color: "#83a94d" },
  { id: Block.Dirt, name: "Earth", color: "#987352" },
  { id: Block.Stone, name: "Limestone", color: "#9aa49c" },
  { id: Block.Sand, name: "Sand", color: "#e0cc91" },
  { id: Block.Wood, name: "Cedar", color: "#8b6949" },
  { id: Block.Leaves, name: "Canopy", color: "#4f8150" },
  { id: Block.Planks, name: "Timber", color: "#bd9660" },
  { id: Block.Snow, name: "Snow", color: "#e4ede4" },
];
export function hash(x: number, z: number, salt = 0): number {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(z, 668265263) ^
    Math.imul(SEED + salt, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  let tx = x - ix,
    tz = z - iz;
  tx = tx * tx * (3 - 2 * tx);
  tz = tz * tz * (3 - 2 * tz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz),
    c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}
export function surface(x: number, z: number): number {
  const lake = Math.exp(-((x / 30) ** 2 + (z / 36) ** 2));
  const ridge = Math.exp(-(((z + 49) / 24) ** 2));
  const peaks = 17 + 25 * noise(x / 24, z / 25) + 11 * noise(x / 11, z / 14);
  return Math.max(
    4,
    Math.min(
      HEIGHT - 10,
      Math.floor(
        22 +
          noise(x / 35, z / 35) * 12 +
          noise(x / 9, z / 9) * 3 -
          lake * 23 +
          ridge * peaks,
      ),
    ),
  );
}
export const solid = (b: Block): boolean =>
  b !== Block.Air && b !== Block.Water;
export const index = (x: number, y: number, z: number): number =>
  (x * CHUNK + z) * HEIGHT + y;
export const chunkKey = (x: number, z: number): string => `${x},${z}`;

export function generateChunk(cx: number, cz: number): Uint8Array {
  const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  const ox = cx * CHUNK,
    oz = cz * CHUNK;
  for (let lx = 0; lx < CHUNK; lx++)
    for (let lz = 0; lz < CHUNK; lz++) {
      const x = ox + lx,
        z = oz + lz,
        h = surface(x, z);
      for (let y = 0; y <= Math.max(h, SEA); y++) {
        let block: Block;
        if (y > h) block = Block.Water;
        else if (y === h)
          block =
            h <= SEA + 2
              ? Block.Sand
              : h > 53
                ? Block.Snow
                : h > 42
                  ? Block.Stone
                  : Block.Grass;
        else
          block =
            y > h - 4 && h <= 42
              ? h <= SEA + 2
                ? Block.Sand
                : Block.Dirt
              : Block.Stone;
        // Dry, winding hillside pockets. The low bedrock and lake basin remain sealed.
        if (
          y > SEA + 3 &&
          y < h &&
          Math.abs(Math.sin(x * 0.12) + Math.cos(z * 0.13)) < 0.24 &&
          Math.abs(y - (27 + 5 * Math.sin(z * 0.09))) < 2.3
        )
          block = Block.Air;
        data[index(lx, y, lz)] = block;
      }
    }
  // Roots are sampled outside the chunk too, so tree crowns match at chunk seams.
  for (
    let gx = Math.floor((ox - 3) / 7);
    gx <= Math.floor((ox + CHUNK + 2) / 7);
    gx++
  ) {
    for (
      let gz = Math.floor((oz - 3) / 7);
      gz <= Math.floor((oz + CHUNK + 2) / 7);
      gz++
    ) {
      if (hash(gx, gz, 17) < 0.32) continue;
      const x = gx * 7 + Math.floor(hash(gx, gz, 3) * 5),
        z = gz * 7 + Math.floor(hash(gx, gz, 5) * 5);
      const h = surface(x, z);
      if (h < SEA + 4 || h > 39 || Math.abs(surface(x + 2, z) - h) > 2)
        continue;
      const trunk = 4 + Math.floor(hash(gx, gz, 9) * 3);
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++) {
          const lx = x + dx - ox,
            lz = z + dz - oz;
          if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK) continue;
          for (let dy = 1; dy <= trunk + 2; dy++) {
            const y = h + dy;
            if (dx === 0 && dz === 0 && dy <= trunk)
              data[index(lx, y, lz)] = Block.Wood;
            else if (
              dy >= trunk - 1 &&
              Math.abs(dx) + Math.abs(dz) <= (dy === trunk + 2 ? 1 : 3) &&
              data[index(lx, y, lz)] === Block.Air
            )
              data[index(lx, y, lz)] = Block.Leaves;
          }
        }
    }
  }
  return data;
}
