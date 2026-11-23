/**
 * Block-break particles: a fixed-size pool rendered as one THREE.Points draw
 * call. Colours come from the broken block's texture so debris matches terrain.
 */
import * as THREE from "three"

const MAX = 240
const HIDDEN_Y = -1e4

export class Particles {
  readonly points: THREE.Points
  private readonly positions = new Float32Array(MAX * 3)
  private readonly colors = new Float32Array(MAX * 3)
  private readonly velocities = new Float32Array(MAX * 3)
  private readonly life = new Float32Array(MAX)
  private cursor = 0

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry()
    const positionAttr = new THREE.BufferAttribute(this.positions, 3)
    const colorAttr = new THREE.BufferAttribute(this.colors, 3)
    positionAttr.setUsage(THREE.DynamicDrawUsage)
    colorAttr.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute("position", positionAttr)
    geometry.setAttribute("color", colorAttr)
    this.positions.fill(HIDDEN_Y)
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: 0.16, vertexColors: true, depthWrite: false }),
    )
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  burst(x: number, y: number, z: number, color: THREE.Color, count = 16): void {
    for (let i = 0; i < count; i++) {
      const idx = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      const p = idx * 3
      this.positions[p] = x + 0.2 + Math.random() * 0.6
      this.positions[p + 1] = y + 0.2 + Math.random() * 0.6
      this.positions[p + 2] = z + 0.2 + Math.random() * 0.6
      this.velocities[p] = (Math.random() - 0.5) * 4
      this.velocities[p + 1] = 2 + Math.random() * 3.5
      this.velocities[p + 2] = (Math.random() - 0.5) * 4
      const shade = 0.75 + Math.random() * 0.5
      this.colors[p] = color.r * shade
      this.colors[p + 1] = color.g * shade
      this.colors[p + 2] = color.b * shade
      this.life[idx] = 0.45 + Math.random() * 0.4
    }
  }

  update(dt: number): void {
    let any = false
    for (let i = 0; i < MAX; i++) {
      if (this.life[i]! <= 0) continue
      any = true
      const p = i * 3
      this.life[i] = this.life[i]! - dt
      if (this.life[i]! <= 0) {
        this.positions[p + 1] = HIDDEN_Y
        continue
      }
      const vy = this.velocities[p + 1]! - 18 * dt
      this.velocities[p + 1] = vy
      this.positions[p] = this.positions[p]! + this.velocities[p]! * dt
      this.positions[p + 1] = this.positions[p + 1]! + vy * dt
      this.positions[p + 2] = this.positions[p + 2]! + this.velocities[p + 2]! * dt
    }
    if (any) {
      this.points.geometry.getAttribute("position").needsUpdate = true
      this.points.geometry.getAttribute("color").needsUpdate = true
    }
  }

  dispose(): void {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
    this.points.removeFromParent()
  }
}
