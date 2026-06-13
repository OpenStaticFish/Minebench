import { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } from "../constants";
import type { BlockId } from "../types";
import { Noise } from "../engine/Noise";
import { getBlock } from "./Blocks";
import type { Chunk } from "./Chunk";

// Deterministic procedural terrain. All randomness derives from the seed
// string, so a given seed always reproduces the same world.

/** Biome classification per column. */
export type Biome = "plains" | "forest" | "desert" | "mountains";

function hash2(x: number, z: number, seed: string): number {
  let h = 374761393;
  const s = `${x},${z},${seed}`;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 668265263);
  }
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 0x100000000;
}

export class TerrainGenerator {
  readonly seed: string;
  private readonly noise: Noise;

  constructor(seed: string) {
    this.seed = seed || "voxl";
    this.noise = new Noise(this.seed);
  }

  /** Approximate surface height (top solid block y) at a world column. */
  columnHeight(wx: number, wz: number): number {
    return Math.floor(this.rawHeight(wx, wz));
  }

  /** Biome at a world column. */
  biomeAt(wx: number, wz: number): Biome {
    const temp = this.noise.fbm2(wx * 0.0045 + 500, wz * 0.0045 + 500, 2);
    const moist = this.noise.fbm2(wx * 0.0045, wz * 0.0045 + 900, 2);
    const mount = this.noise.fbm2(wx * 0.008 + 1000, wz * 0.008 + 1000, 2);
    if (mount > 0.45) return "mountains";
    if (temp > 0.28 && moist < 0.05) return "desert";
    if (moist > 0.18) return "forest";
    return "plains";
  }

  private rawHeight(wx: number, wz: number): number {
    const n = this.noise;
    const continental = n.fbm2(wx * 0.005, wz * 0.005, 4); // large landmasses
    const hills = n.fbm2(wx * 0.02 + 200, wz * 0.02 + 200, 3); // medium relief
    const mountMask = Math.min(1, Math.max(0, n.fbm2(wx * 0.008 + 1000, wz * 0.008 + 1000, 2) - 0.2));
    const ridge = Math.abs(n.noise2(wx * 0.015 + 50, wz * 0.015 + 50));
    let h = SEA_LEVEL + 2 + continental * 22 + hills * 7;
    h += mountMask * mountMask * (30 + ridge * 24);
    return Math.max(3, Math.min(CHUNK_HEIGHT - 8, h));
  }

  /** True if a cave should be carved at this solid voxel. */
  private isCave(wx: number, y: number, wz: number, surface: number): boolean {
    if (y < 2 || y > surface - 3) return false;
    const a = this.noise.noise3(wx * 0.05, y * 0.08, wz * 0.05);
    const b = this.noise.noise3(wx * 0.05 + 100, y * 0.05 + 100, wz * 0.05 + 100);
    // Carve where two noise fields overlap near zero → winding tunnels.
    return Math.abs(a) < 0.12 && Math.abs(b) < 0.4;
  }

  /** Fill a chunk's block data. Does not touch meshes. */
  generate(chunk: Chunk): void {
    if (chunk.generated) return;
    const seed = this.seed;
    const blocks = chunk.blocks;
    const ox = chunk.originX;
    const oz = chunk.originZ;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const height = Math.floor(this.rawHeight(wx, wz));
        const biome = this.biomeAt(wx, wz);
        const sandy = biome === "desert" || height <= SEA_LEVEL + 1;
        const rocky = biome === "mountains" && height > SEA_LEVEL + 20;

        for (let y = 0; y <= Math.max(height, SEA_LEVEL); y++) {
          let block: BlockId = 0;
          if (y === 0) {
            block = 8; // bedrock floor
          } else if (y <= height) {
            if (this.isCave(wx, y, wz, height)) {
              block = 0; // carve cave
            } else if (y === height) {
              // surface block
              if (sandy) block = 4; // sand
              else if (rocky) block = 3; // stone cap on peaks
              else block = 1; // grass
            } else if (y >= height - 3) {
              block = sandy ? 4 : 2; // sand or dirt sub-surface
            } else {
              block = 3; // stone
            }
          } else if (y <= SEA_LEVEL) {
            block = 7; // water fills up to sea level
          }
          if (block !== 0) {
            blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = block;
          }
        }

        // Trees: only where there's grass surface above water and the canopy
        // fits within this chunk (avoids cross-chunk writes).
        if (
          !sandy &&
          !rocky &&
          height > SEA_LEVEL &&
          height < CHUNK_HEIGHT - 8 &&
          (biome === "forest" || biome === "plains")
        ) {
          const r = hash2(wx, wz, seed);
          const density = biome === "forest" ? 0.04 : 0.012;
          if (r < density && lx >= 2 && lx <= CHUNK_SIZE - 3 && lz >= 2 && lz <= CHUNK_SIZE - 3) {
            this.placeTree(blocks, lx, height + 1, lz, hash2(wx + 7, wz - 3, seed));
          }
        }
      }
    }

    chunk.generated = true;
    chunk.dirty = true;
  }

  private placeTree(blocks: Uint8Array, lx: number, baseY: number, lz: number, r: number): void {
    const trunk = 4 + Math.floor(r * 3); // 4..6
    const topY = baseY + trunk;
    // Leaves: two-layer canopy plus a top cap.
    for (let y = topY - 2; y <= topY + 1; y++) {
      const radius = y <= topY - 1 ? 2 : 1;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dz === 0 && y < topY) continue; // trunk space
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius === 2) continue; // round corners
          const x = lx + dx;
          const z = lz + dz;
          if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
          const idx = (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
          if (blocks[idx] === 0) blocks[idx] = 6; // leaves
        }
      }
    }
    // Trunk
    for (let y = baseY; y < topY; y++) {
      blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = 5; // wood
    }
  }
}

/** Resolve the world-space y of the topmost solid (non-air, non-water) block. */
export function findGroundY(
  chunk: Chunk,
  lx: number,
  lz: number,
): number {
  for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
    const id = chunk.blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
    if (id !== 0 && !getBlock(id).liquid) return y;
  }
  return 0;
}
