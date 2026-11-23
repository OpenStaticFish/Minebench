/**
 * Spawn selection: pick a dry, level, slightly elevated column near the origin
 * with an open line of sight toward the most interesting horizon (water and
 * high ground), so the first thing the player sees is a vista, not a cliff.
 *
 * Everything is derived from the seed, so a given seed always starts in the
 * same spot looking the same way — which also makes screenshots reproducible.
 */
import {
  BIOME_NAMES,
  Biome,
  type ColumnInfo,
  ROCK_LINE,
  SEA_LEVEL,
  type TerrainGenerator,
} from "./terrain"

export interface SpawnPoint {
  /** Feet position (centre of the column, standing on the surface block). */
  x: number
  y: number
  z: number
  /** Camera yaw/pitch in radians (three.js YXZ convention). */
  yaw: number
  pitch: number
  biome: string
}

const TAU = Math.PI * 2
const SEARCH_RADIUS = 48
const SEARCH_STEP = 4
const VISTA_DIRECTIONS = 16
/** Sample distances (blocks) along each vista ray, weighted by how far they are. */
const VISTA_SAMPLES = [3, 7, 12, 18, 26, 38, 56, 80]

interface Vista {
  yaw: number
  score: number
}

/**
 * Rate every direction from (x, z). A direction is "blocked" if ground within
 * ~20 blocks is higher than the player's head; otherwise it scores water and
 * mountains, weighted toward nearby water and distant peaks.
 */
function bestVista(gen: TerrainGenerator, x: number, z: number, height: number): Vista {
  let best: Vista = { yaw: 0, score: Number.NEGATIVE_INFINITY }
  for (let i = 0; i < VISTA_DIRECTIONS; i++) {
    const yaw = (i / VISTA_DIRECTIONS) * TAU
    const dx = -Math.sin(yaw)
    const dz = -Math.cos(yaw)
    let score = 0
    for (const t of VISTA_SAMPLES) {
      const px = Math.round(x + dx * t)
      const pz = Math.round(z + dz * t)
      const col = gen.column(px, pz)
      if (t <= 20 && col.height > height + 1) {
        score -= 6 // a near wall/ledge right in front of the camera
        continue
      }
      if (col.height < SEA_LEVEL) score += t <= 40 ? 3 : 1.5
      else if (col.height > height + 12) score += 2.5
      else if (col.height > height + 4) score += 0.5
      else if (t <= 56 && gen.treeAt(px, pz)) score += 1 // trees frame the view
    }
    if (score > best.score) best = { yaw, score }
  }
  return best
}

/** Canopies reach two blocks from the trunk, so anything closer shades the spawn. */
function hasNearbyTree(gen: TerrainGenerator, x: number, z: number): boolean {
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (gen.treeAt(x + dx, z + dz)) return true
    }
  }
  return false
}

export function findSpawn(gen: TerrainGenerator): SpawnPoint {
  let best: { x: number; z: number; col: ColumnInfo; yaw: number } = {
    x: 0,
    z: 0,
    col: gen.column(0, 0),
    yaw: 0,
  }
  let bestScore = Number.NEGATIVE_INFINITY

  for (let z = -SEARCH_RADIUS; z <= SEARCH_RADIUS; z += SEARCH_STEP) {
    for (let x = -SEARCH_RADIUS; x <= SEARCH_RADIUS; x += SEARCH_STEP) {
      const col = gen.column(x, z)
      // Dry, walkable, not a cliff top, and not underneath a tree canopy.
      if (col.height < SEA_LEVEL + 4 || col.height > ROCK_LINE) continue
      if (hasNearbyTree(gen, x, z)) continue

      let score = (col.height - SEA_LEVEL) * 0.3
      if (col.biome === Biome.Plains || col.biome === Biome.Forest) score += 10

      // Prefer level ground (checked close by) that sits a little above its
      // surroundings, so the view is open but the player is not on a knife edge.
      let minH = col.height
      let maxH = col.height
      let ringSum = 0
      let ringN = 0
      for (let dz = -6; dz <= 6; dz += 3) {
        for (let dx = -6; dx <= 6; dx += 3) {
          if (dx === 0 && dz === 0) continue
          const h = gen.column(x + dx, z + dz).height
          ringSum += h
          ringN++
          if (Math.max(Math.abs(dx), Math.abs(dz)) <= 3) {
            minH = Math.min(minH, h)
            maxH = Math.max(maxH, h)
          }
        }
      }
      score -= (maxH - minH) * 1.5
      score += (col.height - ringSum / ringN) * 0.8

      // A few trees nearby make the frame prettier, but keep the spawn column clear.
      let trees = 0
      const TREE_PROBES: ReadonlyArray<readonly [number, number]> = [
        [6, 0],
        [-6, 0],
        [0, 6],
        [0, -6],
        [9, 9],
        [-9, -9],
        [9, -9],
        [-9, 9],
      ]
      for (const [dx, dz] of TREE_PROBES) {
        if (gen.treeAt(x + dx, z + dz)) trees++
      }
      score += Math.min(trees, 4) * 1.2

      const vista = bestVista(gen, x, z, col.height)
      score += vista.score

      if (score > bestScore) {
        bestScore = score
        best = { x, z, col, yaw: vista.yaw }
      }
    }
  }

  return {
    x: best.x + 0.5,
    y: best.col.height + 1,
    z: best.z + 0.5,
    yaw: best.yaw,
    pitch: -0.06,
    biome: BIOME_NAMES[best.col.biome],
  }
}
