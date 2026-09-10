import {
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  MAX_TERRAIN_HEIGHT,
  SEA_LEVEL,
  chunkIndex,
} from "../core/constants";
import { fbm2, fbm3, Noise, ridged2 } from "../core/noise";
import { hash2i, hashStringToSeed } from "../core/rng";
import { smoothstep } from "../core/math";
import { BlockId, isReplaceable } from "./blocks";

export enum Biome {
  Plains = 0,
  Forest = 1,
  Desert = 2,
  Snowy = 3,
  Ocean = 4,
}

export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.Plains]: "Plains",
  [Biome.Forest]: "Forest",
  [Biome.Desert]: "Desert",
  [Biome.Snowy]: "Snowy Peaks",
  [Biome.Ocean]: "Ocean",
};

export interface ColumnInfo {
  /** Highest terrain block (floating point); water is not included. */
  height: number;
  biome: Biome;
}

export interface WorldGeneratorOptions {
  /** Optional debug switch used by tests to assert cave carving has run. */
  disableCaves?: boolean;
  disableDecorations?: boolean;
}

/**
 * Deterministic procedural world generator.
 *
 * Terrain = rolling base + masked ridged mountains, then biome surface rules,
 * 3D-noise caves, sea-level water, and global-grid tree decoration so trees
 * cross chunk borders consistently. Same seed -> same world, always.
 */
export class WorldGenerator {
  readonly seed: number;
  private readonly options: WorldGeneratorOptions;
  private readonly baseNoise: Noise;
  private readonly mountainNoise: Noise;
  private readonly ridgeNoise: Noise;
  private readonly detailNoise: Noise;
  private readonly temperatureNoise: Noise;
  private readonly moistureNoise: Noise;
  private readonly caveNoiseA: Noise;
  private readonly caveNoiseB: Noise;

  constructor(seed: number, options: WorldGeneratorOptions = {}) {
    this.seed = seed >>> 0;
    this.options = options;
    this.baseNoise = new Noise(this.seed ^ 0x1a2b3c);
    this.mountainNoise = new Noise(this.seed ^ 0x51ed27);
    this.ridgeNoise = new Noise(this.seed ^ 0x2f9e11);
    this.detailNoise = new Noise(this.seed ^ 0x7ac31d);
    this.temperatureNoise = new Noise(this.seed ^ 0x0fa5b1);
    this.moistureNoise = new Noise(this.seed ^ 0x63d2e9);
    this.caveNoiseA = new Noise(this.seed ^ 0x44c1a7);
    this.caveNoiseB = new Noise(this.seed ^ 0x19be33);
  }

  heightAt(x: number, z: number): number {
    const base = 62.5 + fbm2(this.baseNoise, x * 0.0055, z * 0.0055, 4) * 7;
    const mountainMask = smoothstep(0.05, 0.78, fbm2(this.mountainNoise, x * 0.0016, z * 0.0016, 4));
    const ridge = ridged2(this.ridgeNoise, x * 0.011, z * 0.011, 4);
    const rolling = fbm2(this.detailNoise, x * 0.018 + 77.3, z * 0.018 - 33.1, 2) * 2.8;
    const detail = fbm2(this.detailNoise, x * 0.03, z * 0.03, 2) * 1.4;
    const mountains = Math.pow(mountainMask, 1.15) * Math.pow(Math.max(0, ridge - 0.12), 1.35) * 46;
    return Math.min(MAX_TERRAIN_HEIGHT, Math.max(4, base + rolling + mountains + detail));
  }

  temperatureAt(x: number, z: number): number {
    return fbm2(this.temperatureNoise, x * 0.0011, z * 0.0011, 3);
  }

  moistureAt(x: number, z: number): number {
    return fbm2(this.moistureNoise, x * 0.0013, z * 0.0013, 3);
  }

  biomeAt(x: number, z: number, height = this.heightAt(x, z)): Biome {
    const temperature = this.temperatureAt(x, z);
    const moisture = this.moistureAt(x, z);
    if (height < SEA_LEVEL - 1) return Biome.Ocean;
    if (temperature < -0.3 || height > 80) return Biome.Snowy;
    if (temperature > 0.2 && moisture < -0.05) return Biome.Desert;
    if (moisture > 0.06) return Biome.Forest;
    return Biome.Plains;
  }

