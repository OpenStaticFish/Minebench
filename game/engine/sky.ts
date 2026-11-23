/**
 * Sky dome: a camera-centred sphere with a procedural gradient and sun.
 * Rendered first with depth testing off so terrain always draws over it.
 */
import * as THREE from "three"
import { createSkyMaterial } from "./materials"

const RADIUS = 900

export class Sky {
  readonly mesh: THREE.Mesh

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), createSkyMaterial())
    this.mesh.scale.setScalar(RADIUS)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -10
    scene.add(this.mesh)
  }

  update(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.removeFromParent()
  }
}
