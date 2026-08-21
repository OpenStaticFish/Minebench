import * as THREE from "three";
import { Block } from "./blocks";
import type { World } from "./world";
import { CHUNK_HEIGHT } from "./world";

export interface PlayerOpts {
  world: World;
  camera: THREE.PerspectiveCamera;
  sensitivity: number;
}

export class Player {
  world: World;
  camera: THREE.PerspectiveCamera;
  pos = new THREE.Vector3(0, 50, 0);
  vel = new THREE.Vector3(0, 0, 0);
  yaw = 0; // around Y
  pitch = 0; // around X
  sensitivity = 0.0025;

  // physics
  flying = false;
  onGround = false;
  height = 1.65;
  eyeHeight = 1.55;
  radius = 0.3;
  gravity = 28;
  jumpSpeed = 9;
  moveSpeed = 5.2;
  flySpeed = 10;

  // inputs
  keys = new Set<string>();
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  sprint = false;

  // double tap
  private lastSpaceTime = 0;

  worldCamera: THREE.Object3D;

  constructor(opts: PlayerOpts) {
    this.world = opts.world;
    this.camera = opts.camera;
    this.sensitivity = opts.sensitivity;
    this.worldCamera = new THREE.Object3D();
    this.worldCamera.add(this.camera);
    this.camera.position.set(0, this.eyeHeight, 0);
  }

  setSensitivity(v: number) { this.sensitivity = v; }

