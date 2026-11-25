import {
  BoxGeometry,
  EdgesGeometry,
  Fog,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { makeAtlas } from './atlas';
import { meshChunk } from './mesh';
import { skyDome, cloudBank } from './sky';
import { CHUNK, World } from './world';
import { lightRiver } from './river';

type Job = { x: number; z: number; priority: number };
export class Landscape {
  readonly renderer: WebGLRenderer;
  readonly camera = new PerspectiveCamera(61, 1, 0.06, 450);
  private scene = new Scene();
  private sky = skyDome();
  private clouds = cloudBank();
  private texture = makeAtlas();
  private terrain = new MeshBasicMaterial({ map: this.texture, vertexColors: true });
  private waterClock = lightRiver(this.terrain);
  private chunks = new Map<string, Mesh>();
  private outline: LineSegments;
  private queue: Job[] = [];
  private cx = Infinity;
  private cz = Infinity;
  private loadedRadius = 0;
  radius = 7;
  constructor(
    readonly world: World,
    canvas: HTMLCanvasElement,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.camera.rotation.order = 'YXZ';
    this.scene.fog = new Fog('#c3c8b8', 48, 130);
    this.scene.add(this.sky, this.clouds);
    const b = new BoxGeometry(1.008, 1.008, 1.008);
    this.outline = new LineSegments(
      new EdgesGeometry(b),
      new LineBasicMaterial({ color: '#fff0bb', transparent: true, opacity: 0.85 }),
    );
    b.dispose();
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.resize();
  }
  resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
  get ready() {
    return this.chunks.size > 0 && this.queue.length === 0;
  }
  pose(x: number, y: number, z: number, yaw: number, pitch: number) {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  private rebuild(x: number, z: number) {
    const key = `${x},${z}`,
      g = meshChunk(this.world, x, z),
      old = this.chunks.get(key);
    if (old) {
      old.geometry.dispose();
      old.geometry = g;
      return;
    }
    const mesh = new Mesh(g, this.terrain);
    mesh.position.set(x * CHUNK, 0, z * CHUNK);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    this.chunks.set(key, mesh);
  }
  private stream() {
    const { x, z } = this.camera.position,
      cx = Math.floor(x / CHUNK),
      cz = Math.floor(z / CHUNK),
      r = this.radius;
    if (cx !== this.cx || cz !== this.cz || r !== this.loadedRadius) {
      this.cx = cx;
      this.cz = cz;
      this.loadedRadius = r;
      const fog = this.scene.fog as Fog;
      fog.near = r * CHUNK * 0.38;
      fog.far = r * CHUNK * 1.09;
      this.queue = [];
      for (const [k, m] of this.chunks) {
        const a = m.position.x / CHUNK,
          b = m.position.z / CHUNK;
        if (Math.max(Math.abs(a - cx), Math.abs(b - cz)) > r) {
          this.scene.remove(m);
          m.geometry.dispose();
          this.chunks.delete(k);
        }
      }
      this.world.prune(cx, cz, r + 2);
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (!this.chunks.has(`${cx + dx},${cz + dz}`))
            this.queue.push({
              x: cx + dx,
              z: cz + dz,
              priority:
                Math.hypot(dx, dz) +
                (dx * Math.sin(this.camera.rotation.y) + dz * Math.cos(this.camera.rotation.y)) *
                  0.66,
            });
        }
      this.queue.sort((a, b) => b.priority - a.priority);
    }
    const start = performance.now();
    while (this.queue.length) {
      const j = this.queue.pop()!;
      this.rebuild(j.x, j.z);
      if (performance.now() - start > 6) break;
    }
  }
  edited(x: number, z: number) {
    // Baked shadows extend up to six cells, AO up to one, across seams.
    for (let b = Math.floor((z - 1) / CHUNK); b <= Math.floor((z + 6) / CHUNK); b++)
      for (let a = Math.floor((x - 6) / CHUNK); a <= Math.floor((x + 1) / CHUNK); a++)
        if (this.chunks.has(`${a},${b}`)) this.rebuild(a, b);
  }
  select(hit: readonly number[] | undefined) {
    this.outline.visible = !!hit;
    if (hit) this.outline.position.set(hit[0]! + 0.5, hit[1]! + 0.5, hit[2]! + 0.5);
  }
  redraw() {
    this.renderer.render(this.scene, this.camera);
  }
  draw(time: number) {
    this.stream();
    this.waterClock.value = time;
    this.sky.position.copy(this.camera.position);
    this.clouds.position.set(
      this.camera.position.x + Math.sin(time * 0.007) * 3,
      0,
      this.camera.position.z,
    );
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    for (const m of this.chunks.values()) m.geometry.dispose();
    this.chunks.clear();
    this.terrain.dispose();
    this.texture.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.clouds.geometry.dispose();
    this.clouds.material.forEach((m) => m.dispose());
    this.clouds.dispose();
    this.outline.geometry.dispose();
    (this.outline.material as LineBasicMaterial).dispose();
    this.renderer.dispose();
  }
}
