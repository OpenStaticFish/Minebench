import type * as THREE from "three";
import { CHUNK_W, CHUNK_H } from "./constants";

export type ChunkState = "empty" | "generated" | "meshed";

/** A 16 x 64 x 16 column of voxels plus its render meshes. */
export class Chunk {
  readonly data = new Uint8Array(CHUNK_W * CHUNK_W * CHUNK_H);
  state: ChunkState = "empty";
  dirty = false;
  solidMesh: THREE.Mesh | null = null;
  waterMesh: THREE.Mesh | null = null;

  constructor(
    readonly cx: number,
    readonly cz: number,
  ) {}

  static index(x: number, y: number, z: number): number {
    return x | (z << 4) | (y << 8);
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_H) return 0;
    return this.data[Chunk.index(x, y, z)]!;
  }

  set(x: number, y: number, z: number, id: number): void {
    if (y < 0 || y >= CHUNK_H) return;
    this.data[Chunk.index(x, y, z)] = id;
  }
}