  handleKeyDown(e: KeyboardEvent) {
    const k = e.code;
    this.keys.add(k);
    if (k === "Space") {
      const now = performance.now();
      if (now - this.lastSpaceTime < 300) {
        this.toggleFly();
        this.lastSpaceTime = 0; // prevent triple
      } else {
        this.lastSpaceTime = now;
        // jump if not flying
        if (!this.flying && this.onGround) {
          this.vel.y = this.jumpSpeed;
          this.onGround = false;
        } else if (this.flying) {
          // fly up handled in update via Space held
        }
      }
      e.preventDefault();
    }
    if (k === "KeyF") {
      this.toggleFly();
    }
  }
  handleKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
  }

  toggleFly() {
    this.flying = !this.flying;
    if (this.flying) this.vel.y = 0;
  }

  handleMouseMove(dx: number, dy: number) {
    // called with movementX/Y already scaled?
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  // collision helpers
  private isSolidAt(wx: number, wy: number, wz: number): boolean {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false; // allow falling below?
    // if below 0, consider solid? Let player fall? Keep void.
    const id = this.world.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz));
    return id !== Block.AIR && id !== Block.WATER && id !== Block.GLASS;
    // water and glass not solid for collision
  }

  private collides(pos: THREE.Vector3): boolean {
    const r = this.radius;
    const h = this.height;
    // check AABB by sampling points
    const minX = pos.x - r, maxX = pos.x + r;
    const minZ = pos.z - r, maxZ = pos.z + r;
    const minY = pos.y, maxY = pos.y + h; // feet to head

    // sample at corners + center at multiple Y levels
    const ys = [minY + 0.1, (minY + maxY) / 2, maxY - 0.1];
    const xs = [minX + 0.02, maxX - 0.02];
    const zs = [minZ + 0.02, maxZ - 0.02];
    // also center
    xs.push(pos.x); zs.push(pos.z);

    for (const y of ys) {
      for (const x of xs) {
        for (const z of zs) {
          if (this.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  update(dt: number) {
    // rotation
    this.worldCamera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    // keep camera up
    this.camera.rotation.y = 0;
    this.camera.rotation.z = 0;

    // movement input vector
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    // yaw based vectors
    forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const input = new THREE.Vector3();
    if (this.keys.has("KeyW")) input.add(forward);
    if (this.keys.has("KeyS")) input.sub(forward);
    if (this.keys.has("KeyA")) input.sub(right);
    if (this.keys.has("KeyD")) input.add(right);

    // normalize horizontal
    const hasInput = input.lengthSq() > 0;
    if (hasInput) input.normalize();

    // flying vertical
    let vertical = 0;
    if (this.flying) {
      if (this.keys.has("Space")) vertical += 1;
      if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.keys.has("ControlLeft")) vertical -= 1;
      // also allow Q/E? We'll keep shift.
    }

    const speed = this.flying ? this.flySpeed * (this.keys.has("ShiftLeft") && !this.flying ? 1.6 : 1) : this.moveSpeed;
    // sprint when flying? Hold shift already down; use Ctrl for faster? Simplify: if flying and holding Control, faster
    const actualSpeed = this.keys.has("ControlLeft") && this.flying ? speed * 1.8 : speed;

    if (this.flying) {
      // flying movement: direct velocity, with damping
      const wish = new THREE.Vector3();
      wish.addScaledVector(input, actualSpeed);
      wish.y = vertical * actualSpeed;

      // simple lerp for smoothness, but we directly move with collision per axis
      const move = wish.multiplyScalar(dt);
      this.moveWithCollision(move);
      this.onGround = false;
      this.vel.set(0, 0, 0); // flying decouples from gravity
    } else {
      // gravity
      this.vel.y -= this.gravity * dt;

      // horizontal velocity from input
      const horizVel = new THREE.Vector3(input.x * speed, 0, input.z * speed);
      // apply
      this.vel.x = horizVel.x;
      this.vel.z = horizVel.z;

      // integrate and collide
      const move = this.vel.clone().multiplyScalar(dt);
      // Y first
      this.moveWithCollision(new THREE.Vector3(0, move.y, 0));
      // XZ
      this.moveWithCollision(new THREE.Vector3(move.x, 0, move.z));

      // ground check slightly below feet
      const feetPos = this.pos.clone();
      feetPos.y -= 0.05;
      const wasOnGround = this.onGround;
      this.onGround = this.collides(new THREE.Vector3(feetPos.x, feetPos.y - 0.02, feetPos.z)) || this.isSolidAt(this.pos.x, this.pos.y - 0.1, this.pos.z);
      // actually more accurate: check block below feet
      const below = this.isSolidAt(this.pos.x, Math.floor(this.pos.y - 0.02), this.pos.z) ||
                    this.isSolidAt(this.pos.x + this.radius, Math.floor(this.pos.y - 0.02), this.pos.z) ||
                    this.isSolidAt(this.pos.x - this.radius, Math.floor(this.pos.y - 0.02), this.pos.z) ||
                    this.isSolidAt(this.pos.x, Math.floor(this.pos.y - 0.02), this.pos.z + this.radius) ||
                    this.isSolidAt(this.pos.x, Math.floor(this.pos.y - 0.02), this.pos.z - this.radius);
      this.onGround = below && this.vel.y <= 0.01;

      if (this.onGround && this.vel.y < 0) this.vel.y = 0;
      if (!wasOnGround && this.onGround) {
        // landed
      }
      // prevent falling through below 0
      if (this.pos.y < 1) {
        this.pos.y = 1;
        this.vel.y = 0;
        this.onGround = true;
      }
      // falling into void reset?
      if (this.pos.y < -20) {
        this.pos.set(0, 60, 0);
        this.vel.set(0,0,0);
      }
    }

    // update camera world position
    this.worldCamera.position.copy(this.pos);
    this.worldCamera.position.y += this.eyeHeight;
  }

  private moveWithCollision(delta: THREE.Vector3) {
    // axis separated
    if (delta.x !== 0) {
      const tryPos = this.pos.clone();
      tryPos.x += delta.x;
      if (!this.collides(tryPos)) {
        this.pos.x = tryPos.x;
      } else {
        // step to wall: binary search small
        // try sliding reduced
        let remaining = delta.x;
        const step = Math.sign(remaining) * 0.02;
        while (Math.abs(remaining) > 0.001) {
          const s = Math.abs(remaining) < Math.abs(step) ? remaining : step;
          const tp = this.pos.clone(); tp.x += s;
          if (!this.collides(tp)) { this.pos.x = tp.x; remaining -= s; } else { break; }
        }
        this.vel.x = 0;
      }
    }
    if (delta.y !== 0) {
      const tryPos = this.pos.clone();
      tryPos.y += delta.y;
      if (!this.collides(tryPos)) {
        this.pos.y = tryPos.y;
      } else {
        if (delta.y < 0) this.onGround = true;
        this.vel.y = 0;
        // try to not embed
        let remaining = delta.y;
        const step = Math.sign(remaining) * 0.02;
        while (Math.abs(remaining) > 0.001) {
          const s = Math.abs(remaining) < Math.abs(step) ? remaining : step;
          const tp = this.pos.clone(); tp.y += s;
          if (!this.collides(tp)) { this.pos.y = tp.y; remaining -= s; } else { break; }
        }
      }
    }
    if (delta.z !== 0) {
      const tryPos = this.pos.clone();
      tryPos.z += delta.z;
      if (!this.collides(tryPos)) {
        this.pos.z = tryPos.z;
      } else {
        let remaining = delta.z;
        const step = Math.sign(remaining) * 0.02;
        while (Math.abs(remaining) > 0.001) {
          const s = Math.abs(remaining) < Math.abs(step) ? remaining : step;
          const tp = this.pos.clone(); tp.z += s;
          if (!this.collides(tp)) { this.pos.z = tp.z; remaining -= s; } else { break; }
        }
        this.vel.z = 0;
      }
    }
  }

  getEyePos(): THREE.Vector3 {
    const p = this.pos.clone(); p.y += this.eyeHeight; return p;
  }
  getLookDir(): THREE.Vector3 {
    const dir = new THREE.Vector3(0,0,-1);
    dir.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ")));
    return dir;
  }

  // spawn safely: find ground height
  spawnAt(wx: number, wz: number) {
    // find highest solid
    let y = CHUNK_HEIGHT - 1;
    for (; y >= 0; y--) {
      const id = this.world.getBlock(wx, y, wz);
      if (id !== Block.AIR && id !== Block.WATER && id !== Block.GLASS) break;
    }
    const spawnY = Math.max(y + 2, 36);
    this.pos.set(wx, spawnY, wz);
    this.vel.set(0,0,0);
    this.yaw = Math.PI * 0.15;
    this.pitch = -0.22;
  }
}
