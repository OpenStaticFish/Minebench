/**
 * Voxel raycast (Amanatides & Woo grid traversal).
 *
 * Walks the ray cell by cell, so it never skips a thin block and returns the
 * exact face that was hit — which is where a new block gets placed.
 */
import { B } from "./blocks"

export interface RayHit {
  x: number
  y: number
  z: number
  /** Face normal pointing back at the ray origin. */
  nx: number
  ny: number
  nz: number
  /** Distance along the ray to the hit face. */
  distance: number
  id: number
}

export type TargetPredicate = (id: number) => boolean

/** Anything except air and water can be targeted (water is replaced when placing). */
export const defaultTarget: TargetPredicate = (id) => id !== B.Air && id !== B.Water

export function raycastVoxel(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
  getBlock: (x: number, y: number, z: number) => number,
  isTarget: TargetPredicate = defaultTarget,
): RayHit | null {
  let x = Math.floor(ox)
  let y = Math.floor(oy)
  let z = Math.floor(oz)
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Number.POSITIVE_INFINITY
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Number.POSITIVE_INFINITY
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Number.POSITIVE_INFINITY
  let tMaxX = stepX > 0 ? (x + 1 - ox) / dx : stepX < 0 ? (x - ox) / dx : Number.POSITIVE_INFINITY
  let tMaxY = stepY > 0 ? (y + 1 - oy) / dy : stepY < 0 ? (y - oy) / dy : Number.POSITIVE_INFINITY
  let tMaxZ = stepZ > 0 ? (z + 1 - oz) / dz : stepZ < 0 ? (z - oz) / dz : Number.POSITIVE_INFINITY

  const maxSteps = Math.ceil(maxDistance * 3) + 3
  for (let i = 0; i < maxSteps; i++) {
    let t: number
    let nx = 0
    let ny = 0
    let nz = 0
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX
      t = tMaxX
      tMaxX += tDeltaX
      nx = -stepX
    } else if (tMaxY < tMaxZ) {
      y += stepY
      t = tMaxY
      tMaxY += tDeltaY
      ny = -stepY
    } else {
      z += stepZ
      t = tMaxZ
      tMaxZ += tDeltaZ
      nz = -stepZ
    }
    if (t > maxDistance) return null
    const id = getBlock(x, y, z)
    if (isTarget(id)) return { x, y, z, nx, ny, nz, distance: t, id }
  }
  return null
}
