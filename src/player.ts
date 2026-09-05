import * as THREE from "three";
import { Block, HEIGHT, solid, surface } from "./terrain";
import type { World } from "./world";

export class Player {
  readonly position = new THREE.Vector3(27.5, surface(27, 33) + 1.02, 33.5);
  readonly keys = new Set<string>();
  velocityY = 0;
  yaw = 0.56;
  pitch = -0.08;
  flying = false;
  grounded = false;
  sensitivity = 1;
  private jumpQueued = false;
  private lastSpacePress = -Infinity;
  constructor(
    readonly camera: THREE.PerspectiveCamera,
    readonly world: Pick<World, "get">,
  ) {
    this.syncCamera();
  }
  look(dx: number, dy: number) {
    this.yaw -= dx * 0.002 * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * 0.002 * this.sensitivity,
      -1.54,
      1.54,
    );
  }
  toggleFlight() {
    this.flying = !this.flying;
    this.velocityY = 0;
    this.jumpQueued = false;
    this.lastSpacePress = -Infinity;
  }
  pressSpace(now = performance.now()): boolean {
    if (now - this.lastSpacePress <= 280) {
      this.toggleFlight();
      return true;
    }
    this.lastSpacePress = now;
    this.jump();
    return false;
  }
  clearInput() {
    this.keys.clear();
    this.jumpQueued = false;
    this.lastSpacePress = -Infinity;
  }
  jump() {
    this.jumpQueued = true;
  }
  overlaps(x: number, y: number, z: number): boolean {
    const p = this.position;
    return (
      p.x + 0.29 > x &&
      p.x - 0.29 < x + 1 &&
      p.z + 0.29 > z &&
      p.z - 0.29 < z + 1 &&
      p.y + 1.75 > y &&
      p.y < y + 1
    );
  }
  collides(): boolean {
    const p = this.position;
    for (let x = Math.floor(p.x - 0.29); x <= Math.floor(p.x + 0.29); x++)
      for (let z = Math.floor(p.z - 0.29); z <= Math.floor(p.z + 0.29); z++)
        for (let y = Math.floor(p.y); y <= Math.floor(p.y + 1.75); y++)
          if (solid(this.world.get(x, y, z))) return true;
    return false;
  }
  update(dt: number) {
    const k = this.keys;
    const forward =
      Number(k.has("KeyW") || k.has("ArrowUp")) -
      Number(k.has("KeyS") || k.has("ArrowDown"));
    const strafe =
      Number(k.has("KeyD") || k.has("ArrowRight")) -
      Number(k.has("KeyA") || k.has("ArrowLeft"));
    const length = Math.hypot(forward, strafe) || 1;
    const swimming =
      this.world.get(
        Math.floor(this.position.x),
        Math.floor(this.position.y + 1),
        Math.floor(this.position.z),
      ) === Block.Water;
    const speed =
      (this.flying ? 11 : swimming ? 3.5 : 5.5) *
      (k.has("ControlLeft") ? 1.65 : 1);
    const dx =
      ((-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe) / length) *
      speed *
      dt;
    const dz =
      ((-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * strafe) / length) *
      speed *
      dt;
    if (this.flying)
      this.velocityY =
        (Number(k.has("Space")) -
          Number(k.has("ShiftLeft") || k.has("ShiftRight"))) *
        speed;
    else {
      if (this.jumpQueued && this.grounded) this.velocityY = 8.5;
      if (swimming && k.has("Space")) this.velocityY = 4;
      this.velocityY = Math.max(
        this.velocityY - (swimming ? 5 : 25) * dt,
        swimming ? -3 : -35,
      );
    }
    this.jumpQueued = false;
    this.grounded = false;
    // Substeps keep fast flight and gravity from tunneling through one-block walls.
    const dy = this.velocityY * dt;
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.2),
    );
    for (let i = 0; i < steps; i++) {
      for (const [axis, delta] of [
        ["x", dx / steps],
        ["z", dz / steps],
        ["y", dy / steps],
      ] as const) {
        const previous = this.position[axis];
        this.position[axis] += delta;
        if (this.collides()) {
          this.position[axis] = previous;
          if (axis === "y") {
            if (delta < 0) this.grounded = true;
            this.velocityY = 0;
          }
        }
      }
    }
    this.position.y = Math.min(this.position.y, HEIGHT + 30);
    this.syncCamera();
  }
  syncCamera() {
    this.camera.position.set(
      this.position.x,
      this.position.y + 1.62,
      this.position.z,
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.updateMatrixWorld(true);
  }
}
