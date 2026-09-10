import * as THREE from "three";
import { CHUNK_KEEP_MARGIN, CHUNK_SIZE } from "../core/constants";
import { buildChunkMesh, createPaddedView, type AtlasDimensions, type MeshArrays } from "./mesher";
import { chunkCoords, chunkKey } from "./chunk";
import type { World } from "./world";

export interface ChunkManagerOptions {
  scene: THREE.Scene;
  world: World;
  atlas: AtlasDimensions;
  texture: THREE.Texture;
}

interface ChunkMeshes {
  opaque: THREE.Mesh | null;
  water: THREE.Mesh | null;
}

interface QueueEntry {
  cx: number;
  cz: number;
  distance: number;
}

/**
 * Streams chunks in and out around the player, rebuilding meshes on a frame
 * budget so terrain edits and world streaming never stall the render loop.
 * Geometries are disposed on unload to avoid GPU leaks.
 */
export class ChunkManager {
  private readonly scene: THREE.Scene;
  private readonly world: World;
  private readonly atlas: AtlasDimensions;
  private readonly opaqueMaterial: THREE.MeshLambertMaterial;
  private readonly waterMaterial: THREE.MeshLambertMaterial;
  private readonly meshes = new Map<number, ChunkMeshes>();
  private queue = new Map<number, QueueEntry>();
  private queueDirty = true;
  private radius = 6;
  private waterShader: THREE.WebGLProgramParametersWithUniforms | null = null;
  private elapsed = 0;

  /** Number of chunk meshes currently in the scene (for the HUD). */
  renderedChunks = 0;
  /** Number of queued / dirty chunks still waiting to be meshed. */
  pendingChunks = 0;
  /** Chunks meshed since the last reset (used by tests and the HUD). */
  meshedThisSession = 0;