  columnInfo(x: number, z: number): ColumnInfo {
    const height = this.heightAt(x, z);
    return { height, biome: this.biomeAt(x, z, height) };
  }

  private isCave(x: number, y: number, z: number, surfaceHeight: number, slope: number): boolean {
    if (y < 2 || y > surfaceHeight - 2) return false;
    const nearSurface = y > surfaceHeight - 6;
    const tunnel = fbm3(this.caveNoiseA, x * 0.062, y * 0.09, z * 0.062, 2);
    const threshold = nearSurface ? 0.66 : 0.6;
    if (tunnel > threshold) return true;
    if (y > surfaceHeight - 5) return false;
    const pocket = fbm3(this.caveNoiseB, x * 0.028, y * 0.05, z * 0.028, 2);
    const pocketThreshold = slope > 3 ? 0.58 : 0.72;
    return pocket > pocketThreshold;
  }

  generateChunk(cx: number, cz: number): Uint8Array {
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;

    const heights = new Float32Array((CHUNK_SIZE + 2) * (CHUNK_SIZE + 2));
    const biomes = new Uint8Array((CHUNK_SIZE + 2) * (CHUNK_SIZE + 2));
    const hidx = (x: number, z: number): number => (x + 1) * (CHUNK_SIZE + 2) + (z + 1);

    for (let x = -1; x <= CHUNK_SIZE; x++) {
      for (let z = -1; z <= CHUNK_SIZE; z++) {
        const height = this.heightAt(originX + x, originZ + z);
        heights[hidx(x, z)] = height;
        biomes[hidx(x, z)] = this.biomeAt(originX + x, originZ + z, height);
      }
    }

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = originX + x;
        const worldZ = originZ + z;
        const height = Math.floor(heights[hidx(x, z)] as number);
        const biome = biomes[hidx(x, z)] as Biome;
        const hx = heights[hidx(x, z)] as number;
        const slope = Math.max(
          Math.abs(hx - (heights[hidx(x + 1, z)] as number)),
          Math.abs(hx - (heights[hidx(x - 1, z)] as number)),
          Math.abs(hx - (heights[hidx(x, z + 1)] as number)),
          Math.abs(hx - (heights[hidx(x, z - 1)] as number)),
        );

        const surface = this.surfaceBlock(height, biome, slope);
        const underwater = height < SEA_LEVEL;

        for (let y = 0; y <= height; y++) {
          if (y === 0) {
            data[chunkIndex(x, y, z)] = BlockId.Bedrock;
            continue;
          }
          if (this.options.disableCaves !== true && this.isCave(worldX, y, worldZ, height, slope)) {
            continue;
          }
          const depth = height - y;
          let id: number;
          if (depth === 0) {
            id = underwater ? this.seaFloorBlock(height) : surface;
          } else if (depth <= 3) {
            id = this.subsurfaceBlock(height, biome, slope);
          } else if (depth <= 6 && (biome === Biome.Desert || this.isBeach(height))) {
            id = BlockId.Sandstone;
          } else {
            id = BlockId.Stone;
          }
          data[chunkIndex(x, y, z)] = id;
        }

        for (let y = height + 1; y <= SEA_LEVEL; y++) {
          data[chunkIndex(x, y, z)] = BlockId.Water;
        }
      }
    }

    if (this.options.disableDecorations !== true) {
      this.decorate(data, originX, originZ);
    }
    return data;
  }

  private isBeach(height: number): boolean {
    return height >= SEA_LEVEL - 1 && height <= SEA_LEVEL + 1;
  }

  private seaFloorBlock(height: number): number {
    return height >= SEA_LEVEL - 4 ? BlockId.Sand : BlockId.Stone;
  }

  private surfaceBlock(height: number, biome: Biome, slope: number): number {
    if (height > 82) return BlockId.Snow;
    if (height > 70 && slope > 3.2) return BlockId.Stone;
    if (height > 74) return biome === Biome.Snowy ? BlockId.Snow : BlockId.Stone;
    if (biome === Biome.Desert) return BlockId.Sand;
    if (biome === Biome.Snowy) return BlockId.Snow;
    if (this.isBeach(height)) return BlockId.Sand;
    return BlockId.Grass;
  }

  private subsurfaceBlock(height: number, biome: Biome, slope: number): number {
    if (biome === Biome.Desert || this.isBeach(height)) return BlockId.Sand;
    if (height > 74 && slope > 3.2) return BlockId.Stone;
    if (biome === Biome.Snowy && height > 70) return BlockId.Stone;
    return BlockId.Dirt;
  }

  private decorate(data: Uint8Array, originX: number, originZ: number): void {
    const write = (
      worldX: number,
      worldY: number,
      worldZ: number,
      id: number,
      mode: "trunk" | "leaves",
    ): void => {
      const x = worldX - originX;
      const z = worldZ - originZ;
      if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
      if (worldY < 0 || worldY >= CHUNK_HEIGHT) return;
      const index = chunkIndex(x, worldY, z);
      const current = data[index] as number;
      if (mode === "leaves") {
        if (current === BlockId.Air || current === BlockId.Leaves) data[index] = id;
      } else if (current === BlockId.Air || current === BlockId.Leaves || isReplaceable(current)) {
        data[index] = id;
      }
    };

    const gridSize = 6;
    const margin = 7;
    const gx0 = Math.floor((originX - margin) / gridSize);
    const gx1 = Math.floor((originX + CHUNK_SIZE + margin) / gridSize);
    const gz0 = Math.floor((originZ - margin) / gridSize);
    const gz1 = Math.floor((originZ + CHUNK_SIZE + margin) / gridSize);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const tree = this.treeDescriptor(gx, gz);
        if (!tree) continue;
        if (tree.kind === "oak") {
          this.placeOak(write, tree.x, tree.height, tree.z, hash2i(gx, gz, this.seed ^ 0x1f77));
        } else if (tree.kind === "pine") {
          this.placePine(write, tree.x, tree.height, tree.z, hash2i(gx, gz, this.seed ^ 0x5c11));
        } else {
          this.placeCactus(write, tree.x, tree.height, tree.z, hash2i(gx, gz, this.seed ^ 0x6d2f));
        }
      }
    }

    this.decorateGround(data, originX, originZ);
  }

  private treeDensity(biome: Biome): number {
    switch (biome) {
      case Biome.Forest:
        return 0.4;
      case Biome.Plains:
        return 0.12;
      case Biome.Snowy:
        return 0.22;
      case Biome.Desert:
        return 0.14;
      default:
        return 0;
    }
  }

  private slopeAt(x: number, z: number): number {
    const height = this.heightAt(x, z);
    return Math.max(
      Math.abs(height - this.heightAt(x + 1, z)),
      Math.abs(height - this.heightAt(x - 1, z)),
      Math.abs(height - this.heightAt(x, z + 1)),
      Math.abs(height - this.heightAt(x, z - 1)),
    );
  }

  /**
   * Pure description of the tree (if any) anchored at a decoration grid cell.
   * Being independent of chunk boundaries lets canopies cross borders cleanly.
   */
  private treeDescriptor(
    gx: number,
    gz: number,
  ): { x: number; z: number; height: number; kind: "oak" | "pine" | "cactus" } | null {
    const gridSize = 6;
    const roll = hash2i(gx, gz, this.seed ^ 0x51ab);
    const x = gx * gridSize + Math.floor(hash2i(gx, gz, this.seed ^ 0x77cd) * (gridSize - 1));
    const z = gz * gridSize + Math.floor(hash2i(gx, gz, this.seed ^ 0x33ef) * (gridSize - 1));
    const height = Math.floor(this.heightAt(x, z));
    if (height <= SEA_LEVEL) return null;
    const biome = this.biomeAt(x, z, height);
    if (roll > this.treeDensity(biome)) return null;
    const surface = this.surfaceBlock(height, biome, this.slopeAt(x, z));
    if (surface === BlockId.Grass) {
      const shape = hash2i(gx, gz, this.seed ^ 0x9a31);
      const kind = biome === Biome.Snowy ? "pine" : shape > 0.45 ? "oak" : "pine";
      return { x, z, height, kind };
    }
    if (surface === BlockId.Sand && biome === Biome.Desert) {
      return { x, z, height, kind: "cactus" };
    }
    return null;
  }

  /** True when a trunk would be placed within `radius` blocks of a column. */
  hasTreeNear(x: number, z: number, radius = 2): boolean {
    const gridSize = 6;
    const gx0 = Math.floor((x - radius - gridSize) / gridSize);
    const gx1 = Math.floor((x + radius + gridSize) / gridSize);
    const gz0 = Math.floor((z - radius - gridSize) / gridSize);
    const gz1 = Math.floor((z + radius + gridSize) / gridSize);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const tree = this.treeDescriptor(gx, gz);
        if (!tree || tree.kind === "cactus") continue;
        if (Math.abs(tree.x - x) <= radius && Math.abs(tree.z - z) <= radius) {
          return true;
        }
      }
    }
    return false;
  }

  private decorateGround(data: Uint8Array, originX: number, originZ: number): void {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = originX + x;
        const worldZ = originZ + z;
        for (let y = 1; y < CHUNK_HEIGHT - 1; y++) {
          const index = chunkIndex(x, y, z);
          if (data[index] !== BlockId.Air) continue;
          const below = data[chunkIndex(x, y - 1, z)];
          if (below !== BlockId.Grass) continue;
          const biome = this.biomeAt(worldX, worldZ);
          const roll = hash2i(worldX * 31 + y, worldZ * 17, this.seed ^ 0x7f4a);
          const forestBoost = biome === Biome.Forest ? 1.6 : 1;
          if (roll < 0.09 * forestBoost) {
            data[index] = roll < 0.035 * forestBoost ? BlockId.Flower : BlockId.GrassTuft;
          }
          break;
        }
      }
    }
  }

  private placeOak(
    write: (x: number, y: number, z: number, id: number, mode: "trunk" | "leaves") => void,
    x: number,
    groundY: number,
    z: number,
    roll: number,
  ): void {
    const trunkHeight = 4 + Math.floor(roll * 2);
    for (let i = 1; i <= trunkHeight; i++) write(x, groundY + i, z, BlockId.Log, "trunk");
    const top = groundY + trunkHeight;
    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy <= -1 ? 2 : 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dz === 0 && dy <= 0) continue;
          const distance = Math.abs(dx) + Math.abs(dz);
          if (dy === 1 && distance > 1) continue;
          if (radius === 2 && distance > 3) continue;
          if (roll > 0.5 && radius === 2 && distance === 3 && (dx === 0 || dz === 0)) continue;
          write(x + dx, top + dy, z + dz, BlockId.Leaves, "leaves");
        }
      }
    }
    write(x, top + 1, z, BlockId.Leaves, "leaves");
  }

  private placePine(
    write: (x: number, y: number, z: number, id: number, mode: "trunk" | "leaves") => void,
    x: number,
    groundY: number,
    z: number,
    roll: number,
  ): void {
    const trunkHeight = 6 + Math.floor(roll * 3);
    for (let i = 1; i < trunkHeight; i++) write(x, groundY + i, z, BlockId.Log, "trunk");
    const top = groundY + trunkHeight;
    for (let y = groundY + 2; y <= top; y++) {
      const remaining = top - y;
      const radius = remaining >= 4 ? 2 : remaining >= 1 ? 1 : 0;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          write(x + dx, y, z + dz, BlockId.Leaves, "leaves");
        }
      }
    }
    write(x, top + 1, z, BlockId.Leaves, "leaves");
  }

  private placeCactus(
    write: (x: number, y: number, z: number, id: number, mode: "trunk" | "leaves") => void,
    x: number,
    groundY: number,
    z: number,
    roll: number,
  ): void {
    const height = 3 + Math.floor(roll * 2);
    for (let i = 1; i <= height; i++) write(x, groundY + i, z, BlockId.Cactus, "trunk");
    if (roll > 0.55 && height >= 3) {
      const armY = groundY + height - 1;
      write(x + 1, armY, z, BlockId.Cactus, "trunk");
      write(x + 2, armY, z, BlockId.Cactus, "trunk");
      write(x + 2, armY + 1, z, BlockId.Cactus, "trunk");
    }
  }
}

export function seedFromString(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  if (/^-?\d+$/.test(trimmed)) {
    const value = Number(trimmed);
    if (Number.isFinite(value)) return value >>> 0;
  }
  return hashStringToSeed(trimmed);
}
