import * as THREE from 'three';
import { Block, palette, solid } from './blocks';
import { CHUNK, HEIGHT, blockIndex, generateChunk, hash } from './terrain';

interface ChunkData { cx: number; cz: number; data: Uint8Array; mesh?: THREE.Group }
const faces = [
  { n: [1, 0, 0], v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], shade: 0.83 },
  { n: [-1, 0, 0], v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], shade: 0.7 },
  { n: [0, 1, 0], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], shade: 1.1 },
  { n: [0, -1, 0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], shade: 0.55 },
  { n: [0, 0, 1], v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], shade: 0.9 },
  { n: [0, 0, -1], v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], shade: 0.76 },
] as const;
export class World {
  readonly group = new THREE.Group();
  private chunks = new Map<string, ChunkData>();
  private edits = new Map<string, Map<number, Block>>();
  private queue: ChunkData[] = [];
  private center = '';
  private terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  private waterMaterial = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.88, shininess: 90, depthWrite: false });
  radius = 3;
  get count(): number { return this.group.children.length; }
  get editedBlocks(): number { return [...this.edits.values()].reduce((sum, entries) => sum + entries.size, 0); }
  private key(cx: number, cz: number): string { return `${cx},${cz}`; }
  private ensure(cx: number, cz: number): ChunkData {
    const key = this.key(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = { cx, cz, data: generateChunk(cx, cz) };
      this.edits.get(key)?.forEach((b, i) => { chunk!.data[i] = b; });
      this.chunks.set(key, chunk);
    }
    return chunk;
  }
  get(x: number, y: number, z: number): Block {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0) return Block.Stone;
    if (y >= HEIGHT) return Block.Air;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    return this.ensure(cx, cz).data[blockIndex(x - cx * CHUNK, y, z - cz * CHUNK)] as Block;
  }
  set(x: number, y: number, z: number, b: Block): boolean {
    if (y < 1 || y >= HEIGHT) return false;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), key = this.key(cx, cz);
    const i = blockIndex(x - cx * CHUNK, y, z - cz * CHUNK);
    this.ensure(cx, cz).data[i] = b;
    if (!this.edits.has(key)) this.edits.set(key, new Map());
    this.edits.get(key)!.set(i, b);
    for (const [dx, dz] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]) {
      const c = this.chunks.get(this.key(cx + dx!, cz + dz!));
      if (c?.mesh) this.build(c);
    }
    return true;
  }
  update(x: number, z: number, force = false): void {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), center = `${cx},${cz},${this.radius}`;
    if (center !== this.center || force) {
      this.center = center;
      this.queue = [];
      for (const [key, chunk] of this.chunks) {
        if (Math.abs(chunk.cx - cx) > this.radius + 1 || Math.abs(chunk.cz - cz) > this.radius + 1) {
          this.disposeMesh(chunk); this.chunks.delete(key);
        } else if (Math.abs(chunk.cx - cx) > this.radius || Math.abs(chunk.cz - cz) > this.radius) this.disposeMesh(chunk);
      }
      for (let dz = -this.radius; dz <= this.radius; dz++) for (let dx = -this.radius; dx <= this.radius; dx++) {
        const c = this.ensure(cx + dx, cz + dz);
        if (!c.mesh) this.queue.push(c);
      }
      this.queue.sort((a, b) => (a.cx-cx)**2+(a.cz-cz)**2-((b.cx-cx)**2+(b.cz-cz)**2));
    }
    // Bound meshing work per frame rather than stalling the input loop.
    const start = performance.now();
    while (this.queue.length && performance.now() - start < 8) this.build(this.queue.shift()!);
  }
  warmup(x: number, z: number): void {
    this.update(x, z);
    while (this.queue.length) this.build(this.queue.shift()!);
  }
  private disposeMesh(c: ChunkData): void {
    if (!c.mesh) return;
    for (const child of c.mesh.children) (child as THREE.Mesh).geometry.dispose();
    this.group.remove(c.mesh); c.mesh = undefined;
  }
  private build(c: ChunkData): void {
    this.disposeMesh(c);
    const buffers = [0, 1].map(() => ({ p: [] as number[], n: [] as number[], col: [] as number[], idx: [] as number[] }));
    for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const b = c.data[blockIndex(x, y, z)] as Block;
      if (b === Block.Air) continue;
      const wx = c.cx * CHUNK + x, wz = c.cz * CHUNK + z;
      for (const face of faces) {
        const [nx, ny, nz] = face.n;
        const neighbor = this.get(wx + nx, y + ny, wz + nz);
        if (b === Block.Water ? neighbor !== Block.Air : solid(neighbor)) continue;
        const buf = buffers[b === Block.Water ? 1 : 0]!;
        const base = buf.p.length / 3;
        let color = palette[b]!;
        if (b === Block.Grass && ny === 0) color = [0.45, 0.35, 0.22];
        const variance = 0.91 + hash(wx + y * 17, wz) * 0.17;
        for (const vertex of face.v) {
          buf.p.push(wx + vertex[0], y + vertex[1] - (b === Block.Water && ny === 1 ? 0.13 : 0), wz + vertex[2]);
          buf.n.push(nx, ny, nz);
          buf.col.push(...color.map(v => v * face.shade * variance));
        }
        buf.idx.push(base, base+1, base+2, base, base+2, base+3);
      }
    }
    const group = new THREE.Group();
    buffers.forEach((buf, i) => {
      if (!buf.p.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
      geo.setIndex(buf.idx); geo.computeBoundingSphere();
      group.add(new THREE.Mesh(geo, i ? this.waterMaterial : this.terrainMaterial));
    });
    c.mesh = group; this.group.add(group);
  }
  /** Grid DDA: exact voxel selection independent of render mesh timing. */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, reach = 7): { block: THREE.Vector3; normal: THREE.Vector3; type: Block } | null {
    const cell = origin.clone().floor();
    const step = new THREE.Vector3(Math.sign(direction.x), Math.sign(direction.y), Math.sign(direction.z));
    const delta = new THREE.Vector3(Math.abs(1/direction.x), Math.abs(1/direction.y), Math.abs(1/direction.z));
    const max = new THREE.Vector3();
    for (const axis of ['x','y','z'] as const) max[axis] = direction[axis] === 0 ? Infinity : ((step[axis] > 0 ? cell[axis]+1 : cell[axis])-origin[axis])/direction[axis];
    let distance = 0;
    const normal = new THREE.Vector3();
    while (distance <= reach) {
      const b = this.get(cell.x, cell.y, cell.z);
      if (solid(b)) return { block: cell.clone(), normal: normal.clone(), type: b };
      const axis = max.x < max.y && max.x < max.z ? 'x' : max.y < max.z ? 'y' : 'z';
      distance = max[axis]; cell[axis] += step[axis]; max[axis] += delta[axis];
      normal.set(0,0,0); normal[axis] = -step[axis];
    }
    return null;
  }
}