  constructor(options: ChunkManagerOptions) {
    this.scene = options.scene;
    this.world = options.world;
    this.atlas = options.atlas;
    this.opaqueMaterial = new THREE.MeshLambertMaterial({
      map: options.texture,
      vertexColors: true,
      alphaTest: 0.5,
    });
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: options.texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.waterMaterial.onBeforeCompile = (shader) => {
      this.waterShader = shader;
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uTime;\nfloat cubewildWave(vec3 worldPos) { return sin(worldPos.x * 0.55 + uTime * 1.1) * 0.035 + cos(worldPos.z * 0.7 + uTime * 0.8) * 0.025; }",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvec3 cubewildWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\ntransformed.y += cubewildWave(cubewildWorld);",
        );
    };
  }

  get viewDistance(): number {
    return this.radius;
  }

  setViewDistance(chunks: number): void {
    if (chunks === this.radius) return;
    this.radius = chunks;
    this.queueDirty = true;
  }

  /** Rebuilds the queue from scratch. Call after view distance changes. */
  refreshQueue(playerX: number, playerZ: number): void {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);
    const radius = this.radius;
    const seen = new Set<number>();
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius + radius) continue;
        const wx = cx + dx;
        const wz = cz + dz;
        const chunk = this.world.getChunk(wx, wz);
        const key = chunkKey(wx, wz);
        seen.add(key);
        if (chunk.dirty || !chunk.meshed) {
          this.queue.set(key, { cx: wx, cz: wz, distance: Math.hypot(dx, dz) });
        } else {
          this.queue.delete(key);
        }
      }
    }
    for (const dirty of this.world.takeDirtyChunks()) {
      const key = chunkKey(dirty.cx, dirty.cz);
      if (!seen.has(key)) continue;
      const entry = this.queue.get(key);
      const distance = Math.hypot(dirty.cx - cx, dirty.cz - cz);
      if (!entry || distance < entry.distance) {
        this.queue.set(key, { cx: dirty.cx, cz: dirty.cz, distance });
      }
    }
    this.queueDirty = true;
  }

  update(deltaSeconds: number, playerX: number, playerZ: number, budgetMs = 7): void {
    this.elapsed += deltaSeconds;
    if (this.waterShader) {
      const uniform = this.waterShader.uniforms.uTime;
      if (uniform) uniform.value = this.elapsed;
    }

    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);
    if (this.queueDirty || this.currentCenterKey !== chunkKey(cx, cz)) {
      this.currentCenterKey = chunkKey(cx, cz);
      this.refreshQueue(playerX, playerZ);
      this.queueDirty = false;
      this.unloadFar(cx, cz);
    } else {
      for (const dirty of this.world.takeDirtyChunks()) {
        const distance = Math.hypot(dirty.cx - cx, dirty.cz - cz);
        if (distance <= this.radius + CHUNK_KEEP_MARGIN) {
          this.queue.set(chunkKey(dirty.cx, dirty.cz), {
            cx: dirty.cx,
            cz: dirty.cz,
            distance,
          });
        }
      }
    }

    if (this.queue.size > 0) {
      const entries = [...this.queue.values()].sort((a, b) => a.distance - b.distance);
      const start = performance.now();
      let built = 0;
      for (const entry of entries) {
        this.buildChunk(entry.cx, entry.cz);
        this.queue.delete(chunkKey(entry.cx, entry.cz));
        built++;
        if (performance.now() - start > budgetMs || built >= 3) break;
      }
    }

    this.pendingChunks = this.queue.size;
    this.renderedChunks = this.meshes.size;
  }

  /** True when every chunk inside the view radius is meshed. */
  isSettled(): boolean {
    return this.queue.size === 0;
  }

  private currentCenterKey = -1;

  private unloadFar(centerX: number, centerZ: number): void {
    const limit = this.radius + CHUNK_KEEP_MARGIN;
    for (const [key, meshes] of this.meshes) {
      const { cx, cz } = chunkCoords(key);
      if (Math.abs(cx - centerX) <= limit && Math.abs(cz - centerZ) <= limit) continue;
      this.disposeMeshes(meshes);
      this.meshes.delete(key);
    }
    this.world.evictFar(centerX, centerZ, limit + 2);
  }

  private disposeMeshes(meshes: ChunkMeshes): void {
    if (meshes.opaque) {
      this.scene.remove(meshes.opaque);
      meshes.opaque.geometry.dispose();
    }
    if (meshes.water) {
      this.scene.remove(meshes.water);
      meshes.water.geometry.dispose();
    }
  }

  private buildChunk(cx: number, cz: number): void {
    const chunk = this.world.getChunk(cx, cz);
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;
    const padded = createPaddedView(originX, originZ, (x, y, z) => this.world.getBlock(x, y, z));
    const data = buildChunkMesh(padded, this.atlas);
    const key = chunkKey(cx, cz);
    const existing = this.meshes.get(key);
    if (existing) this.disposeMeshes(existing);

    const opaque = this.createMesh(data.opaque, originX, originZ, this.opaqueMaterial, 0);
    const water = this.createMesh(data.water, originX, originZ, this.waterMaterial, 1);
    this.meshes.set(key, { opaque, water });
    chunk.dirty = false;
    chunk.meshed = true;
    this.meshedThisSession++;
  }

  private createMesh(
    arrays: MeshArrays,
    originX: number,
    originZ: number,
    material: THREE.Material,
    renderOrder: number,
  ): THREE.Mesh | null {
    if (arrays.positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(arrays.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(arrays.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(arrays.colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(arrays.uvs, 2));
    geometry.setIndex(arrays.indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(originX, 0, originZ);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = renderOrder;
    this.scene.add(mesh);
    return mesh;
  }

  dispose(): void {
    for (const meshes of this.meshes.values()) this.disposeMeshes(meshes);
    this.meshes.clear();
    this.queue.clear();
    this.opaqueMaterial.dispose();
    this.waterMaterial.dispose();
    this.waterShader = null;
  }
}
