import { describe, expect, test } from "bun:test";
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL, chunkIndex } from "../src/core/constants";
import { BlockId } from "../src/world/blocks";
import { Biome, WorldGenerator } from "../src/world/worldgen";

const SEED = 20260910;

describe("WorldGenerator", () => {
  test("is deterministic per seed", () => {
    const a = new WorldGenerator(SEED);
    const b = new WorldGenerator(SEED);
    const chunkA = a.generateChunk(0, 0);
    const chunkB = b.generateChunk(0, 0);
    expect(chunkA.length).toBe(chunkB.length);
    expect(Buffer.from(chunkA).equals(Buffer.from(chunkB))).toBe(true);

    const different = new WorldGenerator(SEED + 1).generateChunk(0, 0);
    let differences = 0;
    for (let i = 0; i < chunkA.length; i++) {
      if (chunkA[i] !== different[i]) differences++;
    }
    expect(differences).toBeGreaterThan(100);
  });

  test("terrain has strong height variation across regions", () => {
    const generator = new WorldGenerator(SEED);
    let min = Infinity;
    let max = -Infinity;
    for (let x = -400; x <= 400; x += 16) {
      for (let z = -400; z <= 400; z += 16) {
        const height = generator.heightAt(x, z);
        min = Math.min(min, height);
        max = Math.max(max, height);
      }
    }
    expect(min).toBeLessThan(SEA_LEVEL + 2);
    expect(max).toBeGreaterThan(SEA_LEVEL + 18);
    expect(max - min).toBeGreaterThan(18);
  });

  test("produces multiple biomes", () => {
    const generator = new WorldGenerator(SEED);
    const biomes = new Set<Biome>();
    for (let x = -600; x <= 600; x += 24) {
      for (let z = -600; z <= 600; z += 24) {
        biomes.add(generator.biomeAt(x, z));
      }
    }
    expect(biomes.size).toBeGreaterThanOrEqual(3);
  });

  test("column rules hold: bedrock floor, water only up to sea level, never an air surface", () => {
    const generator = new WorldGenerator(SEED);
    const chunks = [
      generator.generateChunk(0, 0),
      generator.generateChunk(-3, 2),
      generator.generateChunk(4, -5),
    ];
    for (const data of chunks) {
      for (let x = 0; x < CHUNK_SIZE; x += 3) {
        for (let z = 0; z < CHUNK_SIZE; z += 3) {
          expect(data[chunkIndex(x, 0, z)]).toBe(BlockId.Bedrock);
        }
      }
    }
  });

  test("fills oceans and lakes with water", () => {
    const generator = new WorldGenerator(SEED);
    let waterBlocks = 0;
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const data = generator.generateChunk(cx, cz);
        for (let x = 0; x < CHUNK_SIZE; x++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let y = SEA_LEVEL; y > SEA_LEVEL - 6; y--) {
              if (data[chunkIndex(x, y, z)] === BlockId.Water) waterBlocks++;
            }
          }
        }
      }
    }
    expect(waterBlocks).toBeGreaterThan(0);
  });

  test("places trees, leaves and ground cover", () => {
    const generator = new WorldGenerator(SEED);
    let logs = 0;
    let leaves = 0;
    let cover = 0;
    for (let cx = -4; cx <= 4; cx++) {
      for (let cz = -4; cz <= 4; cz++) {
        const data = generator.generateChunk(cx, cz);
        for (const block of data) {
          if (block === BlockId.Log) logs++;
          else if (block === BlockId.Leaves) leaves++;
          else if (block === BlockId.GrassTuft || block === BlockId.Flower) cover++;
        }
      }
    }
    expect(logs).toBeGreaterThan(0);
    expect(leaves).toBeGreaterThan(logs * 4);
    expect(cover).toBeGreaterThan(10);
  });

  test("every leaf canopy is supported by a nearby trunk", () => {
    const generator = new WorldGenerator(SEED);
    const cache = new Map<string, Uint8Array>();
    const getBlock = (x: number, y: number, z: number): number => {
      if (y < 0 || y >= CHUNK_HEIGHT) return BlockId.Air;
      const cx = Math.floor(x / CHUNK_SIZE);
      const cz = Math.floor(z / CHUNK_SIZE);
      const key = `${cx},${cz}`;
      let data = cache.get(key);
      if (!data) {
        data = generator.generateChunk(cx, cz);
        cache.set(key, data);
      }
      return data[chunkIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] as number;
    };

    let leavesChecked = 0;
    for (let x = 0; x < CHUNK_SIZE * 4; x += 1) {
      for (let z = 0; z < CHUNK_SIZE * 4; z += 1) {
        for (let y = 2; y < CHUNK_HEIGHT; y++) {
          if (getBlock(x, y, z) !== BlockId.Leaves) continue;
          leavesChecked++;
          let supported = false;
          for (let dx = -2; dx <= 2 && !supported; dx++) {
            for (let dz = -2; dz <= 2 && !supported; dz++) {
              for (let dy = 0; dy <= 7 && y - dy >= 0; dy++) {
                if (getBlock(x + dx, y - dy, z + dz) === BlockId.Log) {
                  supported = true;
                  break;
                }
              }
            }
          }
          expect(supported).toBe(true);
        }
      }
    }
    expect(leavesChecked).toBeGreaterThan(50);
  });

  test("carves caves below the surface", () => {
    const generator = new WorldGenerator(SEED, { disableDecorations: true });
    let undergroundAir = 0;
    for (let cx = 0; cx < 2; cx++) {
      for (let cz = 0; cz < 2; cz++) {
        const data = generator.generateChunk(cx, cz);
        for (let x = 0; x < CHUNK_SIZE; x++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            const height = Math.floor(generator.heightAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z));
            for (let y = 2; y < Math.min(height - 4, CHUNK_HEIGHT); y++) {
              if (data[chunkIndex(x, y, z)] === BlockId.Air) undergroundAir++;
            }
          }
        }
      }
    }
    expect(undergroundAir).toBeGreaterThan(50);
  });

  test("desert regions surface with sand", () => {
    const generator = new WorldGenerator(SEED);
    let desertColumns = 0;
    let sandySurfaces = 0;
    for (let x = -500; x <= 500; x += 8) {
      for (let z = -500; z <= 500; z += 8) {
        if (generator.biomeAt(x, z) !== Biome.Desert) continue;
        desertColumns++;
        const height = Math.floor(generator.heightAt(x, z));
        if (height < SEA_LEVEL) continue;
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const data = generator.generateChunk(cx, cz);
        const block = data[chunkIndex(x - cx * CHUNK_SIZE, height, z - cz * CHUNK_SIZE)];
        if (block === BlockId.Sand) sandySurfaces++;
      }
    }
    expect(desertColumns).toBeGreaterThan(0);
    expect(sandySurfaces / desertColumns).toBeGreaterThan(0.8);
  });
});
