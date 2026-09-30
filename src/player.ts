import * as THREE from 'three';
import { solid } from './blocks';
import { elevation } from './terrain';
import type { World } from './world';

export class Player {
  readonly position = new THREE.Vector3(18.5, elevation(18, 28) + 1.01, 28.5);
  readonly keys = new Set<string>();
  flying = false;
  grounded = false;
  yaw = 0.12;
  pitch = -0.04;
  private velocity = new THREE.Vector3();
  constructor(readonly camera: THREE.PerspectiveCamera, private world: World) { this.sync(); }
  look(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity * 0.002;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sensitivity * 0.002, -1.54, 1.54);
    this.sync();
  }
  toggleFlight(): void { this.flying = !this.flying; this.velocity.y = 0; }
  intersects(x: number, y: number, z: number): boolean {
    return this.position.x + 0.3 > x && this.position.x - 0.3 < x+1 && this.position.z+0.3 > z && this.position.z-0.3 < z+1 && this.position.y+1.75 > y && this.position.y < y+1;
  }
  private collides(): boolean {
    const p = this.position;
    for (let x = Math.floor(p.x-.3); x <= Math.floor(p.x+.3); x++)
      for (let z = Math.floor(p.z-.3); z <= Math.floor(p.z+.3); z++)
        for (let y = Math.floor(p.y); y <= Math.floor(p.y+1.75); y++)
          if (solid(this.world.get(x,y,z))) return true;
    return false;
  }
  update(dt: number): void {
    const k = this.keys;
    const f = Number(k.has('KeyW')) - Number(k.has('KeyS'));
    const s = Number(k.has('KeyD')) - Number(k.has('KeyA'));
    const speed = (k.has('ControlLeft') ? 10 : 5.4) * (this.flying ? 1.6 : 1);
    const wish = new THREE.Vector3(s * Math.cos(this.yaw) - f * Math.sin(this.yaw), 0, -s * Math.sin(this.yaw) - f * Math.cos(this.yaw));
    if (wish.lengthSq()) wish.normalize().multiplyScalar(speed);
    this.velocity.x = wish.x; this.velocity.z = wish.z;
    if (this.flying) this.velocity.y = (Number(k.has('Space')) - Number(k.has('ShiftLeft') || k.has('ShiftRight'))) * speed;
    else {
      if (this.grounded && k.has('Space')) { this.velocity.y = 8.2; this.grounded = false; }
      this.velocity.y = Math.max(-32, this.velocity.y - 23 * dt);
    }
    // Small substeps prevent tunneling through one-block walls at sprint speed.
    const steps = Math.max(1, Math.ceil(this.velocity.length() * dt / 0.18));
    this.grounded = false;
    for (let i = 0; i < steps; i++) for (const axis of ['x','z','y'] as const) {
      const old = this.position[axis];
      this.position[axis] += this.velocity[axis] * dt / steps;
      if (this.collides()) {
        this.position[axis] = old;
        if (axis === 'y' && this.velocity.y < 0) this.grounded = true;
        this.velocity[axis] = 0;
      }
    }
    if (this.position.y < -10) this.position.set(18.5, elevation(18,28)+2,28.5);
    this.sync();
  }
  sync(): void {
    this.camera.position.copy(this.position).add(new THREE.Vector3(0,1.6,0));
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
