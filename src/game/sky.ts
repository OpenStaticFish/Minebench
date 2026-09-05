import * as THREE from "three";
import { Noise } from "./noise";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunTint;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  // Warm glow around the sun.
  float sunAmt = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
  col += uSunTint * pow(sunAmt, 6.0) * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;

const ZENITH = new THREE.Color("#5aa7d9");
const HORIZON = new THREE.Color("#d8ecf4");
const SUN_TINT = new THREE.Color("#ffe9b8");
export const FOG_COLOR = new THREE.Color("#cfe6f0");
const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.3).normalize();
const CLOUD_Y = 96;

function makeCloudTexture(): THREE.Texture {
  const cells = 48;
  const px = 8;
  const canvas = document.createElement("canvas");
  canvas.width = cells * px;
  canvas.height = cells * px;
  const ctx = canvas.getContext("2d")!;
  const n = new Noise(777);
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const v = n.fbm2(cx * 0.16, cy * 0.16, 3);
      if (v > 0.22) {
        const alpha = Math.min(1, (v - 0.22) * 6);
        ctx.fillStyle = `rgba(255,255,255,${(0.85 * alpha).toFixed(2)})`;
        ctx.fillRect(cx * px, cy * px, px, px);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.repeat.set(5, 5);
  return tex;
}

function makeSunDisc(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, "rgba(255,246,214,1)");
  g.addColorStop(0.25, "rgba(255,240,190,0.9)");
  g.addColorStop(1, "rgba(255,240,190,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/** Gradient sky dome, sun disc, directional light and blocky procedural clouds. */
export class Sky {
  private dome: THREE.Mesh;
  private clouds: THREE.Mesh;
  private sun: THREE.Sprite;
  private cloudTexture: THREE.Texture;

  constructor(
    scene: THREE.Scene,
    view: { fogNear: number; fogFar: number },
  ) {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 24, 12),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: {
          uZenith: { value: ZENITH },
          uHorizon: { value: HORIZON },
          uSunDir: { value: SUN_DIR },
          uSunTint: { value: SUN_TINT },
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    scene.fog = new THREE.Fog(FOG_COLOR, view.fogNear, view.fogFar);

    this.sun = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeSunDisc(), fog: false, depthWrite: false, transparent: true }),
    );
    this.sun.scale.setScalar(180);
    this.sun.position.copy(SUN_DIR).multiplyScalar(900);
    scene.add(this.sun);

    this.cloudTexture = makeCloudTexture();
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshBasicMaterial({
        map: this.cloudTexture,
        transparent: true,
        depthWrite: false,
        fog: false,
        opacity: 0.9,
      }),
    );
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = CLOUD_Y;
    this.clouds.renderOrder = -9;
    scene.add(this.clouds);
  }

  setCloudsVisible(v: boolean): void {
    (this.clouds.material as THREE.MeshBasicMaterial).opacity = v ? 0.9 : 0;
    (this.clouds.material as THREE.MeshBasicMaterial).visible = v;
    this.clouds.visible = v;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.dome.position.copy(camera.position);
    this.sun.position.copy(SUN_DIR).multiplyScalar(900).add(camera.position);
    this.clouds.position.x = camera.position.x;
    this.clouds.position.z = camera.position.z;
    this.cloudTexture.offset.x += dt * 0.004;
    this.cloudTexture.offset.y += dt * 0.0015;
  }

  dispose(scene: THREE.Scene): void {
    for (const obj of [this.dome, this.clouds, this.sun]) {
      scene.remove(obj);
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = (obj as THREE.Mesh).material as THREE.Material | undefined;
      mat?.dispose();
    }
    this.cloudTexture.dispose();
  }
}

/** Sun direction, shared by sky + lighting setup. */
export const LIGHT_DIR = SUN_DIR;
