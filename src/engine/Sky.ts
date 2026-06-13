import * as THREE from "three";
import { CHUNK_HEIGHT } from "../constants";

const ZENITH = new THREE.Color("#2f6fdb");
const HORIZON = new THREE.Color("#bfe3ff");

/** Builds the sky: gradient dome, sun light, ambient/hemisphere fill, clouds. */
export class Sky {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly ambient: THREE.AmbientLight;
  readonly hemi: THREE.HemisphereLight;

  private readonly dome: THREE.Mesh;
  private readonly cloudPlane: THREE.Mesh;
  private readonly cloudTexture: THREE.Texture;
  private readonly sunSprite: THREE.Sprite;
  private cloudsVisible = true;

  constructor() {
    // --- Sky dome (gradient shader) ---
    const domeGeo = new THREE.SphereGeometry(500, 32, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: ZENITH.clone() },
        bottomColor: { value: HORIZON.clone() },
        offset: { value: 33 },
        exponent: { value: 0.6 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          float t = max(pow(max(h, 0.0), exponent), 0.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(domeGeo, domeMat);
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // --- Lights ---
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.group.add(this.ambient);

    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a6b3a, 0.45);
    this.group.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
    this.sun.position.set(80, 140, 60);
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    // --- Sun disc ---
    const sunTex = makeRadialTexture("#fff6d8", "#ffd27a");
    const sunMat = new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, depthTest: false, fog: false });
    this.sunSprite = new THREE.Sprite(sunMat);
    this.sunSprite.scale.set(46, 46, 1);
    this.sunSprite.position.set(300, 260, 200);
    this.group.add(this.sunSprite);

    // --- Clouds ---
    this.cloudTexture = makeCloudTexture();
    this.cloudTexture.wrapS = THREE.RepeatWrapping;
    this.cloudTexture.wrapT = THREE.RepeatWrapping;
    this.cloudTexture.repeat.set(2, 2);
    const cloudMat = new THREE.MeshBasicMaterial({
      map: this.cloudTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    this.cloudPlane = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), cloudMat);
    this.cloudPlane.rotation.x = -Math.PI / 2;
    this.cloudPlane.position.y = CHUNK_HEIGHT + 26;
    this.cloudPlane.frustumCulled = false;
    this.group.add(this.cloudPlane);
  }

  setCloudsEnabled(enabled: boolean): void {
    this.cloudsVisible = enabled;
    this.cloudPlane.visible = enabled;
  }

  /** Advance cloud scroll and keep the sky anchored to the camera. */
  update(dt: number, cameraPosition: THREE.Vector3): void {
    if (this.cloudsVisible) {
      this.cloudTexture.offset.x += dt * 0.006;
      this.cloudTexture.offset.y += dt * 0.002;
    }
    this.dome.position.copy(cameraPosition);
    this.cloudPlane.position.x = cameraPosition.x;
    this.cloudPlane.position.z = cameraPosition.z;
    this.sun.target.position.copy(cameraPosition);
    this.sunSprite.position.copy(cameraPosition).add(new THREE.Vector3(300, 260, 200));
  }

  dispose(): void {
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.cloudPlane.geometry.dispose();
    (this.cloudPlane.material as THREE.Material).dispose();
    this.cloudTexture.dispose();
  }
}

function makeRadialTexture(inner: string, outer: string): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.5, outer);
  g.addColorStop(1, "rgba(255,210,120,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCloudTexture(): THREE.Texture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  // Soft puffy blobs.
  let seed = 99;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 46; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 28 + rand() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.6, "rgba(255,255,255,0.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
