import * as THREE from "three";
import { Block } from "./blocks";
import { Chunk } from "./chunk";
import { fbm2D, hash2, valueNoise2D, valueNoise3D } from "./noise";

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 96;
export const WORLD_SEA_LEVEL = 32;
export const WORLD_BOTTOM = 0;

export interface WorldOpts {
  seed: number;
  viewDistance: number;
  scene: THREE.Scene;
}

export class World {
  seed: number;
  viewDistance: number;
  scene: THREE.Scene;
  chunks = new Map<string, Chunk>();
  // material shared
  material: THREE.MeshLambertMaterial;
  waterMaterial: THREE.MeshLambertMaterial;

  constructor(opts: WorldOpts) {
    this.seed = opts.seed;
    this.viewDistance = opts.viewDistance;
    this.scene = opts.scene;

    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    // water separate for transparency
    this.waterMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
    });
  }

  key(cx: number, cz: number) { return `${cx},${cz}`; }

  getChunk(cx: number, cz: number) { return this.chunks.get(this.key(cx, cz)); }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return Block.AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const ch = this.getChunk(cx, cz);
    if (!ch) return Block.AIR;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return ch.get(lx, wy, lz);
  }

  setBlock(wx: number, wy: number, wz: number, id: number) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const ch = this.getChunk(cx, cz);
    if (!ch) return;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    ch.set(lx, wy, lz, id);
    ch.needsRebuild = true;
    // neighbor chunks may need rebuild if on edge
    if (lx === 0) this.getChunk(cx - 1, cz)?.markRebuild();
    if (lx === CHUNK_SIZE - 1) this.getChunk(cx + 1, cz)?.markRebuild();
    if (lz === 0) this.getChunk(cx, cz - 1)?.markRebuild();
    if (lz === CHUNK_SIZE - 1) this.getChunk(cx, cz + 1)?.markRebuild();
  }

  ensureChunksAround(px: number, pz: number) {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    const needed = new Set<string>();
    for (let dz = -this.viewDistance; dz <= this.viewDistance; dz++) {
      for (let dx = -this.viewDistance; dx <= this.viewDistance; dx++) {
        if (dx * dx + dz * dz > (this.viewDistance + 0.5) * (this.viewDistance + 0.5)) continue;
        const cx = pcx + dx, cz = pcz + dz;
        needed.add(this.key(cx, cz));
        if (!this.chunks.has(this.key(cx, cz))) {
          const ch = new Chunk(cx, cz, this.seed);
          this.generateChunk(ch);
          this.chunks.set(this.key(cx, cz), ch);
          this.scene.add(ch.mesh);
          if (ch.waterMesh) this.scene.add(ch.waterMesh);
        }
      }
    }
    // remove distant
    for (const [k, ch] of this.chunks) {
      if (!needed.has(k)) {
        this.scene.remove(ch.mesh);
        if (ch.waterMesh) this.scene.remove(ch.waterMesh);
        ch.dispose();
        this.chunks.delete(k);
      }
    }
    // rebuild dirty chunks
    for (const ch of this.chunks.values()) {
      if (ch.needsRebuild) {
        ch.rebuild(this, this.material, this.waterMaterial);
      }
    }
  }

  updateViewDistance(v: number, px: number, pz: number) {
    this.viewDistance = v;
    this.ensureChunksAround(px, pz);
  }

  // --- Terrain generation ---
  private generateChunk(ch: Chunk) {
    const { cx, cz } = ch;
    // Fill columns
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;

        // Heightmap generation: mix low freq biome + detail
        const biome = fbm2D(wx * 0.003, wz * 0.003, this.seed + 101) ; // -1..1
        const detail = fbm2D(wx * 0.02, wz * 0.02, this.seed + 202);
        const warpX = valueNoise2D(wx * 0.008, wz * 0.008, this.seed + 303) * 8;
        const warpZ = valueNoise2D(wx * 0.008 + 100, wz * 0.008 + 100, this.seed + 404) * 8;
        const wxw = wx + warpX;
        const wzw = wz + warpZ;

        // Base height per biome
        let baseH: number;
        let amp: number;
        let mountainBoost = 0;
        if (biome < -0.3) {
          // ocean / beach low
          baseH = 30; amp = 6;
        } else if (biome < 0.0) {
          // plains
          baseH = 36; amp = 8;
        } else if (biome < 0.4) {
          // hills
          baseH = 42; amp = 14;
        } else {
          // mountains
          baseH = 48; amp = 22;
          mountainBoost = fbm2D(wxw * 0.015, wzw * 0.015, this.seed + 505) * 12;
          // ridges
          const ridge = 1 - Math.abs(valueNoise2D(wxw * 0.01, wzw * 0.01, this.seed + 606));
          mountainBoost += ridge * 18;
        }

        const hNoise = fbm2D(wxw * 0.018, wzw * 0.018, this.seed + 1, 5, 2, 0.5);
        let height = Math.floor(baseH + hNoise * amp + detail * 3 + mountainBoost);

        height = Math.max(8, Math.min(CHUNK_HEIGHT - 12, height));

        // Column fill
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          // bedrock
          if (y === 0) { ch.set(lx, y, lz, Block.STONE); continue; }

          // caves: carve with 3D noise
          if (y > 8 && y < height - 2) {
            const caveN = valueNoise3D(wx * 0.07, y * 0.07, wz * 0.07, this.seed + 777);
            const caveN2 = valueNoise3D(wx * 0.035, y * 0.035, wz * 0.035, this.seed + 778);
            if (caveN > 0.62 && caveN2 > 0.18) {
              // occasional solid to keep structure
              if (hash2(wx * 31 + y, wz * 17, this.seed + 888) > 0.12) {
                ch.set(lx, y, lz, Block.AIR);
                continue;
              }
            }
            // extra pocket near surface
            if (y > 18 && y < 28) {
              const pocket = valueNoise3D(wx * 0.12, y * 0.12, wz * 0.12, this.seed + 779);
              if (pocket > 0.72) { ch.set(lx, y, lz, Block.AIR); continue; }
            }
          }

          if (y > height) {
            if (y <= WORLD_SEA_LEVEL) ch.set(lx, y, lz, Block.WATER);
            else ch.set(lx, y, lz, Block.AIR);
          } else if (y === height) {
            if (height <= WORLD_SEA_LEVEL + 1) ch.set(lx, y, lz, Block.SAND);
            else if (biome > 0.45 && height > 62) ch.set(lx, y, lz, Block.STONE);
            else ch.set(lx, y, lz, Block.GRASS);
          } else if (y >= height - 3) {
            if (height <= WORLD_SEA_LEVEL + 1) ch.set(lx, y, lz, Block.SAND);
            else ch.set(lx, y, lz, Block.DIRT);
          } else {
            // deeper, check if exposed near cave openings add variation
            ch.set(lx, y, lz, Block.STONE);
          }
        }

        // Trees: place on grass top above sea
        if (height > WORLD_SEA_LEVEL + 2 && height < 65) {
          const treeChance = biome < -0.1 ? 0.003 : biome < 0.2 ? 0.012 : 0.018;
          // use hash for deterministic placement, also offset to avoid alignment
          const r = hash2(wx, wz, this.seed + 999);
          if (r < treeChance) {
            // avoid beach
            if (ch.get(lx, height, lz) === Block.GRASS) {
              this.placeTree(ch, lx, height + 1, lz, wx, wz);
            }
          }
        }
      }
    }
    ch.needsRebuild = true;
  }

  private placeTree(ch: Chunk, lx: number, baseY: number, lz: number, wx: number, wz: number) {
    // simple tree, check space
    if (baseY + 6 >= CHUNK_HEIGHT) return;
    const h = 4 + Math.floor(hash2(wx * 7, wz * 13, this.seed + 1234) * 2); // 4-5
    // trunk
    for (let y = 0; y < h; y++) {
      const yy = baseY + y;
      if (yy >= CHUNK_HEIGHT) break;
      // ensure trunk within same chunk? For simplicity only if inside same chunk
      if (yy < CHUNK_HEIGHT) ch.set(lx, yy, lz, Block.WOOD);
    }
    const topY = baseY + h;
    // leaves: 3 layers
    for (let dy = -2; dy <= 1; dy++) {
      const yy = topY + dy;
      if (yy < 0 || yy >= CHUNK_HEIGHT) continue;
      const radius = dy === 1 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dz === 0 && dy < 0) continue; // trunk column keep
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy !== 0) continue; // clip corners
          const x = lx + dx, z = lz + dz;
          if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue; // avoid cross-chunk leaves for simplicity
          const yy2 = yy;
          if (ch.get(x, yy2, z) === Block.AIR) ch.set(x, yy2, z, Block.LEAVES);
        }
      }
    }
    // top cap
    if (topY + 1 < CHUNK_HEIGHT && ch.get(lx, topY + 1, lz) === Block.AIR) ch.set(lx, topY + 1, lz, Block.LEAVES);
  }

  // count blocks etc debug
  getStats() {
    let total = 0;
    for (const ch of this.chunks.values()) total += ch.countNonAir();
    return { chunks: this.chunks.size, blocks: total };
  }
}
