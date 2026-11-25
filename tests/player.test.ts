import { describe, expect, test } from 'bun:test';
import { Player } from '../src/player';
import { Block } from '../src/world';

/** A flat floor at y=0, with explicit overrides for obstacles and excavations. */
class Grid {
  private cells = new Map<string, Block>();
  get(x: number, y: number, z: number): Block {
    return this.cells.get(`${x},${y},${z}`) ?? (y === 0 ? Block.Stone : Block.Air);
  }
  set(x: number, y: number, z: number, block: Block): boolean {
    if (this.get(x, y, z) === block) return false;
    this.cells.set(`${x},${y},${z}`, block);
    return true;
  }
}

const idle = new Set<string>();

describe('player movement', () => {
  test('lands at feet height and jumps a full block without auto-jumping on held Space', () => {
    const world = new Grid();
    const player = new Player(0.5, 12, 0.5);
    for (let i = 0; i < 8; i++) player.move(0.25, idle, world);
    expect(player.y).toBe(1);
    expect(player.eyeY).toBeCloseTo(2.62);
    expect(player.grounded).toBe(true);
    player.jump();
    let apex = 0;
    const space = new Set(['Space']);
    for (let i = 0; i < 90; i++) {
      if (i === 12) player.jump(); // No second jump in midair.
      player.move(1 / 60, space, world);
      apex = Math.max(apex, player.y);
    }
    expect(apex).toBeGreaterThan(2);
    expect(apex).toBeLessThan(2.45);
    expect(player.y).toBe(1);
    expect(player.grounded).toBe(true);
  });

  test('stops at an overhang and falls back without treating head contact as ground', () => {
    const world = new Grid();
    world.set(0, 3, 0, Block.Wood);
    const player = new Player(0.5, 1, 0.5);
    player.move(1 / 60, idle, world);
    player.jump();
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      player.move(1 / 90, idle, world);
      peak = Math.max(player.y, peak);
      if (player.y > 1) expect(player.grounded).toBe(false);
    }
    expect(peak).toBeCloseTo(1.2, 7);
    expect(player.y).toBe(1);
  });

  test('slides along a one-voxel wall with negative coordinates during delayed frames', () => {
    const world = new Grid();
    for (let z = -16; z <= 1; z++) world.set(-2, 2, z, Block.Stone);
    const player = new Player(0.5, 1, 0.5);
    player.yaw = Math.PI / 2;
    player.toggleFlight();
    const diagonal = new Set(['KeyW', 'KeyD']);
    for (let i = 0; i < 3; i++) player.move(0.24, diagonal, world);
    expect(player.x).toBeCloseTo(-0.7, 7);
    expect(player.z).toBeCloseTo(0.5 - (9 * 0.72) / Math.sqrt(2), 5);
    expect(player.y).toBe(1);
  });

  test('flight arrests a fall, hovers, and descends onto solid ground', () => {
    const world = new Grid();
    const player = new Player(0.5, 3, 0.5);
    player.move(0.2, idle, world);
    const before = player.y;
    expect(before).toBeLessThan(3);
    player.toggleFlight();
    player.move(0.2, idle, world);
    expect(player.y).toBe(before);
    player.move(0.2, new Set(['Space']), world);
    expect(player.y).toBeGreaterThan(before);
    for (let i = 0; i < 4; i++) player.move(0.2, new Set(['ShiftRight']), world);
    expect(player.y).toBe(1);
    player.toggleFlight();
    player.move(1 / 60, idle, world);
    expect(player.grounded).toBe(true);
  });

  test('wades into a water column and swims up from its floor', () => {
    const world = new Grid();
    for (let y = 1; y <= 4; y++) world.set(0, y, -1, Block.Water);
    const player = new Player(0.5, 1, 0.5);
    player.move(0.2, new Set(['KeyW']), world);
    expect(Math.floor(player.z)).toBe(-1);
    player.move(0.2, new Set(['Space']), world);
    expect(player.y).toBeGreaterThan(1.6);
    expect(player.grounded).toBe(false);
  });

  test('mouse right turns east, sensitivity scales immediately, and pitch cannot flip', () => {
    const player = new Player(0.5, 1, 0.5);
    player.look(40, -20, 1);
    const yaw = player.yaw,
      pitch = player.pitch;
    expect(yaw).toBeLessThan(0);
    expect(pitch).toBeGreaterThan(0);
    player.look(40, -20, 2);
    expect(player.yaw).toBeCloseTo(3 * yaw);
    expect(player.pitch).toBeCloseTo(3 * pitch);
    player.look(0, 100000, 2);
    expect(player.pitch).toBeCloseTo(-Math.PI / 2);
  });
});

describe('voxel editing', () => {
  test('selects the visible face through water at a negative grid boundary', () => {
    const world = new Grid();
    const player = new Player(-0.5, 1, -2);
    world.set(-1, 2, -3, Block.Water);
    world.set(-1, 2, -4, Block.Water);
    world.set(-1, 2, -5, Block.Stone);
    expect(player.target(world)).toEqual({ hit: [-1, 2, -5], place: [-1, 2, -4] });
    expect(player.edit(world, 'place', Block.Planks)).toEqual([-1, 2, -4]);
    expect(world.get(-1, 2, -4)).toBe(Block.Planks);
    expect(player.edit(world, 'break', Block.Planks)).toEqual([-1, 2, -4]);
    expect(world.get(-1, 2, -4)).toBe(Block.Air);
  });

  test('targets the floor from eye height but cannot place into the player', () => {
    const world = new Grid();
    const player = new Player(0.5, 1, 0.5);
    player.pitch = -Math.PI / 2;
    expect(player.target(world)).toEqual({ hit: [0, 0, 0], place: [0, 1, 0] });
    expect(player.edit(world, 'place', Block.Stone)).toBeNull();
    expect(world.get(0, 1, 0)).toBe(Block.Air);
    // With the feet exactly atop the candidate cell, touching is not intersection.
    player.y = 2;
    expect(player.edit(world, 'place', Block.Stone)).toEqual([0, 1, 0]);
  });

  test('a diagonal ray skips cells it only grazes and returns a face neighbor', () => {
    const world = new Grid();
    const player = new Player(0.5, 1, 0.5);
    player.yaw = Math.PI / 4;
    world.set(-1, 2, 0, Block.Wood);
    world.set(0, 2, -1, Block.Wood);
    world.set(-2, 2, -2, Block.Stone);
    const target = player.target(world);
    expect(target?.hit).toEqual([-2, 2, -2]);
    expect(target).not.toBeNull();
    const { hit, place } = target!;
    expect(
      Math.abs(hit[0] - place[0]) + Math.abs(hit[1] - place[1]) + Math.abs(hit[2] - place[2]),
    ).toBe(1);
  });

  test('cannot reach a distant block or report an edit rejected by the world', () => {
    const world = new Grid();
    const player = new Player(0.5, 1, 0.5);
    world.set(0, 2, -8, Block.Stone);
    expect(player.edit(world, 'break', Block.Air)).toBeNull();
    expect(world.get(0, 2, -8)).toBe(Block.Stone);
    world.set(0, 2, -4, Block.Stone);
    expect(
      player.edit({ get: world.get.bind(world), set: () => false }, 'break', Block.Air),
    ).toBeNull();
  });
});
