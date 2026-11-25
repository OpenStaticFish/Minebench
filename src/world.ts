export const CHUNK = 16;
export const HEIGHT = 80;
export const SEA = 12;
const LAYER = CHUNK * CHUNK;

export enum Block {
  Air = 0,
  Grass,
  Dirt,
  Stone,
  Sand,
  Wood,
  Leaves,
  Water,
  Amber,
  Snow,
  Planks,
  Clay,
}

// All randomness is addressed by coordinates. No result depends on the order
// chunks are visited, or on a neighbour still being in memory.
function hash(x: number, z: number, salt: number): number {
  let h = Math.imul(x, 0x1e35a7bd) ^ Math.imul(z, 0x71b24a5d) ^ salt;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return ((h ^ (h >>> 15)) >>> 0) / 0x100000000;
}

function ease(n: number): number {
  n = Math.min(1, Math.max(0, n));
  return n * n * (3 - 2 * n);
}

function noise(x: number, z: number, salt: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const u = ease(x - ix),
    v = ease(z - iz);
  const a = hash(ix, iz, salt),
    b = hash(ix + 1, iz, salt);
  const c = hash(ix, iz + 1, salt),
    d = hash(ix + 1, iz + 1, salt);
  const lo = a + (b - a) * u,
    hi = c + (d - c) * u;
  return 2 * (lo + (hi - lo) * v) - 1;
}

function key(cx: number, cz: number): string {
  return `${cx},${cz}`;
}
function at(x: number, y: number, z: number): number {
  return y * LAYER + (z & 15) * CHUNK + (x & 15);
}

/** The drumlins, near arête and more distant needles visible from the starting bluff. */
function northernRange(x: number, z: number, detail: number, crags: number): number {
  if (z > 6 || z < -125 || Math.abs(x) > 130) return 0;
  const fade = ease((130 - Math.abs(x)) / 32);
  const first =
    10 +
    Math.max(
      0,
      16 - Math.abs(x + 36) * 0.54,
      8 - Math.abs(x - 1) * 0.7,
      19 - Math.abs(x - 43) * 0.67,
      13 - Math.abs(x + 79) * 0.66,
    ) -
    Math.abs(z + 36 - 7 * Math.sin(x / 19) - 4 * detail) * 0.9;
  const second =
    16 +
    Math.max(
      0,
      25 - Math.abs(x + 68) * 0.85,
      31 - Math.abs(x + 17) * 0.83,
      22 - Math.abs(x + 34) * 1.1,
      19 - Math.abs(x - 7) * 0.96,
      30 - Math.abs(x - 39) * 1.04,
      23 - Math.abs(x - 70) * 0.91,
    ) -
    Math.abs(z + 68 + 7 * Math.sin(x / 23) - 5 * detail) * 1.12;
  const rise = Math.max(0, first, second);
  return fade * (rise + Math.min(1, rise / 10) * (crags * 3.6 + detail * 3));
}

interface Cave {
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  length: number;
  width: number;
  arch: number;
}

// Squared section of a bent rock gallery. The low, relatively flat floor and
// higher curved roof form walk-in mouths wherever a hillside cuts the tube.
function caveSection(c: Cave, x: number, z: number): number {
  const rx = x - c.x,
    rz = z - c.z;
  const t = (rx * c.dx + rz * c.dz) / c.length;
  if (Math.abs(t) >= 1) return 0;
  const across = (rz * c.dx - rx * c.dz - 2.2 * t * t) / c.width;
  return Math.max(0, 1 - t * t - across * across);
}

const TREE_CELL = 7;
const CROWN = 3;
// Scattered foreground trees frame the central clearing without filling it.
const landmarks = [
  { x: 25, z: 16, tall: 11, amber: false },
  { x: -24, z: 8, tall: 12, amber: false },
  { x: -29, z: 11, tall: 9, amber: false },
  { x: -14, z: -12, tall: 8, amber: true },
  { x: 22, z: -22, tall: 7, amber: true },
] as const;

interface Edit {
  original: Block;
  value: Block;
}

export class World {
  readonly cached = new Map<string, Uint8Array>();
  private readonly edits = new Map<string, Map<number, Edit>>();

  constructor(readonly seed = 1847) {}

