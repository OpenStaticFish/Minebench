import * as THREE from "three";

/** Wireframe outline around the block the player is aiming at. */
export class BlockHighlight {
  readonly mesh: THREE.LineSegments;
  private readonly geometry: THREE.EdgesGeometry;
  private readonly material: THREE.LineBasicMaterial;

  constructor() {
    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    this.geometry = new THREE.EdgesGeometry(box);
    box.dispose();
    this.material = new THREE.LineBasicMaterial({
      color: 0xf5fafc,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.mesh = new THREE.LineSegments(this.geometry, this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
  }

  show(x: number, y: number, z: number): void {
    this.mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
