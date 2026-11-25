import { Block, HEIGHT } from './world';

type Cell = [number, number, number];
type Target = { hit: Cell; place: Cell };

interface ReadableWorld {
  get(x: number, y: number, z: number): Block;
}

interface EditableWorld extends ReadableWorld {
  set(x: number, y: number, z: number, block: Block): boolean;
}

const HALF_WIDTH = 0.3;
const BODY_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const REACH = 6;
const WALK_SPEED = 4.8;
const FLIGHT_SPEED = 9;
const GRAVITY = 23;
const JUMP_SPEED = 7.9;
const TERMINAL_SPEED = 40;
const EPSILON = 1e-8;

const solid = (block: Block) => block !== Block.Air && block !== Block.Water;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));

/** Distance along a ray to the first voxel boundary in this dimension. */
function firstBoundary(origin: number, cell: number, direction: number): number {
  if (direction === 0) return Infinity;
  return (cell + (direction > 0 ? 1 : 0) - origin) / direction;
}

export class Player {
  /** Horizontal center and bottom of the player's collision box. */
  public y: number;
  public yaw = 0;
  public pitch = 0;
  public flying = false;
  public grounded = false;
  private verticalSpeed = 0;

  constructor(
    public x: number,
    feetY: number,
    public z: number,
  ) {
    this.y = feetY;
  }

  get eyeY(): number {
    return this.y + EYE_HEIGHT;
  }

  look(dx: number, dy: number, sensitivity: number): void {
    const scale = 0.002 * clamp(sensitivity, 0.3, 2);
    this.yaw = (this.yaw - dx * scale) % (2 * Math.PI);
    this.pitch = clamp(this.pitch - dy * scale, -Math.PI / 2, Math.PI / 2);
  }

  jump(): void {
    if (!this.grounded || this.flying) return;
    this.verticalSpeed = JUMP_SPEED;
    this.grounded = false;
  }

  toggleFlight(): void {
    this.flying = !this.flying;
    this.verticalSpeed = 0;
    this.grounded = false;
  }

  /** dt is elapsed simulation time in seconds. Discard tab-resume backlogs. */
  move(dt: number, keys: ReadonlySet<string>, world: ReadableWorld): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const elapsed = Math.min(dt, 0.25);
    const steps = Math.ceil(elapsed * 90);
    const step = elapsed / steps;
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const up = keys.has('Space');
    const down = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const norm = Math.max(1, Math.hypot(forward, strafe));
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    const vx = (strafe * c - forward * s) / norm;
    const vz = (-forward * c - strafe * s) / norm;