  /** Top terrain voxel before caves, trees, water and player edits. */
  height(x: number, z: number): number {
    x = Math.floor(x);
    z = Math.floor(z);
    const seed = this.seed;
    const broad = noise(x / 51, z / 51, seed + 3);
    const hills = noise(x / 23, z / 23, seed + 17);
    const detail = noise(x / 11, z / 11, seed + 163);
    const crags = noise(x / 4.9, z / 4.9, seed + 37);

    // Each wide watershed has its own channel. At the valley divides the
    // river modifier has already reached zero influence on the terrain.
    const basin = Math.floor((x + 128) / 256);
    const phase = basin === 0 ? 0 : hash(basin, 0, seed + 97) * 90;
    const bend = z + phase;
    let channel =
      basin * 256 -
      6 +
      16 * Math.cos((bend + 9) / 14.5) +
      9 * Math.sin(bend / 38) +
      10 * noise(basin, z / 93, seed + 73);
    // The river slips west through a pass behind the first line of hills.
    if (basin === 0) channel -= 58 * ease((-z - 31) / 37) * ease((z + 190) / 55);
    const shore = Math.abs(x - channel) - (9.6 + 2.2 * Math.sin(bend / 21) + detail * 1.25);
    if (shore < 0) return Math.floor(SEA - 0.05 + Math.max(-5, shore * 0.53));

    const bluff =
      6.5 * Math.max(0, 1 - ((x - 14) / 25) ** 2 - ((z - 36) / 23) ** 2) +
      17 * Math.max(0, 1 - ((x - 14) / 13) ** 2 - ((z - 40) / 12) ** 2);
    const wild = ease(Math.max(Math.abs(x) - 68, Math.abs(z + 22) - 67) / 55);
    const highland =
      wild * (12 + 22 * broad) * Math.max(0, noise(x / 79, z / 79, seed + 56) + 0.42);
    const upland =
      7 +
      broad * 4.5 +
      hills * 3.9 +
      detail * 1.5 +
      crags * 0.65 +
      bluff +
      Math.max(0, highland) +
      northernRange(x, z, detail, crags);
    const top = SEA + Math.min(3.6, shore * 0.4) + ease(shore / 24) * upland;
    return Math.min(HEIGHT - 3, Math.floor(top));
  }

