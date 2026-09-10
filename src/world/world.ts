import { CHUNK_HEIGHT, CHUNK_SIZE, chunkIndex } from "../core/constants";
import { BlockId, getBlockDef, isLiquid, isSolid } from "./blocks";
import { Chunk, chunkKey } from "./chunk";
import { Biome, WorldGenerator, type WorldGeneratorOptions } from "./worldgen";

/**
 * The voxel world: a sparse map of chunks with on-demand deterministic
 * generation. Edits write straight into chunk data and mark affected chunks
 * dirty so the chunk renderer can rebuild them.
 */
export class World {
  readonly seed: number;
  readonly generator: WorldGenerator;
  private readonly chunks = new Map<number, Chunk>();
  private readonly dirtyChunks = new Set<number>();
  private readonly dirtyCoords = new Map<number, { cx: number; cz: number }>();
  /** Player edits per chunk, replayed when a chunk is regenerated. */
  private readonly edits = new Map<number, Map<number, number>>();

  constructor(seed: number, options: WorldGeneratorOptions = {}) {
    this.seed = seed >>> 0;
    this.generator = new WorldGenerator(this.seed, options);
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  getChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;
    const chunk = new Chunk(cx, cz, this.generator.generateChunk(cx, cz));
    this.applyEdits(chunk);
    this.chunks.set(key, chunk);
    return chunk;
  }

  private applyEdits(chunk: Chunk): void {
    const saved = this.edits.get(chunkKey(chunk.cx, chunk.cz));
    if (!saved) return;
    for (const [index, id] of saved) {
      if (index >= 0 && index < chunk.data.length) chunk.data[index] = id;
    }
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return BlockId.Bedrock;
    if (y >= CHUNK_HEIGHT) return BlockId.Air;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    return chunk.getBlock(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE);
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    if (!chunk.setBlock(lx, y, lz, id)) return false;
    const key = chunkKey(cx, cz);
    let saved = this.edits.get(key);
    if (!saved) {
      saved = new Map();
      this.edits.set(key, saved);
    }
    saved.set(chunkIndex(lx, y, lz), id);
    this.markDirty(cx, cz);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  markDirty(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    this.dirtyChunks.add(key);
    this.dirtyCoords.set(key, { cx, cz });
    const chunk = this.chunks.get(key);
    if (chunk) chunk.dirty = true;
  }

  /** Returns chunks whose meshes need rebuilding and clears the dirty set. */
  takeDirtyChunks(): Array<{ cx: number; cz: number }> {
    const result = [...this.dirtyCoords.values()];
    this.dirtyChunks.clear();
    this.dirtyCoords.clear();
    return result;
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return isSolid(this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  isLiquidAt(x: number, y: number, z: number): boolean {
    return isLiquid(this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  /** Finds the first solid block at or below the given height in a column. */
  surfaceHeight(x: number, z: number): number {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const block = this.getBlock(x, y, z);
      if (isSolid(block) || getBlockDef(block).liquid) return y;
    }
    return 0;
  }

  biomeAt(x: number, z: number): Biome {
    return this.generator.biomeAt(x, z);
  }

  /**
   * Frees block data outside the keep radius. Edits are stored separately and
   * replayed if the player returns, so nothing the player built is lost.
   */
  evictFar(centerX: number, centerZ: number, limit: number): number {
    let evicted = 0;
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - centerX) <= limit && Math.abs(chunk.cz - centerZ) <= limit) continue;
      this.chunks.delete(key);
      evicted++;
    }
    return evicted;
  }

  dispose(): void {
    this.chunks.clear();
    this.dirtyChunks.clear();
    this.dirtyCoords.clear();
    this.edits.clear();
  }
}
