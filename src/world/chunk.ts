import { CHUNK_HEIGHT, CHUNK_SIZE, chunkIndex } from "../core/constants";
import { BlockId } from "./blocks";

/** A 16x16x96 column of block data with lazy mesh state. */
export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly data: Uint8Array;
  /** Set when block data changed and the mesh must be rebuilt. */
  dirty = true;
  /** True once geometry has been generated at least once. */
  meshed = false;

  constructor(cx: number, cz: number, data: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    this.data = data;
  }

  getBlock(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return BlockId.Air;
    if (y < 0 || y >= CHUNK_HEIGHT) return BlockId.Air;
    return this.data[chunkIndex(x, y, z)] as number;
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return false;
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const index = chunkIndex(x, y, z);
    if (this.data[index] === id) return false;
    this.data[index] = id;
    return true;
  }
}

export function chunkKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

export function chunkCoords(key: number): { cx: number; cz: number } {
  const cx = Math.floor(key / 65536) - 32768;
  const cz = (key % 65536) - 32768;
  return { cx, cz };
}
