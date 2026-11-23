/**
 * Axis-aligned box vs. voxel-grid collision.
 *
 * Movement is resolved one axis at a time (Y, then X, then Z): slide the box
 * along the axis and clamp it against the nearest solid cell it would enter.
 * The sweep covers every grid row between the box and its destination, so fast
 * moves cannot tunnel through thin walls.
 */
export interface Box {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

export type SolidQuery = (x: number, y: number, z: number) => boolean

export interface MoveResult {
  hitX: boolean
  hitY: boolean
  hitZ: boolean
}

/** Tiny gap kept between the box and blocks to avoid float jitter. */
const EPS = 1e-3
/** How far below the feet we look when testing for ground. */
const GROUND_PROBE = 0.02

const X = 0
const Y = 1
const Z = 2

export function boxOverlapsSolid(box: Box, isSolid: SolidQuery): boolean {
  const x0 = Math.floor(box.minX + EPS)
  const x1 = Math.floor(box.maxX - EPS)
  const y0 = Math.floor(box.minY + EPS)
  const y1 = Math.floor(box.maxY - EPS)
  const z0 = Math.floor(box.minZ + EPS)
  const z1 = Math.floor(box.maxZ - EPS)
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (isSolid(x, y, z)) return true
      }
    }
  }
  return false
}

/** Sweep `box` along `axis` by `d`, clamping against solids. Mutates the box. */
function sweepAxis(box: Box, axis: number, d: number, isSolid: SolidQuery): boolean {
  if (d === 0) return false
  const min = [box.minX, box.minY, box.minZ]
  const max = [box.maxX, box.maxY, box.maxZ]
  const [b, c] = axis === X ? [Y, Z] : axis === Y ? [X, Z] : [X, Y]
  const lo = [Math.floor(min[b]! + EPS), Math.floor(min[c]! + EPS)]
  const hi = [Math.floor(max[b]! - EPS), Math.floor(max[c]! - EPS)]
  const cell = [0, 0, 0]

  const rowHasSolid = (index: number): boolean => {
    cell[axis] = index
    for (let u = lo[0]!; u <= hi[0]!; u++) {
      cell[b] = u
      for (let v = lo[1]!; v <= hi[1]!; v++) {
        cell[c] = v
        if (isSolid(cell[X]!, cell[Y]!, cell[Z]!)) return true
      }
    }
    return false
  }

  let hit = false
  if (d > 0) {
    const target = Math.floor(max[axis]! + d - EPS)
    for (let i = Math.floor(max[axis]! - EPS) + 1; i <= target; i++) {
      if (rowHasSolid(i)) {
        d = Math.min(d, i - max[axis]! - EPS)
        hit = true
        break
      }
    }
  } else {
    const target = Math.floor(min[axis]! + d + EPS)
    for (let i = Math.floor(min[axis]! + EPS) - 1; i >= target; i--) {
      if (rowHasSolid(i)) {
        d = Math.max(d, i + 1 - min[axis]! + EPS)
        hit = true
        break
      }
    }
  }
  min[axis] = min[axis]! + d
  max[axis] = max[axis]! + d
  box.minX = min[X]!
  box.minY = min[Y]!
  box.minZ = min[Z]!
  box.maxX = max[X]!
  box.maxY = max[Y]!
  box.maxZ = max[Z]!
  return hit
}

export function moveBox(
  box: Box,
  dx: number,
  dy: number,
  dz: number,
  isSolid: SolidQuery,
): MoveResult {
  // Y first so landing on a ledge edge is resolved before horizontal sliding.
  const hitY = sweepAxis(box, Y, dy, isSolid)
  const hitX = sweepAxis(box, X, dx, isSolid)
  const hitZ = sweepAxis(box, Z, dz, isSolid)
  return { hitX, hitY, hitZ }
}

/** True when a solid cell sits directly beneath the box. */
export function isGrounded(box: Box, isSolid: SolidQuery): boolean {
  const y = Math.floor(box.minY - GROUND_PROBE)
  const x0 = Math.floor(box.minX + EPS)
  const x1 = Math.floor(box.maxX - EPS)
  const z0 = Math.floor(box.minZ + EPS)
  const z1 = Math.floor(box.maxZ - EPS)
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      if (isSolid(x, y, z)) return true
    }
  }
  return false
}
