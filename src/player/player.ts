import * as THREE from "three";
import { PLAYER } from "../core/constants";
import { clamp } from "../core/math";
import { isLiquid } from "../world/blocks";
import type { World } from "../world/world";

const EPSILON = 1e-3;

export interface PlayerIntent {
  /** -1 (left) .. 1 (right) */
  strafe: number;
  /** -1 (back) .. 1 (forward) */
  forward: number;
  jump: boolean;
  descend: boolean;
  sprint: boolean;
}

export const EMPTY_INTENT: PlayerIntent = {
  strafe: 0,
  forward: 0,
  jump: false,
  descend: false,
  sprint: false,
};

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/**
 * AABB voxel collider with walking, sprinting, jumping, swimming and creative
 * flight. Movement is resolved axis-by-axis against a grid of solid voxels.
 */
export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  flying = false;
  onGround = false;
  inWater = false;
  headInWater = false;
  sprinting = false;
  private bobPhase = 0;
  private bobAmount = 0;

  constructor(private readonly world: World) {}

  spawn(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.flying = false;
    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.unstuck();
  }

  setFlying(flying: boolean): void {
    this.flying = flying;
    if (!flying && this.velocity.y > 0) this.velocity.y = 0;
  }

  toggleFlying(): void {
    this.setFlying(!this.flying);
  }

  addLook(deltaX: number, deltaY: number, sensitivity: number): void {
    const factor = 0.0022 * sensitivity;
    this.yaw -= deltaX * factor;
    this.pitch -= deltaY * factor;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = clamp(this.pitch, -limit, limit);
  }

  getLookDirection(out: THREE.Vector3): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch);
    return out.set(
      -Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch,
    );
  }

  getEyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + PLAYER.eyeHeight, this.position.z);
  }

  update(deltaSeconds: number, intent: PlayerIntent): void {
    const dt = Math.min(deltaSeconds, 0.05);
    const world = this.world;

    const feetBlock = world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.1),
      Math.floor(this.position.z),
    );
    const eyeBlock = world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + PLAYER.eyeHeight),
      Math.floor(this.position.z),
    );
    const feetLiquid = isLiquid(feetBlock);
    this.inWater = feetLiquid || isLiquid(eyeBlock);
    this.headInWater = isLiquid(eyeBlock);

    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let wishX = forwardX * intent.forward + rightX * intent.strafe;
    let wishZ = forwardZ * intent.forward + rightZ * intent.strafe;
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 1) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    this.sprinting = intent.sprint && !this.flying;
    const speed = this.flying
      ? intent.sprint
        ? PLAYER.flySprintSpeed
        : PLAYER.flySpeed
      : this.inWater
        ? PLAYER.swimSpeed
        : this.sprinting
          ? PLAYER.sprintSpeed
          : PLAYER.walkSpeed;

    const groundControl = this.onGround ? PLAYER.groundAccel : PLAYER.airAccel;
    const accel = this.flying ? PLAYER.flyAccel : this.inWater ? PLAYER.airAccel : groundControl;
    const targetX = wishX * speed;
    const targetZ = wishZ * speed;
    const maxDelta = accel * dt;
    this.velocity.x = moveTowards(this.velocity.x, targetX, maxDelta);
    this.velocity.z = moveTowards(this.velocity.z, targetZ, maxDelta);

    if (this.flying) {
      const vertical = intent.jump ? 1 : intent.descend ? -1 : 0;
      this.velocity.y = moveTowards(
        this.velocity.y,
        vertical * speed,
        PLAYER.flyAccel * dt,
      );
    } else if (this.inWater) {
      if (intent.jump) {
        this.velocity.y = moveTowards(this.velocity.y, PLAYER.swimSpeed, 22 * dt);
      } else if (intent.descend) {
        this.velocity.y = moveTowards(this.velocity.y, -PLAYER.swimSpeed, 22 * dt);
      } else {
        this.velocity.y = moveTowards(this.velocity.y, -0.8, PLAYER.swimGravity * dt);
      }
      const drag = Math.exp(-1.6 * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
      this.velocity.y = clamp(this.velocity.y, -8, PLAYER.swimSpeed);
    } else {
      if (intent.jump && this.onGround) this.velocity.y = PLAYER.jumpVelocity;
      this.velocity.y -= PLAYER.gravity * dt;
      if (this.velocity.y < -PLAYER.terminalVelocity) this.velocity.y = -PLAYER.terminalVelocity;
    }

    this.onGround = false;
    this.moveAxis("x", this.velocity.x * dt);
    this.moveAxis("z", this.velocity.z * dt);
    const collidedY = this.moveAxis("y", this.velocity.y * dt);

    if (!this.flying) {
      const below = world.isSolidAt(
        Math.floor(this.position.x),
        Math.floor(this.position.y - 0.06),
        Math.floor(this.position.z),
      );
      if (below || (collidedY && this.velocity.y <= 0)) {
        this.onGround = true;
        if (this.velocity.y < 0) this.velocity.y = 0;
      }
    }

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && horizontalSpeed > 0.6) {
      this.bobPhase += dt * horizontalSpeed * 1.9;
      const intensity = Math.min(1, horizontalSpeed / PLAYER.walkSpeed);
      this.bobAmount = Math.sin(this.bobPhase) * 0.045 * intensity;
    } else {
      this.bobAmount *= Math.exp(-12 * dt);
    }
  }

  applyCamera(camera: THREE.PerspectiveCamera): void {
    camera.rotation.order = "YXZ";
    camera.rotation.set(this.pitch, this.yaw, 0);
    camera.position.set(
      this.position.x,
      this.position.y + PLAYER.eyeHeight + this.bobAmount,
      this.position.z,
    );
  }

  /** Nudges the player upward until the AABB is no longer inside solid terrain. */
  unstuck(): void {
    for (let attempt = 0; attempt < 96; attempt++) {
      if (!this.intersectsSolid()) return;
      this.position.y += 1;
    }
  }

  intersectsSolid(): boolean {
    const half = PLAYER.halfWidth;
    const minX = Math.floor(this.position.x - half);
    const maxX = Math.floor(this.position.x + half);
    const minY = Math.floor(this.position.y);
    const maxY = Math.floor(this.position.y + PLAYER.height - 1e-4);
    const minZ = Math.floor(this.position.z - half);
    const maxZ = Math.floor(this.position.z + half);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.world.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private moveAxis(axis: "x" | "y" | "z", amount: number): boolean {
    if (amount === 0) return false;
    const steps = Math.max(1, Math.ceil(Math.abs(amount) / 0.25));
    const stepAmount = amount / steps;
    for (let step = 0; step < steps; step++) {
      this.position[axis] += stepAmount;
      if (this.resolveCollisions(axis, stepAmount)) return true;
    }
    return false;
  }

  private resolveCollisions(axis: "x" | "y" | "z", step: number): boolean {
    const half = PLAYER.halfWidth;
    const minX = Math.floor(this.position.x - half);
    const maxX = Math.floor(this.position.x + half);
    const minY = Math.floor(this.position.y);
    const maxY = Math.floor(this.position.y + PLAYER.height - 1e-4);
    const minZ = Math.floor(this.position.z - half);
    const maxZ = Math.floor(this.position.z + half);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (!this.world.isSolidAt(x, y, z)) continue;
          if (axis === "y") {
            if (step > 0) this.position.y = y - PLAYER.height - EPSILON;
            else this.position.y = y + 1 + EPSILON;
            this.velocity.y = 0;
          } else if (axis === "x") {
            if (step > 0) this.position.x = x - half - EPSILON;
            else this.position.x = x + 1 + half + EPSILON;
            this.velocity.x = 0;
          } else {
            if (step > 0) this.position.z = z - half - EPSILON;
            else this.position.z = z + 1 + half + EPSILON;
            this.velocity.z = 0;
          }
          return true;
        }
      }
    }
    return false;
  }
}
