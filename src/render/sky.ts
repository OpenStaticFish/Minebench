import * as THREE from "three";
import { FOG_FAR_FACTOR, FOG_NEAR_FACTOR, PALETTE } from "../core/constants";
import { mulberry32 } from "../core/rng";

const SUN_DIRECTION = new THREE.Vector3(0.45, 0.78, 0.32).normalize();
const CLOUD_COUNT = 26;
const CLOUD_FIELD = 540;
const CLOUD_BASE_Y = 112;

interface CloudPuff {
  cloud: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

interface Cloud {
  x: number;
  z: number;
  y: number;
  speed: number;
}

/**
 * Sky dome (gradient + sun glow), drifting blocky clouds and the scene's
 * lighting + fog. Fog distance is tied to the chunk view distance so chunk
 * pop-in is hidden behind the horizon haze.
 */
export class Sky {
  readonly hemiLight: THREE.HemisphereLight;
  readonly sunLight: THREE.DirectionalLight;
  private readonly dome: THREE.Mesh;
  private readonly domeMaterial: THREE.ShaderMaterial;
  private readonly cloudMesh: THREE.InstancedMesh;
  private readonly clouds: Cloud[] = [];
  private readonly puffs: CloudPuff[] = [];
  private readonly matrix = new THREE.Matrix4();
  private elapsed = 0;
  private viewDistance = 6;
  private cloudsEnabled = true;
  private underwater = false;

  constructor() {
    this.hemiLight = new THREE.HemisphereLight(PALETTE.ambient, PALETTE.groundBounce, 0.95);
    this.sunLight = new THREE.DirectionalLight(PALETTE.sun, 1.35);
    this.sunLight.position.copy(SUN_DIRECTION).multiplyScalar(120);

    this.domeMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(PALETTE.skyZenith) },
        horizonColor: { value: new THREE.Color(PALETTE.skyHorizon) },
        sunDirection: { value: SUN_DIRECTION.clone() },
        sunColor: { value: new THREE.Color(0xfff0c9) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        varying vec3 vDirection;
        void main() {
          vec3 direction = normalize(vDirection);
          float height = clamp(direction.y, 0.0, 1.0);
          vec3 color = mix(horizonColor, topColor, pow(height, 0.62));
          float sunDot = max(dot(direction, sunDirection), 0.0);
          float sunDisc = pow(sunDot, 320.0);
          float sunGlow = pow(sunDot, 7.0) * 0.28;
          color += sunColor * (sunDisc * 0.95 + sunGlow);
          color = mix(color, horizonColor * 0.86, smoothstep(0.0, -0.22, direction.y));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.domeMaterial);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;

    const random = mulberry32(0x5eedc10d);
    for (let i = 0; i < CLOUD_COUNT; i++) {
      this.clouds.push({
        x: (random() - 0.5) * CLOUD_FIELD * 2,
        z: (random() - 0.5) * CLOUD_FIELD * 2,
        y: CLOUD_BASE_Y + random() * 16,
        speed: 1.2 + random() * 2.4,
      });
      const puffCount = 4 + Math.floor(random() * 4);
      for (let p = 0; p < puffCount; p++) {
        const spread = 5 + random() * 12;
        this.puffs.push({
          cloud: i,
          offsetX: (random() - 0.5) * spread * 2,
          offsetY: (random() - 0.5) * 2.4,
          offsetZ: (random() - 0.5) * spread,
          scaleX: 7 + random() * 13,
          scaleY: 2 + random() * 2.6,
          scaleZ: 7 + random() * 12,
        });
      }
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({
      color: 0xf7fbff,
      transparent: true,
      opacity: 0.92,
    });
    this.cloudMesh = new THREE.InstancedMesh(geometry, material, this.puffs.length);
    this.cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cloudMesh.frustumCulled = false;
    this.cloudMesh.renderOrder = -1;
    this.updateCloudMatrices();
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.dome);
    scene.add(this.cloudMesh);
    scene.add(this.hemiLight);
    scene.add(this.sunLight);
    this.applyFog(scene);
  }

  setViewDistance(scene: THREE.Scene, chunks: number): void {
    this.viewDistance = chunks;
    this.applyFog(scene);
  }

  setCloudsEnabled(enabled: boolean): void {
    this.cloudsEnabled = enabled;
    this.cloudMesh.visible = enabled;
  }

  setUnderwater(scene: THREE.Scene, underwater: boolean): void {
    if (this.underwater === underwater) return;
    this.underwater = underwater;
    this.applyFog(scene);
  }

  private applyFog(scene: THREE.Scene): void {
    const far = this.viewDistance * 16 * FOG_FAR_FACTOR;
    const near = far * FOG_NEAR_FACTOR;
    if (this.underwater) {
      const fog = new THREE.Fog(0x2f6fae, 0.2, Math.min(34, far));
      scene.fog = fog;
    } else {
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.setHex(PALETTE.fogDay);
        scene.fog.near = near;
        scene.fog.far = far;
      } else {
        scene.fog = new THREE.Fog(PALETTE.fogDay, near, far);
      }
    }
    const radius = Math.max(320, far * 2.4);
    this.dome.scale.setScalar(radius);
    this.domeMaterial.uniforms.sunDirection!.value = SUN_DIRECTION;
  }

  update(deltaSeconds: number, cameraPosition: THREE.Vector3): void {
    this.elapsed += deltaSeconds;
    this.dome.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    if (!this.cloudsEnabled) return;

    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * deltaSeconds;
      if (cloud.x > CLOUD_FIELD) cloud.x -= CLOUD_FIELD * 2;
    }
    this.updateCloudMatrices();
  }

  private updateCloudMatrices(): void {
    for (let i = 0; i < this.puffs.length; i++) {
      const puff = this.puffs[i] as CloudPuff;
      const cloud = this.clouds[puff.cloud] as Cloud;
      this.matrix.makeScale(puff.scaleX, puff.scaleY, puff.scaleZ);
      this.matrix.setPosition(
        cloud.x + puff.offsetX,
        cloud.y + puff.offsetY,
        cloud.z + puff.offsetZ,
      );
      this.cloudMesh.setMatrixAt(i, this.matrix);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.domeMaterial.dispose();
    this.cloudMesh.geometry.dispose();
    (this.cloudMesh.material as THREE.Material).dispose();
    this.cloudMesh.dispose();
  }
}
