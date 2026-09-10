import { describe, expect, test } from "bun:test";
import { SEA_LEVEL } from "../src/core/constants";
import { BlockId } from "../src/world/blocks";
import { World } from "../src/world/world";

describe("World", () => {
  test("generates chunks on demand and reads blocks", () => {
    const world = new World(20260910);
    const surface = world.surfaceHeight(3, 3);
    expect(surface).toBeGreaterThan(0);
    expect(world.getBlock(3, surface, 3)).not.toBe(BlockId.Air);
    expect(world.chunkCount).toBeGreaterThan(0);
  });

  test("edits blocks and reports the change", () => {
    const world = new World(1234);
    const y = world.surfaceHeight(0, 0) + 1;
    expect(world.getBlock(0, y, 0)).toBe(BlockId.Air);
    expect(world.setBlock(0, y, 0, BlockId.Planks)).toBe(true);
    expect(world.getBlock(0, y, 0)).toBe(BlockId.Planks);
    expect(world.setBlock(0, y, 0, BlockId.Planks)).toBe(false);
  });

  test("marks chunks dirty and clears the set when consumed", () => {
    const world = new World(99);
    world.getChunk(0, 0);
    world.takeDirtyChunks();
    world.setBlock(15, SEA_LEVEL + 10, 0, BlockId.Cobble);
    const dirty = world.takeDirtyChunks();
    const keys = dirty.map((entry) => `${entry.cx},${entry.cz}`).sort();
    expect(keys).toContain("0,0");
    expect(keys).toContain("1,0");
    expect(world.takeDirtyChunks().length).toBe(0);
  });

  test("replays player edits after chunks are evicted", () => {
    const world = new World(4242);
    const y = world.surfaceHeight(5, 5) + 2;
    world.setBlock(5, y, 5, BlockId.Snow);
    expect(world.getBlock(5, y, 5)).toBe(BlockId.Snow);

    world.evictFar(500, 500, 0);
    expect(world.hasChunk(0, 0)).toBe(false);
    expect(world.getBlock(5, y, 5)).toBe(BlockId.Snow);
  });

  test("liquid and solid queries match block definitions", () => {
    const world = new World(555);
    expect(world.isSolidAt(0, 0, 0)).toBe(true);
    expect(world.isLiquidAt(0, 0, 0)).toBe(false);
    const waterY = SEA_LEVEL;
    let foundWater = false;
    for (let x = -60; x < 60 && !foundWater; x++) {
      for (let z = -60; z < 60 && !foundWater; z++) {
        if (world.getBlock(x, waterY, z) === BlockId.Water) foundWater = true;
      }
    }
    expect(foundWater).toBe(true);
  });
});
