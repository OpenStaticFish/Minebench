import * as THREE from "three";
import { Block } from "./blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE, type World } from "./world";
import { buildChunkMesh } from "./mesher";

export class Chunk {
  cx: number;
  cz: number;
  seed: number;
  data: Uint8Array; // CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE
  mesh: THREE.Mesh;
  waterMesh: THREE.Mesh | null = null;
  needsRebuild = true;

  constructor(cx: number, cz: number, seed: number) {
    this.cx = cx; this.cz = cz; this.seed = seed;
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    // initial empty mesh — replaced on first rebuild
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial());
    this.mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;
  }

  idx(lx: number, y: number, lz: number) {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }
  get(lx: number, y: number, lz: number): number {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) return Block.AIR;
    return this.data[this.idx(lx, y, lz)]!;
  }
  set(lx: number, y: number, lz: number, id: number) {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) return;
    this.data[this.idx(lx, y, lz)] = id;
  }
  markRebuild() { this.needsRebuild = true; }
  countNonAir(): number {
    let c = 0; for (let i=0;i<this.data.length;i++) if (this.data[i] !== Block.AIR) c++;
    return c;
  }
  rebuild(world: World, material: THREE.Material, waterMaterial: THREE.Material) {
    const { solidGeom, waterGeom } = buildChunkMesh(this, world);
    // dispose old
    this.mesh.geometry.dispose();
    this.mesh.geometry = solidGeom;
    this.mesh.material = material;
    if (waterGeom) {
      if (this.waterMesh) {
        this.waterMesh.geometry.dispose();
        this.waterMesh.geometry = waterGeom;
        this.waterMesh.material = waterMaterial;
      } else {
        this.waterMesh = new THREE.Mesh(waterGeom, waterMaterial);
        this.waterMesh.position.copy(this.mesh.position);
        world.scene.add(this.waterMesh);
      }
    } else {
      if (this.waterMesh) {
        world.scene.remove(this.waterMesh);
        this.waterMesh.geometry.dispose();
        this.waterMesh = null;
      }
    }
    this.needsRebuild = false;
  }
  dispose() {
    this.mesh.geometry.dispose();
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
    }
  }
}
