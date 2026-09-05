import { Noise, hash2 } from "./noise";
import { Block } from "./blocks";
import type { Chunk } from "./chunk";
import { CHUNK_W, CHUNK_H, SEA_LEVEL, WORLD_SEED } from "./constants";

export type Biome = "plains" | "forest" | "desert" | "mountain";

interface ColumnInfo {
  height: number;
  biome: Biome;
  treeChance: number;
}

/** Deterministic procedural terrain: heightmap, biomes, caves, trees. */
export class WorldGen {
  private n = new Noise(WORLD_SEED);
  private colCache = new Map<number, ColumnInfo>();

  column(wx: number, wz: number): ColumnInfo {
    const key = (wx & 0xffff) | ((wz & 0xffff) << 16);
    const cached = this.colCache.get(key);
    if (cached) return cached;

    // Rolling base terrain.
    let h = 30 + this.n.fbm2(wx * 0.007, wz * 0.007, 4) * 9;

    // Mountain mask: sparse regions get big ridged uplift.
    const mm = this.n.fbm2(wx * 0.0032 + 400, wz * 0.0032 - 400, 2);
    if (mm > 0.22) {
      const ridge = ((mm - 0.22) / 0.78) ** 2;
      h += ridge * 36 * (0.75 + 0.25 * this.n.fbm2(wx * 0.02, wz * 0.02, 2));
    }

    h = Math.max(3, Math.min(CHUNK_H - 6, Math.floor(h)));

    const temp = this.n.fbm2(wx * 0.0025 + 900, wz * 0.0025 + 900, 2);
    const moist = this.n.fbm2(wx * 0.0028 - 900, wz * 0.0028 - 900, 2);

    let biome: Biome;
    let treeChance: number;
    if (h > 44) {
      biome = "mountain";
      treeChance = 0.004;
    } else if (temp > 0.3 && moist < 0.08) {
      biome = "desert";
      treeChance = 0;
    } else if (moist > 0.16) {
      biome = "forest";
      treeChance = 0.045;
    } else {
      biome = "plains";
      treeChance = 0.006;
    }

    const info: ColumnInfo = { height: h, biome, treeChance };
    if (this.colCache.size > 60000) this.colCache.clear();
    this.colCache.set(key, info);
    return info;
  }

  private caveAt(wx: number, y: number, wz: number, surfaceH: number): boolean {
    const n = this.n.noise3(wx * 0.075, y * 0.095, wz * 0.075);
    // Openings near the surface need a stronger threshold.
    const threshold = y >= surfaceH - 2 ? 0.72 : 0.58;
    return n > threshold;
  }

  /** Fills a chunk's voxel data. Trees are confined inside chunk borders. */
  generate(chunk: Chunk): void {
    const ox = chunk.cx * CHUNK_W;
    const oz = chunk.cz * CHUNK_W;

    for (let z = 0; z < CHUNK_W; z++) {
      for (let x = 0; x < CHUNK_W; x++) {
        const wx = ox + x;
        const wz = oz + z;
        const col = this.column(wx, wz);
        const h = col.height;

        for (let y = 0; y <= h; y++) {
          let id: number;
          if (y === h) {
            if (col.biome === "desert" || h <= SEA_LEVEL + 1) id = Block.Sand;
            else if (col.biome === "mountain" && h > 47) id = Block.Snow;
            else id = Block.Grass;
          } else if (y >= h - 3) {
            id = col.biome === "desert" || h <= SEA_LEVEL + 1 ? Block.Sand : Block.Dirt;
          } else {
            id = Block.Stone;
          }

          // Caves: never carve under oceans or near the very bottom.
          if (y > 1 && h >= SEA_LEVEL && this.caveAt(wx, y, wz, h)) {
            continue; // leave air
          }
          chunk.set(x, y, z, id);
        }

        // Water fills the space between surface and sea level.
        for (let y = h + 1; y < SEA_LEVEL; y++) {
          chunk.set(x, y, z, Block.Water);
        }
      }
    }

    this.plantTrees(chunk);
    chunk.state = "generated";
  }

  private plantTrees(chunk: Chunk): void {
    const ox = chunk.cx * CHUNK_W;
    const oz = chunk.cz * CHUNK_W;

    for (let z = 2; z < CHUNK_W - 2; z++) {
      for (let x = 2; x < CHUNK_W - 2; x++) {
        const wx = ox + x;
        const wz = oz + z;
        const col = this.column(wx, wz);
        if (col.treeChance === 0) continue;
        const h = col.height;
        if (h <= SEA_LEVEL + 1 || h > 44) continue;
        const surface = chunk.get(x, h, z);
        if (surface !== Block.Grass) continue;
        const r = hash2(wx, wz, WORLD_SEED);
        if (r >= col.treeChance) continue;

        const trunk = 4 + Math.floor(hash2(wx, wz, WORLD_SEED + 1) * 3);
        // Canopy blob.
        for (let dy = trunk - 2; dy <= trunk + 1; dy++) {
          const ry = h + dy;
          if (ry >= CHUNK_H) continue;
          const radius = dy >= trunk ? 1 : 2;
          for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
              // Trim corners for a rounder canopy.
              if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius > 1) continue;
              if (chunk.get(x + dx, ry, z + dz) === Block.Air) {
                chunk.set(x + dx, ry, z + dz, Block.Leaves);
              }
            }
          }
        }
        for (let dy = 1; dy <= trunk; dy++) {
          chunk.set(x, h + dy, z, Block.Log);
        }
      }
    }
  }
}
