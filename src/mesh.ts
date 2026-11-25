import { BufferGeometry, Float32BufferAttribute } from 'three';
import { Block, CHUNK as S, HEIGHT as H, World } from './world';
import { GRID, TILE, tileFor } from './atlas';

type V = readonly [number, number, number];
type Quad = readonly [V, V, V, V];
const sides: { n: V; q: Quad; light: number }[] = [
  {
    n: [0, 1, 0],
    q: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    light: 1.06,
  },
  {
    n: [0, 0, 1],
    q: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    light: 0.69,
  },
  {
    n: [1, 0, 0],
    q: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    light: 0.85,
  },
  {
    n: [0, 0, -1],
    q: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    light: 0.74,
  },
  {
    n: [-1, 0, 0],
    q: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    light: 0.48,
  },
  {
    n: [0, -1, 0],
    q: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    light: 0.48,
  },
];
const uvCorners = [
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
] as const;
function hash(x: number, z: number) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Indexed exposed faces. A one-block neighbor halo keeps seams, including AO, consistent. */
export function meshChunk(world: Pick<World, 'chunk'>, cx: number, cz: number) {
  const neighbors = Array.from({ length: 9 }, (_, i) =>
    world.chunk(cx + (i % 3) - 1, cz + Math.floor(i / 3) - 1),
  );
  const data = neighbors[4]!;
  const get = (x: number, y: number, z: number): Block => {
    if (y < 0) return Block.Stone;
    if (y >= H) return Block.Air;
    return neighbors[((z >> 4) + 1) * 3 + (x >> 4) + 1]![(y * S + (z & 15)) * S + (x & 15)]!;
  };
  const solid = (x: number, y: number, z: number) => {
    const id = get(x, y, z);
    return +(id !== Block.Air && id !== Block.Water);
  };
  const positions: number[] = [],
    colors: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const px = cx * S,
    pz = cz * S;
  // Near-field directional tree shadows are baked into the ground, not extra draw calls.
  const span = S + 9,
    heights = new Int16Array(span * span);
  for (let z = -7; z < S + 2; z++)
    for (let x = -1; x < S + 8; x++) {
      let y = H - 1;
      for (; y > 0; y--) {
        const id = get(x, y, z);
        if (id !== Block.Air && id !== Block.Water) break;
      }
      heights[(z + 7) * span + x + 1] = y;
    }
  const quad = (
    x: number,
    y: number,
    z: number,
    q: Quad,
    tile: number,
    shade: number,
    r: number,
    g: number,
    b: number,
    ao?: number[],
    water = false,
  ) => {
    const base = positions.length / 3;
    for (let i = 0; i < 4; i++) {
      const v = q[i]!,
        u = uvCorners[i]!,
        lum = shade * (ao?.[i] ?? 1);
      positions.push(x + v[0], y + v[1] - (water && v[1] === 1 ? 0.13 : 0), z + v[2]);
      colors.push(r * lum, g * lum, b * lum);
      uv.push(
        ((tile % GRID) * 24 + 4 + u[0] * 16) / (GRID * 24),
        1 - (Math.floor(tile / GRID) * 24 + 4 + u[1] * 16) / (GRID * 24),
      );
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const ao: number[] = [];
  for (let z = 0; z < S; z++)
    for (let x = 0; x < S; x++) {
      const X = x + px,
        Z = z + pz,
        index = (z + 7) * span + x + 1,
        top = heights[index]!;
      const h = hash(X, Z),
        biome =
          Math.sin(X * 0.13 + Math.sin(Z * 0.09)) * 0.03 + Math.cos(Z * 0.13 - X * 0.05) * 0.034;
      let blocker = 0;
      for (let d = 1; d <= 6; d++)
        blocker = Math.max(blocker, heights[index + d - d * span]! - d * 0.83);
      for (let y = 0; y < H; y++) {
        const id = data[(y * S + z) * S + x]!;
        if (id === Block.Air) continue;
        const water = id === Block.Water;
        for (let f = 0; f < 6; f++) {
          const { n, q, light } = sides[f]!,
            nx = x + n[0],
            ny = y + n[1],
            nz = z + n[2];
          const adj = get(nx, ny, nz);
          if (adj !== Block.Air && (adj !== Block.Water || water)) continue;
          const grass = id === Block.Grass,
            leaves = id === Block.Leaves || id === Block.Amber;
          const lum =
            light *
            (1 + (h - 0.5) * (water ? 0.025 : leaves ? 0.17 : 0.065)) *
            (1 + (grass || leaves ? biome : 0));
          const shade =
            Math.min(1, Math.max(0, (blocker - y + 0.15) * 0.64)) * (water ? 0.16 : 0.5);
          let r = 1 - shade,
            g = 1 - shade * 0.88,
            b = 1 - shade * 0.54;
          if (id === Block.Leaves) {
            const warmth = 0.8 + 0.13 * Math.sin((X + Z) * 0.083);
            r *= warmth;
            g *= 0.92;
            b *= 0.83;
          }
          if (grass && f === 0) {
            r *= 1 + biome * 1.9;
            b *= 0.92;
          }
          if (water) {
            const shallows = Math.max(0, 1 - (y - top) * 0.22);
            r *= 0.69 + shallows * 0.47;
            g *= 0.83 + shallows * 0.18;
            b *= 0.96 - shallows * 0.15;
          }
          ao.length = 0;
          if (!water && f !== 5)
            for (const v of q) {
              const dx = n[0] ? 0 : v[0] === 0 ? -1 : 1,
                dy = n[1] ? 0 : v[1] === 0 ? -1 : 1,
                dz = n[2] ? 0 : v[2] === 0 ? -1 : 1;
              const s1 = dx ? solid(nx + dx, ny, nz) : solid(nx, ny + dy, nz),
                s2 = dz ? solid(nx, ny, nz + dz) : solid(nx, ny + dy, nz);
              const corner = solid(nx + dx, ny + dy, nz + dz);
              ao.push(1 - (s1 && s2 ? 3 : s1 + s2 + corner) * 0.096);
            }
          quad(
            x,
            y,
            z,
            q,
            tileFor(id, f),
            lum,
            r,
            g,
            b,
            ao,
            water && get(x, y + 1, z) === Block.Air,
          );
        }
        if (id === Block.Grass && y === top && h > 0.855 && get(x, y + 1, z) === Block.Air) {
          // Small upright crossed blades and wildflower spikes are decoration, not blocks.
          for (let k = 0; k < 3; k++) {
            const t = hash(X + 33 * k, Z - 19 * k),
              a = 0.16 + t * 0.61,
              b = 0.2 + hash(Z + k, X) * 0.59,
              ht = 0.21 + t * 0.28;
            const petal = h > 0.969 && k === 1;
            quad(
              x,
              y + 1,
              z,
              [
                [a, 0, b],
                [a + 0.098, 0, b + 0.04],
                [a + 0.13, ht, b + 0.06],
                [a + 0.054, ht, b + 0.02],
              ],
              TILE.solid,
              1,
              0.33,
              0.43,
              0.103,
            );
            if (petal)
              quad(
                x,
                y + 1,
                z,
                [
                  [a - 0.045, ht - 0.09, b + 0.04],
                  [a + 0.19, ht - 0.09, b + 0.04],
                  [a + 0.19, ht + 0.08, b + 0.04],
                  [a - 0.045, ht + 0.08, b + 0.04],
                ],
                TILE.solid,
                1,
                1,
                0.58,
                0.13,
              );
          }
        }
      }
    }
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geom.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geom.setIndex(indices);
  geom.computeBoundingSphere();
  return geom;
}
