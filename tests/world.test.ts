import { expect, test } from 'bun:test';
import { Block, CHUNK, HEIGHT, SEA, World } from '../src/world';

test('the starting meadow overlooks a water-filled bend, sandbar and snowy ridge', () => {
  const world = new World();
  const h = world.height(14, 36);
  expect(h).toBeGreaterThan(SEA + 5);
  expect(world.get(14, h, 36)).toBe(Block.Grass);
  expect(world.get(14, h + 1, 36)).toBe(Block.Air);
  expect(world.get(14, h + 2, 36)).toBe(Block.Air);

  const riverbed = world.height(8, 12);
  expect(riverbed).toBeLessThan(SEA - 2);
  expect(world.get(8, riverbed, 12)).toBe(Block.Sand);
  expect(world.get(8, SEA, 12)).toBe(Block.Water);
  expect(world.get(8, SEA + 1, 12)).toBe(Block.Air);
  const beach = Array.from({ length: 16 }, (_, i) => i + 16).find(
    (x) => world.height(x, 12) >= SEA && world.get(x, world.height(x, 12), 12) === Block.Sand,
  );
  expect(beach).toBeDefined();
  const summit = world.height(-19, -60);
  expect(summit).toBeGreaterThan(h + 25);
  expect(world.get(-19, summit, -60)).toBe(Block.Snow);
});

test('a walk-in gallery connects open air to a roofed chamber', () => {
  const world = new World();
  const z = -19;
  expect(world.height(20, z)).toBeLessThan(16);
  expect(world.height(32, z)).toBeGreaterThan(21);
  for (let x = 20; x <= 32; x++) {
    expect(world.get(x, 16, z)).toBe(Block.Air);
    expect(world.get(x, 17, z)).toBe(Block.Air);
  }
  expect(world.get(32, 14, z)).toBe(Block.Stone);
  expect(world.get(32, 22, z)).toBe(Block.Stone);
});

test('a pine grows across a chunk edge even when the canopy loads before the trunk', () => {
  const world = new World();
  const y = world.height(25, 16) + 5;
  expect(world.get(25, y, 15)).toBe(Block.Leaves);
  expect(world.cached.size).toBe(1);
  expect(world.get(25, y, 16)).toBe(Block.Wood);
  const reverse = new World(1847);
  for (const z of [1, 0]) {
    const expected = world.chunk(1, z);
    expect(reverse.chunk(1, z).every((v, i) => v === expected[i])).toBe(true);
  }
});

test('negative-coordinate edits use the documented array layout and survive eviction', () => {
  const world = new World();
  const y = HEIGHT - 1,
    i = (y * CHUNK + 14) * CHUNK + 15;
  expect(world.set(-16.2, y, -1.1, Block.Planks)).toBe(true);
  expect(world.chunk(-2, -1)[i]).toBe(Block.Planks);
  expect(world.get(-17, y, -2)).toBe(Block.Planks);
  expect(world.get(-16.2, y, -1.1)).toBe(Block.Planks);
  expect(world.set(-17, y, -2, Block.Planks)).toBe(false);

  const original = world.chunk(-2, -1);
  world.chunk(0, 0);
  world.prune(0, 0, 0);
  expect(world.cached.size).toBe(1);
  const after = world.chunk(-2, -1);
  expect(after).not.toBe(original);
  expect(after.every((v, j) => v === original[j])).toBe(true);
  expect(world.set(-17, y, -2, Block.Air)).toBe(true);
  world.unload(-2, -1);
  expect(world.get(-17, y, -2)).toBe(Block.Air);
});

test('bounds do not allocate chunks, and far terrain is seeded rather than tiled', () => {
  const a = new World(1847),
    b = new World(1848);
  for (const y of [-1, HEIGHT]) {
    expect(a.get(512, y, -512)).toBe(Block.Air);
    expect(a.set(512, y, -512, Block.Dirt)).toBe(false);
  }
  expect(a.cached.size).toBe(0);
  const far = a.chunk(1234, -678);
  expect(far).toHaveLength(CHUNK * CHUNK * HEIGHT);
  const nextBasin = a.chunk(1250, -678);
  const otherSeed = b.chunk(1234, -678);
  expect(far.some((v, i) => v !== nextBasin[i])).toBe(true);
  expect(far.some((v, i) => v !== otherSeed[i])).toBe(true);
});