  get(x: number, y: number, z: number): Block {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= HEIGHT) return Block.Air;
    return this.chunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK))[at(x, y, z)]!;
  }

  set(x: number, y: number, z: number, id: Block): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= HEIGHT || !Number.isInteger(id) || id < Block.Air || id > Block.Clay)
      return false;
    const cx = Math.floor(x / CHUNK),
      cz = Math.floor(z / CHUNK);
    const data = this.chunk(cx, cz),
      i = at(x, y, z);
    const old = data[i]!;
    if (old === id) return false;
    data[i] = id;
    const k = key(cx, cz);
    let changes = this.edits.get(k);
    if (!changes) this.edits.set(k, (changes = new Map()));
    const original = changes.get(i)?.original ?? old;
    if (original === id) {
      changes.delete(i);
      if (!changes.size) this.edits.delete(k);
    } else changes.set(i, { original, value: id });
    return true;
  }

  chunk(cx: number, cz: number): Uint8Array {
    const k = key(cx, cz);
    let data = this.cached.get(k);
    if (!data) {
      data = this.generate(cx * CHUNK, cz * CHUNK);
      this.edits.get(k)?.forEach(({ value }, i) => {
        data![i] = value;
      });
      this.cached.set(k, data);
    }
    return data;
  }

  unload(cx: number, cz: number): void {
    this.cached.delete(key(cx, cz));
  }

  prune(cx: number, cz: number, radius: number): void {
    for (const k of this.cached.keys()) {
      const comma = k.indexOf(',');
      if (
        Math.abs(Number(k.slice(0, comma)) - cx) > radius ||
        Math.abs(Number(k.slice(comma + 1)) - cz) > radius
      )
        this.cached.delete(k);
    }
  }

  private caves(x0: number, z0: number): Cave[] {
    const caves: Cave[] = [];
    // Include roots of trees just beyond the chunk when testing the roof.
    const reach = 24;
    for (let gz = Math.floor((z0 - reach) / 40); gz <= Math.floor((z0 + 15 + reach) / 40); gz++) {
      for (let gx = Math.floor((x0 - reach) / 40); gx <= Math.floor((x0 + 15 + reach) / 40); gx++) {
        if (hash(gx, gz, this.seed + 1) > 0.72) continue;
        const x = gx * 40 + 5 + Math.floor(30 * hash(gx, gz, this.seed + 12));
        const z = gz * 40 + 5 + Math.floor(30 * hash(gx, gz, this.seed + 29));
        if (x < x0 - reach || x > x0 + 15 + reach || z < z0 - reach || z > z0 + 15 + reach)
          continue;
        if ((x - 14) ** 2 + (z - 36) ** 2 < 24 ** 2) continue;
        const y = this.height(x, z) - 5 - Math.floor(hash(gx, gz, this.seed + 84) * 4);
        if (y < SEA + 2) continue;
        const angle = hash(gx, gz, this.seed + 33) * Math.PI;
        caves.push({
          x,
          y,
          z,
          dx: Math.cos(angle),
          dz: Math.sin(angle),
          length: 10 + 8 * hash(gx, gz, this.seed + 51),
          width: 3.4,
          arch: 3.6,
        });
      }
    }
    if (x0 <= 52 && x0 + 15 >= 8 && z0 <= -8 && z0 + 15 >= -30) {
      caves.push({ x: 30, y: 16, z: -19, dx: 1, dz: 0, length: 14, width: 3.6, arch: 4.2 });
    }
    return caves;
  }

  private generate(x0: number, z0: number): Uint8Array {
    const data = new Uint8Array(HEIGHT * LAYER);
    const caves = this.caves(x0, z0);
    for (let lz = 0; lz < CHUNK; lz++)
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx,
          z = z0 + lz,
          h = this.height(x, z);
        const i = lz * CHUNK + lx;
        const exposure = noise(x / 8, z / 8, this.seed + 133);
        const surface =
          h <= SEA + 1.6 + exposure
            ? Block.Sand
            : h >= 51 + exposure * 5
              ? Block.Snow
              : h >= 38 + exposure * 6
                ? Block.Stone
                : Block.Grass;
        const soil =
          surface === Block.Sand ? Block.Sand : surface === Block.Grass ? Block.Dirt : Block.Stone;
        const soilBottom = h - (2 + Math.floor(hash(x, z, this.seed + 113) * 2));
        for (let y = 0; y <= h; y++)
          data[y * LAYER + i] = y === h ? surface : y > soilBottom ? soil : Block.Stone;
        for (let y = h + 1; y <= SEA; y++) data[y * LAYER + i] = Block.Water;
        for (const cave of caves) {
          const section = caveSection(cave, x, z);
          if (section <= 0) continue;
          const r = Math.sqrt(section);
          const floor = Math.max(SEA + 1, Math.ceil(cave.y - 1.55 * r));
          const roof = Math.min(h, Math.floor(cave.y + cave.arch * r));
          for (let y = floor; y <= roof; y++) data[y * LAYER + i] = Block.Air;
        }
      }
    this.trees(data, x0, z0, caves);
    this.rangerHut(data, x0, z0);
    return data;
  }

  /** A small editable trail shelter on the eastern bank. Foundation fits local relief. */
  private rangerHut(data: Uint8Array, x0: number, z0: number) {
    const zOffset = -9;
    if (x0 > 34 || x0 + 15 < 21 || z0 > 9 + zOffset || z0 + 15 < -7 + zOffset) return;
    const floor = this.height(28, -1 + zOffset) + 1;
    const put = (x: number, y: number, z: number, id: Block) => {
      z += zOffset;
      if (x >= x0 && x < x0 + 16 && z >= z0 && z < z0 + 16 && y > 0 && y < HEIGHT)
        data[at(x, y, z)] = id;
    };
    for (let z = -6; z <= 4; z++)
      for (let x = 24; x <= 32; x++) {
        for (let y = floor + 1; y <= floor + 10; y++) put(x, y, z, Block.Air);
        if (x < 25 || x > 31 || z === -6) continue;
        put(x, floor, z, Block.Planks);
        if ((x === 25 || x === 31) && (z === -5 || z === 1 || z === 4)) {
          for (let y = Math.min(floor - 1, this.height(x, z + zOffset)); y < floor; y++)
            put(x, y, z, Block.Stone);
          for (let y = 1; y <= 4; y++) put(x, floor + y, z, Block.Wood);
        } else if (z < 2 && (x === 25 || x === 31 || z === -5 || z === 1)) {
          for (let y = 1; y <= 4; y++) {
            if (z === 1 && (x === 28 || x === 29) && y < 4) continue;
            if (x === 25 && z >= -3 && z <= -2 && y > 1 && y < 4) continue;
            put(x, floor + y, z, Block.Planks);
          }
        }
      }
    for (let x = 24; x <= 32; x++) {
      const rise = 4 - Math.abs(x - 28);
      for (let z = -6; z <= 4; z++) put(x, floor + 4 + rise, z, Block.Clay);
      if (rise > 1)
        for (let j = 4; j < 4 + rise; j++)
          for (const z of [-5, 1]) put(x, floor + j, z, Block.Planks);
    }
    for (let y = floor + 4; y <= floor + 9; y++) put(30, y, -3, Block.Stone);
    for (let k = 0; k < 5; k++)
      for (let x = 27; x <= 29; x++) {
        const ground = this.height(x, 5 + k + zOffset);
        if (floor - k - 1 > ground)
          for (let y = ground + 1; y <= floor - k - 1; y++) put(x, y, 5 + k, Block.Planks);
      }
  }

  private trees(data: Uint8Array, x0: number, z0: number, caves: Cave[]): void {
    // Sample a crown-width beyond all four edges. Each chunk writes only its
    // own slice of a tree, even when the trunk belongs to an unloaded neighbour.
    const plant = (x: number, z: number, tall: number, amber: boolean) => {
      if (x < x0 - CROWN || x > x0 + 15 + CROWN || z < z0 - CROWN || z > z0 + 15 + CROWN) return;
      const h = this.height(x, z);
      if (h < SEA + 3 || h >= 38 + 4 * noise(x / 13, z / 13, this.seed + 139)) return;
      if (
        caves.some((c) => {
          const r = Math.sqrt(caveSection(c, x, z));
          return r > 0 && h >= c.y - 1.55 * r && h <= c.y + c.arch * r;
        })
      )
        return;
      const write = (tx: number, y: number, tz: number, b: Block) => {
        if (tx < x0 || tz < z0 || tx >= x0 + CHUNK || tz >= z0 + CHUNK) return;
        const i = at(tx, y, tz);
        if (
          data[i] === Block.Air ||
          (b === Block.Wood && (data[i] === Block.Amber || data[i] === Block.Leaves))
        )
          data[i] = b;
      };
      const trunk = amber ? tall - 2 : tall - 1;
      for (let t = 1; t <= trunk; t++) write(x, h + t, z, Block.Wood);
      if (amber) {
        const handed = hash(x, z, this.seed + 4) < 0.5 ? -1 : 1;
        for (let t = -4; t <= 1; t++) {
          const r = t === -4 || t === 1 ? 1.35 : t === -3 || t === 0 ? 2.35 : 3.05;
          const offset = t > -2 ? handed * 0.8 : 0;
          for (let dz = -CROWN; dz <= CROWN; dz++)
            for (let dx = -CROWN; dx <= CROWN; dx++) {
              if (
                (dx - offset) ** 2 + (dz + offset * 0.6) ** 2 <=
                r * r + hash(x + dx, z + dz, this.seed + t) * 1.8
              ) {
                write(x + dx, h + tall + t, z + dz, Block.Amber);
              }
            }
        }
      } else {
        const first = Math.max(3, Math.floor(tall * 0.3));
        for (let t = first; t <= tall; t++) {
          const taper = (tall - t) / (tall - first);
          const r =
            t === tall
              ? 0
              : Math.min(
                  CROWN,
                  Math.max(1, Math.round(0.35 + taper * 3.3 - ((t - first) % 3) * 0.43)),
                );
          for (let dz = -r; dz <= r; dz++)
            for (let dx = -r; dx <= r; dx++) {
              if (Math.abs(dx) + Math.abs(dz) <= r + (r >= 2 ? 1 : 0)) {
                write(x + dx, h + t, z + dz, Block.Leaves);
              }
            }
        }
      }
    };
    for (
      let gz = Math.floor((z0 - CROWN) / TREE_CELL);
      gz <= Math.floor((z0 + 15 + CROWN) / TREE_CELL);
      gz++
    ) {
      for (
        let gx = Math.floor((x0 - CROWN) / TREE_CELL);
        gx <= Math.floor((x0 + 15 + CROWN) / TREE_CELL);
        gx++
      ) {
        const x = gx * TREE_CELL + Math.floor(hash(gx, gz, this.seed + 55) * TREE_CELL);
        const z = gz * TREE_CELL + Math.floor(hash(gx, gz, this.seed + 32) * TREE_CELL);
        // Leave an open slope along the first sightline and room for specimen trees.
        if (
          ((x - 12) / 16) ** 2 + ((z - 31) / 19) ** 2 < 1 ||
          landmarks.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < 38)
        )
          continue;
        const forest = noise(x / 30, z / 30, this.seed + 177);
        const grove = Math.max(
          0,
          1 - ((x + 30) / 24) ** 2 - ((z + 3) / 24) ** 2,
          1 - ((x - 34) / 20) ** 2 - ((z + 3) / 23) ** 2,
        );
        if (hash(gx, gz, this.seed + 621) > 0.28 + 0.48 * forest + 0.49 * grove) continue;
        const amber = hash(gx, gz, this.seed + 531) < (forest > 0.2 ? 0.075 : 0.15);
        const tall = (amber ? 6 : 8) + Math.floor(hash(gx, gz, this.seed + 451) * (amber ? 3 : 6));
        plant(x, z, tall, amber);
      }
    }
    for (const tree of landmarks) plant(tree.x, tree.z, tree.tall, tree.amber);
  }
}
