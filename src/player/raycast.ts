export interface VoxelHit {
  /** Block coordinates of the hit block. */
  x: number;
  y: number;
  z: number;
  /** Face normal (unit axis) that was crossed to enter the block. */
  nx: number;
  ny: number;
  nz: number;
  distance: number;
  block: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Amanatides & Woo voxel traversal. Returns the first block along the ray that
 * the `isTarget` predicate accepts, plus which face was entered so placement
 * can put a block against it.
 */
export function raycastVoxels(
  origin: Vec3Like,
  direction: Vec3Like,
  maxDistance: number,
  getBlock: (x: number, y: number, z: number) => number,
  isTarget: (id: number) => boolean,
): VoxelHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);

  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? x + 1 - origin.x : origin.x - x) / Math.abs(dx);
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? y + 1 - origin.y : origin.y - y) / Math.abs(dy);
  let tMaxZ = dz === 0 ? Infinity : (dz > 0 ? z + 1 - origin.z : origin.z - z) / Math.abs(dz);

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let distance = 0;

  if (isTarget(getBlock(x, y, z))) {
    return { x, y, z, nx: 0, ny: 0, nz: 0, distance: 0, block: getBlock(x, y, z) };
  }

  while (distance <= maxDistance) {
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      x += stepX;
      distance = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY <= tMaxZ) {
      y += stepY;
      distance = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      distance = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }

    if (distance > maxDistance) return null;
    const block = getBlock(x, y, z);
    if (isTarget(block)) {
      return { x, y, z, nx, ny, nz, distance, block };
    }
  }

  return null;
}
