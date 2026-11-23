/**
 * World: the chunk map plus block access in world coordinates.
 *
 * Chunk data lives in memory for the lifetime of the world, so edits persist
 * even when a chunk's mesh is unloaded and later rebuilt.
 */
import { blockDef } from "./blocks"
import { Chunk, chunkIndex, chunkKey, WORLD_HEIGHT } from "./chunk"
import type { TerrainGenerator } from "./terrain"

export class World {
  private readonly chunks = new Map<string, Chunk>()

  constructor(
    readonly seed: number,
    readonly generator: TerrainGenerator,
  ) {}

  get chunkCount(): number {
    return this.chunks.size
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz))
  }

  /** Returns the chunk, generating its terrain on first access. */
  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz)
    let chunk = this.chunks.get(key)
    if (!chunk) {
      chunk = new Chunk(cx, cz)
      this.generator.generate(chunk)
      this.chunks.set(key, chunk)
    }
    return chunk
  }

  /** Block id at world coordinates; air outside generated chunks. */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0
    const chunk = this.chunks.get(chunkKey(x >> 4, z >> 4))
    if (!chunk) return 0
    return chunk.data[chunkIndex(x & 15, y, z & 15)]!
  }

  /**
   * Edit a block. Returns every chunk whose mesh must be rebuilt: the edited
   * chunk plus neighbours (including diagonals) when the block sits on a border,
   * because their faces and ambient occlusion depend on it.
   */
  setBlock(x: number, y: number, z: number, id: number): Chunk[] {
    if (y < 0 || y >= WORLD_HEIGHT) return []
    const cx = x >> 4
    const cz = z >> 4
    const chunk = this.chunks.get(chunkKey(cx, cz))
    if (!chunk) return []
    chunk.set(x & 15, y, z & 15, id)

    const affected: Chunk[] = [chunk]
    const lx = x & 15
    const lz = z & 15
    const dx = lx === 0 ? -1 : lx === 15 ? 1 : 0
    const dz = lz === 0 ? -1 : lz === 15 ? 1 : 0
    if (dx !== 0) this.markDirty(cx + dx, cz, affected)
    if (dz !== 0) this.markDirty(cx, cz + dz, affected)
    if (dx !== 0 && dz !== 0) this.markDirty(cx + dx, cz + dz, affected)
    return affected
  }

  private markDirty(cx: number, cz: number, into: Chunk[]): void {
    const chunk = this.chunks.get(chunkKey(cx, cz))
    if (chunk) {
      chunk.dirty = true
      into.push(chunk)
    }
  }

  /** Whether the player collides with this cell. Below the world counts as solid. */
  isSolid(x: number, y: number, z: number): boolean {
    if (y < 0) return true
    if (y >= WORLD_HEIGHT) return false
    const chunk = this.chunks.get(chunkKey(x >> 4, z >> 4))
    if (!chunk) return true
    return blockDef(chunk.data[chunkIndex(x & 15, y, z & 15)]!).solid
  }

  dispose(): void {
    this.chunks.clear()
  }
}
