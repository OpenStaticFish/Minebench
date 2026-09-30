import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { Block } from './blocks';
import { blockIndex, CHUNK, HEIGHT, generateChunk, elevation } from './terrain';
import { World } from './world';
import { Player } from './player';

describe('voxel world', () => {
  test('generation is deterministic, varied, and contains required terrain materials', () => {
    expect(generateChunk(-1,0)).toEqual(generateChunk(-1,0));
    const types = new Set<number>();
    for (const [x,z] of [[-1,0],[1,1],[0,-3],[2,-3]]) for (const b of generateChunk(x!,z!)) types.add(b);
    for (const b of [Block.Air,Block.Grass,Block.Dirt,Block.Stone,Block.Sand,Block.Water,Block.Wood,Block.Leaves]) expect(types.has(b)).toBe(true);
    expect(elevation(0,0)).toBeLessThan(elevation(0,-48));
    expect(generateChunk(0,0).length).toBe(CHUNK*CHUNK*HEIGHT);
  });
  test('negative coordinate and border edits survive chunk eviction', () => {
    const world = new World(); world.radius = 2;
    world.set(-16,40,-1,Block.Brick);
    expect(world.get(-16,40,-1)).toBe(Block.Brick);
    world.update(500,500);
    expect(world.get(-16,40,-1)).toBe(Block.Brick);
    expect(generateChunk(-1,-1)[blockIndex(0,40,15)]).not.toBe(Block.Brick);
  });
  test('DDA returns precise face for placement and respects reach', () => {
    const world = new World(); world.set(1,55,0,Block.Brick);
    const hit = world.raycast(new THREE.Vector3(-2,55.5,.5),new THREE.Vector3(1,0,0));
    expect(hit?.block.toArray()).toEqual([1,55,0]);
    expect(hit?.normal.toArray()).toEqual([-1,0,0]);
    expect(world.raycast(new THREE.Vector3(-10,55.5,.5),new THREE.Vector3(1,0,0))).toBeNull();
  });
  test('gravity lands on terrain, jumping rises, and flight moves vertically', () => {
    const world = new World(), player = new Player(new THREE.PerspectiveCamera(),world);
    player.position.set(26.5,45,35.5);
    for (let i=0;i<300;i++) player.update(1/60);
    expect(player.grounded).toBe(true);
    const ground = player.position.y;
    player.keys.add('Space'); player.update(1/60);
    expect(player.position.y).toBeGreaterThan(ground);
    player.keys.clear(); player.toggleFlight();
    player.keys.add('Space'); player.update(.1);
    expect(player.position.y).toBeGreaterThan(ground+.5);
    expect(player.intersects(26,Math.floor(player.position.y),35)).toBe(true);
  });
});
