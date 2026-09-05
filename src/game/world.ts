import * as THREE from "three";
import { Chunk } from "./chunk";
import { WorldGen } from "./worldgen";
import { buildChunkMeshes } from "./mesher";
import { buildAtlas } from "./textures";
import { Block, isSolid } from "./blocks";
import { CHUNK_W, CHUNK_H, SEA_LEVEL } from "./constants";

const CHUNK_KEY = (cx: number, cz: number): string => `${cx},${cz}`;

/** Chunked voxel world: generation, streaming, edits, mesh lifecycle. */
export class World {
  readonly group = new THREE.Group();
  readonly gen = new WorldGen();
  private chunks = new Map<string, Chunk>();
  private solidMaterial: THREE.MeshLambertMaterial;
  private waterMaterial: THREE.MeshLambertMaterial;
  private centerCx = Number.NaN;
  private centerCz = Number.NaN;
  private genQueue: Chunk[] = [];
  private meshQueue: Chunk[] = [];
  viewDistance = 5;

  constructor(scene: THREE.Scene) {
    const atlas = buildAtlas();
    this.solidMaterial = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: atlas,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    scene.add(this.group);
  }

  /** Global block lookup. Missing/unloaded chunks read as air. */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_H) return Block.Air;
    const cx = x >> 4;
    const cz = z >> 4;
    const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
    if (!chunk || chunk.state === "empty") return Block.Air;
    return chunk.get(x - cx * CHUNK_W, y, z - cz * CHUNK_W);
  }

  /**
   * Edits a block and marks affected chunks for remeshing.
   * Returns false if the target is outside the world or in an ungenerated chunk.
   */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= CHUNK_H) return false;
    const cx = x >> 4;
    const cz = z >> 4;
    const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
    if (!chunk || chunk.state === "empty") return false;

    const lx = x - cx * CHUNK_W;
    const lz = z - cz * CHUNK_W;
    chunk.set(lx, y, z - cz * CHUNK_W, id);
    this.markDirty(chunk);

    // Border edits also dirty the adjacent chunk so shared faces update.
    if (lx === 0) this.markDirtyAt(cx - 1, cz);
    if (lx === CHUNK_W - 1) this.markDirtyAt(cx + 1, cz);
    if (lz === 0) this.markDirtyAt(cx, cz - 1);
    if (lz === CHUNK_W - 1) this.markDirtyAt(cx, cz + 1);
    return true;
  }

  private markDirtyAt(cx: number, cz: number): void {
    const c = this.chunks.get(CHUNK_KEY(cx, cz));
    if (c) this.markDirty(c);
  }

  private markDirty(chunk: Chunk): void {
    if (chunk.state === "meshed" && !chunk.dirty) {
      chunk.dirty = true;
      this.meshQueue.unshift(chunk);
    }
  }

  /** Terrain height at a column (direct worldgen query, ignores edits/caves). */
  surfaceHeight(wx: number, wz: number): number {
    return Math.max(this.gen.column(wx, wz).height, SEA_LEVEL - 1) + 1;
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  /** All generated, meshed chunks within `radius` of the player are present. */
  isAreaReady(wx: number, wz: number, radius: number): boolean {
    const ccx = Math.floor(wx / CHUNK_W);
    const ccz = Math.floor(wz / CHUNK_W);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const c = this.chunks.get(CHUNK_KEY(ccx + dx, ccz + dz));
        if (!c || c.state !== "meshed") return false;
      }
    }
    return true;
  }

  /** Streams chunks around the player with per-frame budgets to avoid hitches. */
  update(wx: number, wz: number): void {
    const ccx = Math.floor(wx / CHUNK_W);
    const ccz = Math.floor(wz / CHUNK_W);
    if (ccx !== this.centerCx || ccz !== this.centerCz) {
      this.centerCx = ccx;
      this.centerCz = ccz;
      this.refreshQueues();
    }

    let genBudget = 4;
    while (genBudget > 0 && this.genQueue.length > 0) {
      const c = this.genQueue.shift()!;
      if (c.state === "empty") {
        this.gen.generate(c);
        this.enqueueNeighborsForMesh(c);
      }
      genBudget--;
    }

    let meshBudget = 2;
    while (meshBudget > 0 && this.meshQueue.length > 0) {
      const c = this.meshQueue.shift()!;
      if (c.state !== "generated") {
        if (c.state === "meshed" && c.dirty) c.dirty = false;
        continue;
      }
      this.mesh(c);
      meshBudget--;
    }

    this.unloadFar();
  }

  private enqueueNeighborsForMesh(chunk: Chunk): void {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const c = this.chunks.get(CHUNK_KEY(chunk.cx + dx, chunk.cz + dz));
      if (c && c.state === "generated" && !c.dirty) {
        c.dirty = true;
        this.meshQueue.push(c);
      }
    }
  }

  private refreshQueues(): void {
    const r = this.viewDistance;
    this.genQueue = [];
    this.meshQueue = [];

    for (let dz = -r - 1; dz <= r + 1; dz++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const dist = Math.hypot(dx, dz);
        if (dist > r + 1.42) continue;
        const cx = this.centerCx + dx;
        const cz = this.centerCz + dz;
        const key = CHUNK_KEY(cx, cz);
        let c = this.chunks.get(key);
        if (!c) {
          c = new Chunk(cx, cz);
          this.chunks.set(key, c);
        }
        if (c.state === "empty") this.genQueue.push(c);
        else if (c.state === "generated") this.meshQueue.push(c);
      }
    }

    // Generate outward from the player so the spawn area appears first.
    const byDist = (a: Chunk, b: Chunk) =>
      Math.hypot(a.cx - this.centerCx, a.cz - this.centerCz) -
      Math.hypot(b.cx - this.centerCx, b.cz - this.centerCz);
    this.genQueue.sort(byDist);
    this.meshQueue.sort(byDist);
  }

  private mesh(chunk: Chunk): void {
    this.disposeMeshes(chunk);
    const { solid, water } = buildChunkMeshes(this, chunk);

    if (solid) {
      chunk.solidMesh = new THREE.Mesh(solid, this.solidMaterial);
      chunk.solidMesh.position.set(chunk.cx * CHUNK_W, 0, chunk.cz * CHUNK_W);
      chunk.solidMesh.matrixAutoUpdate = false;
      chunk.solidMesh.updateMatrix();
      this.group.add(chunk.solidMesh);
    }
    if (water) {
      chunk.waterMesh = new THREE.Mesh(water, this.waterMaterial);
      chunk.waterMesh.position.set(chunk.cx * CHUNK_W, 0, chunk.cz * CHUNK_W);
      chunk.waterMesh.matrixAutoUpdate = false;
      chunk.waterMesh.updateMatrix();
      chunk.waterMesh.renderOrder = 1;
      this.group.add(chunk.waterMesh);
    }
    chunk.state = "meshed";
    chunk.dirty = false;
  }

  private disposeMeshes(chunk: Chunk): void {
    for (const m of [chunk.solidMesh, chunk.waterMesh]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    chunk.solidMesh = null;
    chunk.waterMesh = null;
  }

  /** Keeps chunk data (with player edits) but frees GPU meshes beyond range. */
  private unloadFar(): void {
    const maxDist = (this.viewDistance + 2.5) * CHUNK_W;
    for (const [, chunk] of this.chunks) {
      if (chunk.state !== "meshed") continue;
      const dx = (chunk.cx + 0.5) * CHUNK_W - this.centerCx * CHUNK_W;
      const dz = (chunk.cz + 0.5) * CHUNK_W - this.centerCz * CHUNK_W;
      if (Math.hypot(dx, dz) > maxDist) {
        this.disposeMeshes(chunk);
        chunk.state = "generated";
        chunk.dirty = false;
      }
    }
    if (this.chunks.size > 4096) this.chunks.clear();
  }

  /** True when a voxel is solid for collision purposes. */
  isCollidable(x: number, y: number, z: number): boolean {
    return isSolid(this.getBlock(x, y, z));
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) this.disposeMeshes(chunk);
    this.chunks.clear();
    this.solidMaterial.dispose();
    this.waterMaterial.dispose();
    this.group.removeFromParent();
  }
}
