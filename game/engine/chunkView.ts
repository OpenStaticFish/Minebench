/**
 * ChunkRenderer: owns the three.js meshes for loaded chunks.
 *
 * Each chunk becomes at most two meshes (opaque + water), each a single
 * BufferGeometry drawn with one call — never one mesh per block. Removing a
 * chunk disposes its geometry so GPU memory is released immediately.
 */
import * as THREE from "three"
import type { Chunk } from "../core/chunk"
import { buildChunkMesh, type MeshData } from "../core/mesher"
import type { World } from "../core/world"

interface ChunkEntry {
  opaque?: THREE.Mesh
  water?: THREE.Mesh
}

function toGeometry(data: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  // slice() compacts the growable buffers so the oversized backing arrays can be collected.
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions.slice(), 3))
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs.slice(), 2))
  geometry.setAttribute("aData", new THREE.BufferAttribute(data.data.slice(), 2, true))
  geometry.setIndex(new THREE.BufferAttribute(data.indices.slice(), 1))
  geometry.computeBoundingSphere()
  return geometry
}

export class ChunkRenderer {
  private readonly entries = new Map<string, ChunkEntry>()

  constructor(
    private readonly scene: THREE.Scene,
    private readonly opaqueMaterial: THREE.Material,
    private readonly waterMaterial: THREE.Material,
  ) {}

  get meshCount(): number {
    let n = 0
    for (const entry of this.entries.values()) n += (entry.opaque ? 1 : 0) + (entry.water ? 1 : 0)
    return n
  }

  get chunkCount(): number {
    return this.entries.size
  }

  keys(): IterableIterator<string> {
    return this.entries.keys()
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  /** (Re)build the meshes for a chunk from its current block data. */
  build(chunk: Chunk, world: World): void {
    this.remove(chunk.key)
    const mesh = buildChunkMesh(chunk, world)
    const entry: ChunkEntry = {}
    if (mesh.opaque) entry.opaque = this.addMesh(mesh.opaque, this.opaqueMaterial, chunk)
    if (mesh.water) entry.water = this.addMesh(mesh.water, this.waterMaterial, chunk)
    if (entry.opaque || entry.water) this.entries.set(chunk.key, entry)
    chunk.dirty = false
  }

  private addMesh(data: MeshData, material: THREE.Material, chunk: Chunk): THREE.Mesh {
    const mesh = new THREE.Mesh(toGeometry(data), material)
    mesh.position.set(chunk.originX, 0, chunk.originZ)
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    // Opaque first, water after so transparent blending happens over solid terrain.
    mesh.renderOrder = material === this.waterMaterial ? 1 : 0
    this.scene.add(mesh)
    return mesh
  }

  remove(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    for (const mesh of [entry.opaque, entry.water]) {
      if (!mesh) continue
      this.scene.remove(mesh)
      mesh.geometry.dispose()
    }
    this.entries.delete(key)
  }

  dispose(): void {
    for (const key of [...this.entries.keys()]) this.remove(key)
  }
}
