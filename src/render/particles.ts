import * as THREE from "three";

const POOL_SIZE = 180;

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

/** Small instanced debris burst when a block is broken. */
export class BreakParticles {
  readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private cursor = 0;

  constructor() {
    const geometry = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geometry, material, POOL_SIZE);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    for (let i = 0; i < POOL_SIZE; i++) {
      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
        active: false,
      });
      this.writeMatrix(i, 0);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(x: number, y: number, z: number, color: number, count = 10): void {
    for (let i = 0; i < count; i++) {
      const particle = this.particles[this.cursor] as Particle;
      this.cursor = (this.cursor + 1) % POOL_SIZE;
      particle.position.set(x + 0.5, y + 0.5, z + 0.5);
      particle.velocity.set(
        (Math.random() - 0.5) * 3.4,
        1.2 + Math.random() * 2.8,
        (Math.random() - 0.5) * 3.4,
      );
      particle.life = 0.45 + Math.random() * 0.5;
      particle.maxLife = particle.life;
      particle.size = 0.55 + Math.random() * 0.85;
      particle.active = true;
      this.mesh.setColorAt(this.cursor, this.color.setHex(color));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(deltaSeconds: number): void {
    let changed = false;
    for (let i = 0; i < POOL_SIZE; i++) {
      const particle = this.particles[i] as Particle;
      if (!particle.active) continue;
      particle.life -= deltaSeconds;
      if (particle.life <= 0) {
        particle.active = false;
        this.writeMatrix(i, 0);
        changed = true;
        continue;
      }
      particle.velocity.y -= 17 * deltaSeconds;
      particle.position.addScaledVector(particle.velocity, deltaSeconds);
      const fade = Math.min(1, particle.life / particle.maxLife);
      this.writeMatrix(i, particle.size * fade);
      changed = true;
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }

  private writeMatrix(index: number, scale: number): void {
    const particle = this.particles[index] as Particle;
    this.matrix.makeScale(scale, scale, scale);
    this.matrix.setPosition(particle.position.x, particle.position.y, particle.position.z);
    this.mesh.setMatrixAt(index, this.matrix);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
