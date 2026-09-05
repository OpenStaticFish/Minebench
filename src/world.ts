import * as THREE from "three";
import {
  Block,
  CHUNK,
  DEFAULT_VIEW_DISTANCE,
  HEIGHT,
  chunkKey,
  generateChunk,
  hash,
  index,
  solid,
} from "./terrain";
import { makeMaterials, tileFor } from "./materials";

const faces = [
  {
    n: [1, 0, 0],
    v: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    shade: 0.83,
  },
  {
    n: [-1, 0, 0],
    v: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    shade: 0.72,
  },
  {
    n: [0, 1, 0],
    v: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    shade: 1,
  },
  {
    n: [0, -1, 0],
    v: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    shade: 0.55,
  },
  {
    n: [0, 0, 1],
    v: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    shade: 0.9,
  },
  {
    n: [0, 0, -1],
    v: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    shade: 0.77,
  },
] as const;
type Buffers = {
  positions: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
};
const buffers = (): Buffers => ({
  positions: [],
  normals: [],
  colors: [],
  uvs: [],
  indices: [],
});

export class World {
  readonly group = new THREE.Group();
  readonly meshes = new Map<string, THREE.Group>();
  readonly data = new Map<string, Uint8Array>();
  readonly edits = new Map<string, Map<number, Block>>();
  readonly materials = makeMaterials();
  private queue: [number, number][] = [];
  private center = "";
  radius = DEFAULT_VIEW_DISTANCE;

  chunk(cx: number, cz: number): Uint8Array {
    const key = chunkKey(cx, cz);
    let data = this.data.get(key);
    if (!data) {
      data = generateChunk(cx, cz);
      this.edits.get(key)?.forEach((block, i) => {
        data![i] = block;
      });
      this.data.set(key, data);
    }
    return data;
  }
  get(x: number, y: number, z: number): Block {
    if (y < 0) return Block.Stone;
    if (y >= HEIGHT) return Block.Air;
    const cx = Math.floor(x / CHUNK),
      cz = Math.floor(z / CHUNK);
    return this.chunk(cx, cz)[index(x - cx * CHUNK, y, z - cz * CHUNK)]!;
  }
  set(x: number, y: number, z: number, block: Block): boolean {
    if (y <= 0 || y >= HEIGHT) return false;
    const cx = Math.floor(x / CHUNK),
      cz = Math.floor(z / CHUNK),
      key = chunkKey(cx, cz);
    const lx = x - cx * CHUNK,
      lz = z - cz * CHUNK,
      i = index(lx, y, lz);
    this.chunk(cx, cz)[i] = block;
    if (!this.edits.has(key)) this.edits.set(key, new Map());
    this.edits.get(key)!.set(i, block);
    this.rebuild(cx, cz);
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      if (
        (dx === -1 && lx === 0) ||
        (dx === 1 && lx === 15) ||
        (dz === -1 && lz === 0) ||
        (dz === 1 && lz === 15)
      ) {
        if (this.meshes.has(chunkKey(cx + dx, cz + dz)))
          this.rebuild(cx + dx, cz + dz);
      }
    }
    return true;
  }
  private remove(key: string) {
    const old = this.meshes.get(key);
    if (!old) return;
    old.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.group.remove(old);
    this.meshes.delete(key);
  }
  rebuild(cx: number, cz: number) {
    const key = chunkKey(cx, cz),
      data = this.chunk(cx, cz);
    const land = buffers(),
      water = buffers();
    for (let x = 0; x < CHUNK; x++)
      for (let z = 0; z < CHUNK; z++)
        for (let y = 0; y < HEIGHT; y++) {
          const block = data[index(x, y, z)]! as Block;
          if (block === Block.Air) continue;
          const wx = cx * CHUNK + x,
            wz = cz * CHUNK + z;
          for (const face of faces) {
            const [nx, ny, nz] = face.n;
            const ax = x + nx,
              ay = y + ny,
              az = z + nz;
            // Most neighbors are local; avoid map lookups for every interior face.
            const next =
              ax >= 0 &&
              ax < CHUNK &&
              az >= 0 &&
              az < CHUNK &&
              ay >= 0 &&
              ay < HEIGHT
                ? data[index(ax, ay, az)]!
                : this.get(wx + nx, ay, wz + nz);
            if (
              solid(next) ||
              (block === Block.Water && (next === Block.Water || ny !== 1))
            )
              continue;
            const b = block === Block.Water ? water : land;
            const start = b.positions.length / 3,
              tile = tileFor(block, ny);
            const variation = 0.93 + hash(wx, wz, y) * 0.1;
            face.v.forEach(([vx, vy, vz], i) => {
              b.positions.push(
                x + vx,
                y + vy - (block === Block.Water ? 0.13 : 0),
                z + vz,
              );
              b.normals.push(nx, ny, nz);
              const shade =
                face.shade * variation * (ny === 0 && vy === 0 ? 0.89 : 1);
              b.colors.push(shade, shade, shade);
              b.uvs.push(
                (tile + (i === 1 || i === 2 ? 0.998 : 0.002)) / 10,
                i >= 2 ? 0.998 : 0.002,
              );
            });
            b.indices.push(
              start,
              start + 1,
              start + 2,
              start,
              start + 2,
              start + 3,
            );
          }
        }
    this.remove(key);
    const group = new THREE.Group();
    group.position.set(cx * CHUNK, 0, cz * CHUNK);
    for (const [b, material] of [
      [land, this.materials.land],
      [water, this.materials.water],
    ] as const) {
      if (!b.positions.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(b.positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(b.normals, 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(b.colors, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(b.uvs, 2));
      geometry.setIndex(b.indices);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.water = material === this.materials.water;
      group.add(mesh);
    }
    this.meshes.set(key, group);
    this.group.add(group);
    // Edits may be raycast again before the renderer's next matrix update.
    group.updateMatrixWorld(true);
  }
  stream(x: number, z: number, radius = this.radius) {
    const cx = Math.floor(x / CHUNK),
      cz = Math.floor(z / CHUNK),
      center = `${cx},${cz},${radius}`;
    if (center === this.center) return;
    this.center = center;
    this.radius = radius;
    this.queue = [];
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > (radius + 0.5) ** 2) continue;
        if (!this.meshes.has(chunkKey(cx + dx, cz + dz)))
          this.queue.push([cx + dx, cz + dz]);
      }
    this.queue.sort(
      (a, b) =>
        (a[0] - cx) ** 2 +
        (a[1] - cz) ** 2 -
        (b[0] - cx) ** 2 -
        (b[1] - cz) ** 2,
    );
    for (const key of this.meshes.keys()) {
      const [mx, mz] = key.split(",").map(Number) as [number, number];
      if ((mx - cx) ** 2 + (mz - cz) ** 2 > (radius + 1) ** 2) this.remove(key);
    }
    for (const key of this.data.keys()) {
      const [mx, mz] = key.split(",").map(Number) as [number, number];
      if (Math.abs(mx - cx) > radius + 2 || Math.abs(mz - cz) > radius + 2)
        this.data.delete(key);
    }
  }
  tick() {
    const start = performance.now();
    do {
      const next = this.queue.shift();
      if (!next) break;
      this.rebuild(...next);
    } while (performance.now() - start < 7);
  }
  get ready() {
    return this.queue.length === 0;
  }
}