    for (let i = 0; i < steps; i++) {
      const wet =
        !this.flying &&
        world.get(Math.floor(this.x), Math.floor(this.y + 0.05), Math.floor(this.z)) ===
          Block.Water;
      const speed = this.flying ? FLIGHT_SPEED : wet ? 3 : WALK_SPEED;
      this.slide('x', vx * speed * step, world);
      this.slide('z', vz * speed * step, world);

      if (this.flying) this.verticalSpeed = (Number(up) - Number(down)) * FLIGHT_SPEED;
      else if (wet) this.verticalSpeed = up ? 4.5 : Math.max(-2.5, this.verticalSpeed - 7 * step);
      else this.verticalSpeed = Math.max(-TERMINAL_SPEED, this.verticalSpeed - GRAVITY * step);

      const blocked = this.slide('y', this.verticalSpeed * step, world);
      this.grounded = !this.flying && blocked && this.verticalSpeed < 0;
      if (blocked) this.verticalSpeed = 0;
    }
  }

  /** Each substep is shorter than a voxel: only the advancing face needs testing. */
  private slide(axis: 'x' | 'y' | 'z', delta: number, world: ReadableWorld): boolean {
    if (delta === 0) return false;
    const next = this[axis] + delta;
    const positive = delta > 0;
    const extent =
      axis === 'y' ? (positive ? BODY_HEIGHT : 0) : positive ? HALF_WIDTH : -HALF_WIDTH;
    const face = Math.floor(next + extent + (positive ? -EPSILON : EPSILON));
    const x0 = axis === 'x' ? face : Math.floor(this.x - HALF_WIDTH + EPSILON);
    const x1 = axis === 'x' ? face : Math.floor(this.x + HALF_WIDTH - EPSILON);
    const y0 = axis === 'y' ? face : Math.floor(this.y + EPSILON);
    const y1 = axis === 'y' ? face : Math.floor(this.y + BODY_HEIGHT - EPSILON);
    const z0 = axis === 'z' ? face : Math.floor(this.z - HALF_WIDTH + EPSILON);
    const z1 = axis === 'z' ? face : Math.floor(this.z + HALF_WIDTH - EPSILON);
    for (let y = y0; y <= y1; y++) {
      if (y >= HEIGHT) continue;
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (y < 0 || solid(world.get(x, y, z))) {
            this[axis] = face + (positive ? 0 : 1) - extent;
            return true;
          }
        }
      }
    }
    this[axis] = next;
    return false;
  }

  target(world: ReadableWorld): Target | null {
    const ox = this.x,
      oy = this.eyeY,
      oz = this.z;
    const horizontal = Math.cos(this.pitch);
    // Exact cardinal camera angles can still produce tiny trigonometric residues.
    const clean = (d: number) => (Math.abs(d) < 1e-12 ? 0 : d);
    const dx = clean(-Math.sin(this.yaw) * horizontal);
    const dy = clean(Math.sin(this.pitch));
    const dz = clean(-Math.cos(this.yaw) * horizontal);
    let x = Math.floor(ox),
      y = Math.floor(oy),
      z = Math.floor(oz);
    let tx = firstBoundary(ox, x, dx);
    let ty = firstBoundary(oy, y, dy);
    let tz = firstBoundary(oz, z, dz);
    const sx = Math.sign(dx),
      sy = Math.sign(dy),
      sz = Math.sign(dz);
    const strideX = Math.abs(1 / dx),
      strideY = Math.abs(1 / dy),
      strideZ = Math.abs(1 / dz);
    // DDA visits only crossed cells. Step all tied axes at edges and corners:
    // grazing a solid with zero path length must not hide the block behind it.
    while (true) {
      const t = Math.min(tx, ty, tz);
      if (t > REACH) return null;
      const crossX = tx <= t + 1e-12,
        crossY = ty <= t + 1e-12,
        crossZ = tz <= t + 1e-12;
      if (crossX) {
        x += sx;
        tx += strideX;
      }
      if (crossY) {
        y += sy;
        ty += strideY;
      }
      if (crossZ) {
        z += sz;
        tz += strideZ;
      }
      if (y < 0 || y >= HEIGHT || !solid(world.get(x, y, z))) continue;
      const place: Cell = [x, y, z];
      if (crossX) place[0] -= sx;
      else if (crossY) place[1] -= sy;
      else place[2] -= sz;
      return { hit: [x, y, z], place };
    }
  }

  edit(world: EditableWorld, mode: 'break' | 'place', block: Block): Cell | null {
    const target = this.target(world);
    if (!target) return null;
    const cell = mode === 'break' ? target.hit : target.place;
    const [x, y, z] = cell;
    if (y < 0 || y >= HEIGHT) return null;
    if (mode === 'place') {
      if (block === Block.Air || solid(world.get(x, y, z))) return null;
      if (
        x < this.x + HALF_WIDTH - EPSILON &&
        x + 1 > this.x - HALF_WIDTH + EPSILON &&
        y < this.y + BODY_HEIGHT - EPSILON &&
        y + 1 > this.y + EPSILON &&
        z < this.z + HALF_WIDTH - EPSILON &&
        z + 1 > this.z - HALF_WIDTH + EPSILON
      )
        return null;
    }
    return world.set(x, y, z, mode === 'break' ? Block.Air : block) ? cell : null;
  }
}
