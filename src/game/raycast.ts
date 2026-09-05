import * as THREE from "three";
import { Block } from "./blocks";
import type { World } from "./world";

export interface RayHit {
  /** Voxel that was hit. */
  x: number;
  y: number;
  z: number;
  /** Face normal pointing back toward the ray origin. */
  nx: number;
  ny: number;
  nz: number;
}

/** Amanatides & Woo voxel DDA. Hits any non-air, non-water voxel. */
export function raycastVoxel(
  world: World,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number,
): RayHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = Math.sign(dir.x);
  const stepY = Math.sign(dir.y);
  const stepZ = Math.sign(dir.z);

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

  const distToBoundary = (p: number, s: number) => (s > 0 ? Math.ceil(p) - p : p - Math.floor(p));
  let tMaxX = stepX !== 0 ? distToBoundary(origin.x, stepX) * tDeltaX : Infinity;
  let tMaxY = stepY !== 0 ? distToBoundary(origin.y, stepY) * tDeltaY : Infinity;
  let tMaxZ = stepZ !== 0 ? distToBoundary(origin.z, stepZ) * tDeltaZ : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;

  for (let i = 0; i < 256; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== Block.Air && id !== Block.Water) {
      return { x, y, z, nx, ny, nz };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDist) break;
      x += stepX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDist) break;
      y += stepY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      if (tMaxZ > maxDist) break;
      z += stepZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }
  return null;
}
