/**
 * Block highlight: a thin dark outline around the block the crosshair targets.
 */
import * as THREE from "three"
import type { RayHit } from "../core/raycast"

export class BlockHighlight {
  readonly lines: THREE.LineSegments

  constructor(scene: THREE.Scene) {
    const box = new THREE.BoxGeometry(1.004, 1.004, 1.004)
    this.lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: 0x0f140f, transparent: true, opacity: 0.8 }),
    )
    box.dispose()
    this.lines.visible = false
    this.lines.renderOrder = 3
    scene.add(this.lines)
  }

  set(hit: RayHit | null): void {
    if (!hit) {
      this.lines.visible = false
      return
    }
    this.lines.visible = true
    this.lines.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
  }

  dispose(): void {
    this.lines.geometry.dispose()
    ;(this.lines.material as THREE.Material).dispose()
    this.lines.removeFromParent()
  }
}
