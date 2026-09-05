import * as THREE from "three";
import type { World } from "./world";
import { CHUNK_H } from "./constants";

export interface MoveInput {
  /** Normalized move direction in local space: x = strafe, z = forward. */
  moveX: number;
  moveZ: number;
  jump: boolean;
  down: boolean;
  flying: boolean;
}

const GRAVITY = 26;
const WALK_SPEED = 5.4;
const FLY_SPEED = 13;
const JUMP_VELOCITY = 8.6;
const FLY_VERTICAL_SPEED = 8;

const WIDTH = 0.3; // half-width of the player AABB
const HEIGHT = 1.8;
const EYE = 1.62;
const EPS = 0.001;

/** Gravity-based first-person player with AABB voxel collision and creative flight. */
export class Player {
  /** Feet position. */
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  flying = false;
  onGround = false;

  spawn(world: World, wx: number, wz: number): void {
    this.pos.set(wx + 0.5, world.surfaceHeight(wx, wz) + 0.2, wz + 0.5);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI * 0.75; // look toward the sun-lit terrain
    this.pitch = -0.18;
    this.flying = false;
  }

  get eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  get direction(): THREE.Vector3 {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }

  update(dt: number, input: MoveInput, world: World): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Forward is -Z rotated by yaw; right is +X.
    const wishX = input.moveX * cos - input.moveZ * sin;
    const wishZ = -input.moveX * sin - input.moveZ * cos;

    if (input.flying) {
      this.flying = true;
      const speed = FLY_SPEED;
      const targetY = (input.jump ? 1 : 0) - (input.down ? 1 : 0);
      const target = new THREE.Vector3(wishX * speed, targetY * FLY_VERTICAL_SPEED, wishZ * speed);
      this.vel.lerp(target, Math.min(1, dt * 12));
    } else {
      this.flying = false;
      const target = new THREE.Vector3(wishX * WALK_SPEED, 0, wishZ * WALK_SPEED);
      const accel = this.onGround ? 12 : 4;
      this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * accel);
      this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * accel);
      this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -42);
      if (input.jump && this.onGround) {
        this.vel.y = JUMP_VELOCITY;
        this.onGround = false;
      }
    }

    this.onGround = false;
    this.moveAxis(world, 0, this.vel.x * dt);
    this.moveAxis(world, 2, this.vel.z * dt);
    this.moveAxis(world, 1, this.vel.y * dt);

    if (this.pos.y < -8) {
      // Fell out of the world (e.g. flew below the map): respawn on the surface.
      this.pos.y = world.surfaceHeight(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 0.2;
      this.vel.set(0, 0, 0);
    }
  }

  /** Moves along one axis and resolves AABB-vs-voxel collisions. */
  private moveAxis(world: World, axis: 0 | 1 | 2, amount: number): void {
    if (amount === 0) return;
    const coord = axis === 0 ? "x" : axis === 1 ? "y" : "z";
    this.pos[coord] += amount;

    const minX = Math.floor(this.pos.x - WIDTH);
    const maxX = Math.floor(this.pos.x + WIDTH);
    const minY = Math.floor(this.pos.y);
    const maxY = Math.floor(this.pos.y + HEIGHT - EPS);
    const minZ = Math.floor(this.pos.z - WIDTH);
    const maxZ = Math.floor(this.pos.z + WIDTH);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (!world.isCollidable(x, y, z)) continue;
          if (axis === 0) {
            this.pos.x = amount > 0 ? x - WIDTH - EPS : x + 1 + WIDTH + EPS;
            this.vel.x = 0;
          } else if (axis === 1) {
            if (amount > 0) {
              this.pos.y = y - HEIGHT - EPS;
            } else {
              this.pos.y = y + 1 + EPS;
              this.onGround = true;
            }
            this.vel.y = 0;
          } else {
            this.pos.z = amount > 0 ? z - WIDTH - EPS : z + 1 + WIDTH + EPS;
            this.vel.z = 0;
          }
          return;
        }
      }
    }
  }

  /** Does an AABB for a block placed at (x,y,z) intersect the player body? */
  intersectsBlock(x: number, y: number, z: number): boolean {
    return (
      x + 1 > this.pos.x - WIDTH &&
      x < this.pos.x + WIDTH &&
      y + 1 > this.pos.y &&
      y < this.pos.y + HEIGHT &&
      z + 1 > this.pos.z - WIDTH &&
      z < this.pos.z + WIDTH
    );
  }
}

export const PLAYER_SPAWN = { x: 8, z: 8 };
export const WORLD_MAX_Y = CHUNK_H;
