/**
 * Clouds: a flat, blocky cloud layer that drifts slowly across the sky.
 *
 * A grid of cells is filled from seeded 2D noise; each filled cell contributes
 * top/bottom quads plus side quads on its exposed edges, merged into a single
 * BufferGeometry (one draw call). The grid re-centres on the camera as it moves.
 */
import * as THREE from "three"
import { SimplexNoise } from "../core/noise"

const CELL = 12
const THICKNESS = 6
const GRID = 56
const HALF = GRID / 2

export class Clouds {
  readonly mesh: THREE.Mesh
  private noise: SimplexNoise
  private lastCellX = Number.NaN
  private lastCellZ = Number.NaN

  constructor(
    scene: THREE.Scene,
    material: THREE.Material,
    seed: number,
    readonly height: number,
  ) {
    this.noise = new SimplexNoise(seed ^ 0xc10d)
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    scene.add(this.mesh)
  }

  reseed(seed: number): void {
    this.noise = new SimplexNoise(seed ^ 0xc10d)
    this.lastCellX = Number.NaN
  }

  update(time: number, x: number, z: number): void {
    const drift = time * 1.4
    const cellX = Math.floor((x - drift) / CELL)
    const cellZ = Math.floor(z / CELL)
    if (cellX !== this.lastCellX || cellZ !== this.lastCellZ) {
      this.lastCellX = cellX
      this.lastCellZ = cellZ
      this.rebuild(cellX, cellZ)
    }
    this.mesh.position.set(drift, this.height, 0)
  }

  private filled(cx: number, cz: number): boolean {
    return this.noise.fbm2(cx * 0.09, cz * 0.09, 3) > 0.22
  }

  private rebuild(cellX: number, cellZ: number): void {
    const positions: number[] = []
    const indices: number[] = []
    const cells: boolean[] = new Array(GRID * GRID)
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        cells[i + j * GRID] = this.filled(cellX - HALF + i, cellZ - HALF + j)
      }
    }
    const at = (i: number, j: number) =>
      i >= 0 && i < GRID && j >= 0 && j < GRID && cells[i + j * GRID] === true

    // Quad with corners in CCW order seen from the direction of `normal`.
    const quad = (a: number[], b: number[], c: number[], d: number[]) => {
      const base = positions.length / 3
      positions.push(...a, ...b, ...c, ...d)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }

    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        if (!at(i, j)) continue
        const x0 = (i - HALF) * CELL
        const z0 = (j - HALF) * CELL
        const x1 = x0 + CELL
        const z1 = z0 + CELL
        const top = THICKNESS
        // top (normal +Y): CCW from above
        quad([x0, top, z1], [x1, top, z1], [x1, top, z0], [x0, top, z0])
        // bottom (normal -Y): CCW from below
        quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1])
        // sides where the neighbour cell is empty
        if (!at(i + 1, j)) quad([x1, 0, z1], [x1, 0, z0], [x1, top, z0], [x1, top, z1])
        if (!at(i - 1, j)) quad([x0, 0, z0], [x0, 0, z1], [x0, top, z1], [x0, top, z0])
        if (!at(i, j + 1)) quad([x0, 0, z1], [x1, 0, z1], [x1, top, z1], [x0, top, z1])
        if (!at(i, j - 1)) quad([x1, 0, z0], [x0, 0, z0], [x0, top, z0], [x1, top, z0])
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    this.mesh.geometry.dispose()
    this.mesh.geometry = geometry
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.removeFromParent()
  }
}
