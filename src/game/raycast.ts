import * as THREE from "three";
import { Block } from "./blocks";
import type { World } from "./world";

export interface Hit {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number; // normal of face hit (from block outward)
  blockId: number;
}

export function raycast(world: World, origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 7): Hit | null {
  // DDA voxel traversal
  const pos = origin.clone();
  let ix = Math.floor(pos.x);
  let iy = Math.floor(pos.y);
  let iz = Math.floor(pos.z);

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  const tDeltaX = dir.x === 0 ? Infinity : Math.abs(1 / dir.x);
  const tDeltaY = dir.y === 0 ? Infinity : Math.abs(1 / dir.y);
  const tDeltaZ = dir.z === 0 ? Infinity : Math.abs(1 / dir.z);

  const frac = (v: number) => v - Math.floor(v);
  let tMaxX = dir.x === 0 ? Infinity : (stepX > 0 ? (1 - frac(pos.x)) : frac(pos.x)) * tDeltaX;
  let tMaxY = dir.y === 0 ? Infinity : (stepY > 0 ? (1 - frac(pos.y)) : frac(pos.y)) * tDeltaY;
  let tMaxZ = dir.z === 0 ? Infinity : (stepZ > 0 ? (1 - frac(pos.z)) : frac(pos.z)) * tDeltaZ;

  let lastStep: "x"|"y"|"z" = "y";

  let t = 0;
  // check starting inside block? Step first
  for (let i = 0; i < 256; i++) {
    if (t > maxDist) break;
    const id = world.getBlock(ix, iy, iz);
    // Hit any non-air block so water/glass can be broken and placed upon.
    // Water is intentionally hittable so placed water can be removed; ray still stops at first non-air.
    const hitSolid = id !== Block.AIR;
    if (hitSolid) {
      // Determine normal based on last step
      let nx = 0, ny = 0, nz = 0;
      if (lastStep === "x") nx = -stepX;
      else if (lastStep === "y") ny = -stepY;
      else if (lastStep === "z") nz = -stepZ;
      // For first block (origin inside), normal zero; set based on direction?
      if (i === 0) { nx = 0; ny = 0; nz = 0; }
      return { x: ix, y: iy, z: iz, nx, ny, nz, blockId: id };
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        ix += stepX; t = tMaxX; tMaxX += tDeltaX; lastStep = "x";
      } else {
        iz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; lastStep = "z";
      }
    } else {
      if (tMaxY < tMaxZ) {
        iy += stepY; t = tMaxY; tMaxY += tDeltaY; lastStep = "y";
      } else {
        iz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; lastStep = "z";
      }
    }
  }
  return null;
}

export function getPlacePosition(hit: Hit): { x:number,y:number,z:number } | null {
  return { x: hit.x + hit.nx, y: hit.y + hit.ny, z: hit.z + hit.nz };
}
