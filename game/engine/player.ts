/**
 * Player: movement, gravity, jumping, swimming and creative flight with
 * AABB collision against the voxel world.
 */
import * as THREE from "three"
import { blockDef } from "../core/blocks"
import { type Box, isGrounded, moveBox } from "../core/collision"
import type { World } from "../core/world"

export interface MoveInput {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  /** Space: jump / swim up / fly up. */
  up: boolean
  /** Shift: fly down (and sprint while walking). */
  down: boolean
  sprint: boolean
  /** Space was pressed since the last frame (edge-triggered jump). */
  jumpPressed: boolean
}

export const PLAYER = {
  width: 0.6,
  height: 1.8,
  eyeHeight: 1.62,
  walkSpeed: 4.4,
  sprintSpeed: 6.8,
  swimSpeed: 2.6,
  flySpeed: 10.5,
  flySprintSpeed: 21,
  jumpSpeed: 8.4,
  gravity: 26,
  /** Base mouse-look radians per pixel at sensitivity 1. */
  lookScale: 0.0022,
} as const

const MAX_STEP = 0.35
/** A jump pressed just before landing still fires (seconds). */
const JUMP_BUFFER = 0.12

export class Player {
  /** Feet position (centre of the collision box). */
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  yaw = 0
  pitch = 0
  flying = false
  onGround = false
  inWater = false
  eyeInWater = false
  sprinting = false
  private jumpBuffer = 0

  get eye(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + PLAYER.eyeHeight, this.position.z)
  }

  /** Unit look direction for the current yaw/pitch (three.js YXZ convention). */
  get lookDirection(): THREE.Vector3 {
    const cp = Math.cos(this.pitch)
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp,
    )
  }

  box(): Box {
    const h = PLAYER.width / 2
    return {
      minX: this.position.x - h,
      maxX: this.position.x + h,
      minY: this.position.y,
      maxY: this.position.y + PLAYER.height,
      minZ: this.position.z - h,
      maxZ: this.position.z + h,
    }
  }

  teleport(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = pitch
    this.flying = false
    this.onGround = false
  }

  look(dx: number, dy: number, sensitivity: number): void {
    const s = PLAYER.lookScale * sensitivity
    this.yaw -= dx * s
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * s,
      -Math.PI / 2 + 0.001,
      Math.PI / 2 - 0.001,
    )
  }

  toggleFly(): void {
    this.flying = !this.flying
    this.velocity.y = 0
  }

  update(dt: number, input: MoveInput, world: World): void {
    const solid = (x: number, y: number, z: number) => world.isSolid(x, y, z)
    const px = Math.floor(this.position.x)
    const pz = Math.floor(this.position.z)
    const liquidAt = (y: number) =>
      blockDef(world.getBlock(px, Math.floor(this.position.y + y), pz)).liquid
    this.inWater = liquidAt(0.4) || liquidAt(1.0)
    this.eyeInWater = blockDef(
      world.getBlock(px, Math.floor(this.position.y + PLAYER.eyeHeight), pz),
    ).liquid

    // Wish direction in world space from yaw.
    const f = Number(input.forward) - Number(input.back)
    const s = Number(input.right) - Number(input.left)
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    let wx = -sin * f + cos * s
    let wz = -cos * f - sin * s
    const len = Math.hypot(wx, wz)
    if (len > 1) {
      wx /= len
      wz /= len
    }
    this.sprinting = input.sprint && f > 0
    const speed = this.flying
      ? this.sprinting
        ? PLAYER.flySprintSpeed
        : PLAYER.flySpeed
      : this.inWater
        ? PLAYER.swimSpeed
        : this.sprinting
          ? PLAYER.sprintSpeed
          : PLAYER.walkSpeed
    const accel = this.flying ? 7 : this.onGround ? 12 : this.inWater ? 5 : 2.5
    const k = 1 - Math.exp(-accel * dt)
    this.velocity.x += (wx * speed - this.velocity.x) * k
    this.velocity.z += (wz * speed - this.velocity.z) * k

    if (this.flying) {
      const targetY = (input.up ? speed : 0) - (input.down ? speed : 0)
      this.velocity.y += (targetY - this.velocity.y) * (1 - Math.exp(-8 * dt))
    } else if (this.inWater) {
      this.velocity.y -= 10 * dt
      this.velocity.y *= Math.exp(-2.5 * dt)
      if (input.up) this.velocity.y += (3.6 - this.velocity.y) * (1 - Math.exp(-8 * dt))
      this.velocity.y = Math.max(this.velocity.y, -3.5)
    } else {
      this.velocity.y = Math.max(this.velocity.y - PLAYER.gravity * dt, -60)
      this.jumpBuffer = input.jumpPressed ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt)
      if ((input.up || this.jumpBuffer > 0) && this.onGround) {
        this.velocity.y = PLAYER.jumpSpeed
        this.jumpBuffer = 0
      }
    }

    // Sub-step so no single move can skip a block.
    const v = this.velocity
    const maxMove = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt
    const steps = Math.max(1, Math.ceil(maxMove / MAX_STEP))
    let hitWall = false
    let landed = false
    for (let i = 0; i < steps; i++) {
      const box = this.box()
      const r = moveBox(box, (v.x * dt) / steps, (v.y * dt) / steps, (v.z * dt) / steps, solid)
      this.position.set((box.minX + box.maxX) / 2, box.minY, (box.minZ + box.maxZ) / 2)
      if (r.hitX) v.x = 0
      if (r.hitZ) v.z = 0
      if (r.hitY) {
        if (v.y < 0) landed = true
        v.y = 0
      }
      hitWall ||= r.hitX || r.hitZ
    }
    this.onGround = isGrounded(this.box(), solid)
    if (this.flying && landed) this.flying = false
    // Hop out of water when pushing against a shore.
    if (this.inWater && hitWall && input.forward && !this.flying)
      this.velocity.y = PLAYER.jumpSpeed * 0.9
  }
}
