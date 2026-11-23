/**
 * A chunk is a 16×WORLD_HEIGHT×16 column of blocks stored as a flat byte array.
 * Layout: `x + z * 16 + y * 256` (x fastest), one byte per block id.
 */
export const CHUNK_SIZE = 16
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE
export const WORLD_HEIGHT = 128

export const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`

export const chunkIndex = (x: number, y: number, z: number): number => x + (z << 4) + (y << 8)

export class Chunk {
  readonly data = new Uint8Array(CHUNK_AREA * WORLD_HEIGHT)
  /** Highest non-air y + 1; lets the mesher skip empty sky. */
  maxY = 0
  /** True when block data changed since the mesh was (re)built. */
  dirty = true

  constructor(
    readonly cx: number,
    readonly cz: number,
  ) {}

  get key(): string {
    return chunkKey(this.cx, this.cz)
  }

  get originX(): number {
    return this.cx * CHUNK_SIZE
  }

  get originZ(): number {
    return this.cz * CHUNK_SIZE
  }

  /** Local coordinates; caller guarantees 0 ≤ x,z < 16 and 0 ≤ y < WORLD_HEIGHT. */
  get(x: number, y: number, z: number): number {
    return this.data[chunkIndex(x, y, z)]!
  }

  set(x: number, y: number, z: number, id: number): void {
    this.data[chunkIndex(x, y, z)] = id
    // Only ever grows: breaking the top block leaves a few empty cells for the
    // mesher to skip, which is cheaper than rescanning the column.
    if (id !== 0 && y + 1 > this.maxY) this.maxY = y + 1
    this.dirty = true
  }
}
