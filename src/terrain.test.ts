import { describe, expect, test } from "bun:test";
import {
  Block,
  CHUNK,
  HEIGHT,
  generateChunk,
  index,
  solid,
  surface,
} from "./terrain";
import { Player } from "./player";
import { World } from "./world";
import * as THREE from "three";

describe("deterministic terrain", () => {
  test("identical chunks for the same seed, including negative coordinates", () => {
    expect(generateChunk(-1, 2)).toEqual(generateChunk(-1, 2));
    expect(generateChunk(0, 0)).not.toEqual(generateChunk(1, 0));
  });
  test("sealed bedrock, water, mountains, trees and cave pockets", () => {
    const seen = new Set<number>();
    let caves = 0;
    for (let cx = -3; cx <= 3; cx++)
      for (let cz = -4; cz <= 3; cz++) {
        const data = generateChunk(cx, cz);
        expect(data.length).toBe(CHUNK * CHUNK * HEIGHT);
        for (let x = 0; x < CHUNK; x++)
          for (let z = 0; z < CHUNK; z++) {
            expect(data[index(x, 0, z)]).toBe(Block.Stone);
            const h = surface(cx * CHUNK + x, cz * CHUNK + z);
            for (let y = 1; y < HEIGHT; y++) {
              seen.add(data[index(x, y, z)]!);
              if (y < h && data[index(x, y, z)] === Block.Air) caves++;
            }
          }
      }
    for (const b of [
      Block.Grass,
      Block.Dirt,
      Block.Stone,
      Block.Sand,
      Block.Wood,
      Block.Leaves,
      Block.Water,
      Block.Snow,
    ])
      expect(seen.has(b)).toBe(true);
    expect(caves).toBeGreaterThan(0);
  });
});

// Exercise actual World data/edit methods without a browser texture canvas.
function dataWorld() {
  const world = Object.create(World.prototype) as World;
  Object.assign(world, {
    data: new Map(),
    edits: new Map(),
    meshes: new Map(),
    rebuild: () => {},
  });
  return world;
}
test("edits regenerate after unloading, and bedrock/build ceiling are protected", () => {
  const world = dataWorld();
  expect(world.set(-1, 40, 16, Block.Planks)).toBe(true);
  expect(world.get(-1, 40, 16)).toBe(Block.Planks);
  world.data.clear();
  expect(world.get(-1, 40, 16)).toBe(Block.Planks);
  expect(world.set(0, 0, 0, Block.Air)).toBe(false);
  expect(world.set(0, HEIGHT, 0, Block.Stone)).toBe(false);
});
test("player falls, lands, jumps, flies and cannot pass through a wall", () => {
  const world = {
    get: (x: number, y: number) => (y < 1 || x === 2 ? Block.Stone : Block.Air),
  };
  const player = new Player(new THREE.PerspectiveCamera(), world);
  player.position.set(0.5, 7, 0.5);
  player.yaw = 0;
  for (let i = 0; i < 120; i++) player.update(1 / 60);
  expect(player.grounded).toBe(true);
  expect(player.position.y).toBeGreaterThanOrEqual(1);
  expect(player.position.y).toBeLessThan(1.05);
  player.jump();
  player.update(1 / 60);
  expect(player.velocityY).toBeGreaterThan(0);
  player.toggleFlight();
  player.keys.add("Space");
  for (let i = 0; i < 60; i++) player.update(1 / 60);
  expect(player.position.y).toBeGreaterThan(10);
  player.keys.clear();
  player.keys.add("KeyD");
  for (let i = 0; i < 90; i++) player.update(1 / 60);
  expect(player.position.x).toBeLessThan(1.72);
  expect(
    player.overlaps(
      Math.floor(player.position.x),
      Math.floor(player.position.y),
      0,
    ),
  ).toBe(true);
  expect(solid(Block.Water)).toBe(false);
});
test("border edits rebuild the loaded neighboring mesh", () => {
  const world = dataWorld();
  const rebuilt: string[] = [];
  world.rebuild = (x, z) => {
    rebuilt.push(`${x},${z}`);
  };
  world.meshes.set("1,0", new THREE.Group());
  world.set(15, 40, 7, Block.Planks);
  expect(rebuilt).toEqual(["0,0", "1,0"]);
});

test("double-tap Space toggles flight both ways without losing single-tap jumping", () => {
  const player = new Player(new THREE.PerspectiveCamera(), {
    get: () => Block.Air,
  });
  player.grounded = true;
  expect(player.pressSpace(1000)).toBe(false);
  player.update(1 / 60);
  expect(player.velocityY).toBeGreaterThan(0);
  expect(player.pressSpace(1200)).toBe(true);
  expect(player.flying).toBe(true);
  expect(player.pressSpace(1300)).toBe(false); // A third tap starts a new pair.
  expect(player.flying).toBe(true);
  expect(player.pressSpace(1800)).toBe(false); // Too slow to be a double tap.
  expect(player.pressSpace(1950)).toBe(true);
  expect(player.flying).toBe(false);
  player.update(1 / 60);
  expect(player.velocityY).toBeLessThan(0);
  player.pressSpace(2300);
  player.clearInput();
  expect(player.pressSpace(2400)).toBe(false);
  expect(player.flying).toBe(false);
});

test("Left Ctrl boosts ground and flight speed only while held", () => {
  for (const flying of [false, true]) {
    const world = {
      get: (_x: number, y: number) => (y < 1 ? Block.Stone : Block.Air),
    };
    const normal = new Player(new THREE.PerspectiveCamera(), world);
    const boosted = new Player(new THREE.PerspectiveCamera(), world);
    for (const player of [normal, boosted]) {
      player.position.set(0.5, flying ? 10 : 1.01, 0.5);
      player.yaw = 0;
      player.flying = flying;
      player.keys.add("KeyW");
    }
    boosted.keys.add("ControlLeft");
    for (let i = 0; i < 60; i++) {
      normal.update(1 / 60);
      boosted.update(1 / 60);
    }
    expect((0.5 - boosted.position.z) / (0.5 - normal.position.z)).toBeCloseTo(
      1.65,
      5,
    );
    const previous = boosted.position.z;
    boosted.keys.delete("ControlLeft");
    for (let i = 0; i < 60; i++) boosted.update(1 / 60);
    expect(previous - boosted.position.z).toBeCloseTo(flying ? 11 : 5.5, 5);
    if (flying) {
      boosted.clearInput();
      boosted.keys.add("ControlLeft");
      boosted.keys.add("Space");
      boosted.update(1 / 60);
      expect(boosted.velocityY).toBeCloseTo(11 * 1.65, 5);
    }
  }
});
