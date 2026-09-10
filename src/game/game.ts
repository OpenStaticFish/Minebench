import * as THREE from "three";
import { CHUNK_HEIGHT, DEFAULT_SEED, PLAYER, SEA_LEVEL } from "../core/constants";
import { aabbOverlaps, type Aabb } from "../core/math";
import { BlockId, getBlockDef, HOTBAR_BLOCKS, isLiquid, isReplaceable } from "../world/blocks";
import { ChunkManager } from "../world/chunkManager";
import { createBlockAtlas, type BlockAtlas } from "../world/textures";
import { World } from "../world/world";
import { findScenicSpawn, resolveSpawnY, type SpawnPoint } from "../world/spawn";
import { Player, type PlayerIntent } from "../player/player";
import { raycastVoxels, type VoxelHit } from "../player/raycast";
import { BlockHighlight } from "../render/highlight";
import { BreakParticles } from "../render/particles";
import { Sky } from "../render/sky";
import type { GameSettings } from "../state/settings";

export type GameMode = "cinematic" | "playing" | "paused";

export interface EditEvent {
  action: "break" | "place";
  block: number;
  x: number;
  y: number;
  z: number;
}

export interface FrameInput {
  lookX: number;
  lookY: number;
  intent: PlayerIntent;
  breakHeld: boolean;
  placeHeld: boolean;
}

const EMPTY_FRAME_INPUT: FrameInput = {
  lookX: 0,
  lookY: 0,
  intent: { strafe: 0, forward: 0, jump: false, descend: false, sprint: false },
  breakHeld: false,
  placeHeld: false,
};

/**
 * Owns the renderer, scene, world, player and per-frame simulation. The App
 * layer drives it (modes, menus, settings) and the HUD reads state from it.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly atlas: BlockAtlas;
  readonly sky = new Sky();
  readonly highlight = new BlockHighlight();
  readonly particles = new BreakParticles();

  world: World;
  chunkManager: ChunkManager;
  player: Player;
  spawnPoint: SpawnPoint;
  mode: GameMode = "cinematic";
  selectedSlot = 0;
  sensitivity = 1;
  onEdit: ((event: EditEvent) => void) | null = null;

  private elapsed = 0;
  private orbitStartAngle = 0;
  private viewDirection = { x: 0, z: -1 };
  private viewDistance = 6;
  private breakCooldown = 0;
  private placeCooldown = 0;
  private readonly lookDirection = new THREE.Vector3();
  private readonly eyePosition = new THREE.Vector3();
  private readonly viewport = { width: 1, height: 1 };
  private targetHit: VoxelHit | null = null;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, seed = DEFAULT_SEED) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera = new THREE.PerspectiveCamera(76, 1, 0.1, 1200);
    this.atlas = createBlockAtlas();
    this.world = new World(seed);
    this.chunkManager = new ChunkManager({
      scene: this.scene,
      world: this.world,
      atlas: { cols: this.atlas.cols, rows: this.atlas.rows },
      texture: this.atlas.texture,
    });
    this.spawnPoint = findScenicSpawn(this.world.generator);
    this.player = new Player(this.world);
    this.resetPlayerToSpawn();
    this.sky.addTo(this.scene);
    this.scene.add(this.highlight.mesh);
    this.scene.add(this.particles.mesh);
    this.viewDirection = this.computeViewDirection();
    this.setViewDistance(this.viewDistance);
    this.setMode("cinematic");
  }

  get seed(): number {
    return this.world.seed;
  }

  get pendingChunks(): number {
    return this.chunkManager.pendingChunks;
  }

  get renderedChunks(): number {
    return this.chunkManager.renderedChunks;
  }

  get elapsedSeconds(): number {
    return this.elapsed;
  }

  get target(): VoxelHit | null {
    return this.targetHit;
  }

  /** Rebuilds the world with a new seed and returns the player to the menu pose. */
  startWorld(seed: number): void {
    this.chunkManager.dispose();
    this.world.dispose();
    this.world = new World(seed);
    this.chunkManager = new ChunkManager({
      scene: this.scene,
      world: this.world,
      atlas: { cols: this.atlas.cols, rows: this.atlas.rows },
      texture: this.atlas.texture,
    });
    this.spawnPoint = findScenicSpawn(this.world.generator);
    this.player = new Player(this.world);
    this.resetPlayerToSpawn();
    this.selectedSlot = 0;
    this.elapsed = 0;
    this.viewDirection = this.computeViewDirection();
    this.setViewDistance(this.viewDistance);
    this.setMode("cinematic");
  }

  resetPlayerToSpawn(): void {
    const spawn = this.spawnPoint;
    const y = resolveSpawnY(this.world, spawn.x, spawn.z, spawn.y);
    this.player.spawn(spawn.x, y, spawn.z, spawn.yaw, spawn.pitch);
    this.player.applyCamera(this.camera);
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
    if (mode === "cinematic") {
      this.orbitStartAngle = Math.atan2(-this.viewDirection.x, -this.viewDirection.z);
    }
    if (mode !== "playing") {
      this.highlight.hide();
      this.targetHit = null;
    }
  }

  /**
   * Picks a diagonal view direction: toward the water centroid but rotated
   * toward the higher (more interesting) side of the coast so screenshots show
   * shoreline, terrain relief and sky in one frame.
   */
  private computeViewDirection(): { x: number; z: number } {
    const spawn = this.spawnPoint;
    const water = spawn.waterDir;
    const perp = { x: -water.z, z: water.x };
    const distance = 16;
    const leftHeight = this.world.generator.heightAt(
      spawn.x + perp.x * distance,
      spawn.z + perp.z * distance,
    );
    const rightHeight = this.world.generator.heightAt(
      spawn.x - perp.x * distance,
      spawn.z - perp.z * distance,
    );
    const side = leftHeight >= rightHeight ? 1 : -1;
    const mix = 0.7 * side;
    let x = water.x + perp.x * mix;
    let z = water.z + perp.z * mix;
    const length = Math.hypot(x, z) || 1;
    x /= length;
    z /= length;
    return { x, z };
  }

  setViewDistance(chunks: number): void {
    this.viewDistance = chunks;
    const showcase = this.mode === "cinematic" ? Math.min(chunks, 4) : chunks;
    this.chunkManager.setViewDistance(showcase);
    this.chunkManager.refreshQueue(this.player.position.x, this.player.position.z);
    this.sky.setViewDistance(this.scene, chunks);
    const fogFar = chunks * 16 * 0.98;
    this.camera.far = Math.max(640, fogFar * 3.2);
    this.camera.updateProjectionMatrix();
  }

  applySettings(settings: GameSettings): void {
    this.sensitivity = settings.sensitivity;
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    this.sky.setCloudsEnabled(settings.clouds);
    this.setViewDistance(settings.viewDistance);
    this.applyRenderScale(settings.renderScale);
  }

  applyRenderScale(scale: number): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * scale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.viewport.width, this.viewport.height, false);
  }

  resize(width: number, height: number): void {
    this.viewport.width = Math.max(1, Math.floor(width));
    this.viewport.height = Math.max(1, Math.floor(height));
    this.camera.aspect = this.viewport.width / this.viewport.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.viewport.width, this.viewport.height, false);
  }

  update(deltaSeconds: number, input: FrameInput = EMPTY_FRAME_INPUT): void {
    const dt = Math.min(deltaSeconds, 0.05);
    this.elapsed += dt;
    this.breakCooldown = Math.max(0, this.breakCooldown - dt);
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);

    if (this.mode === "playing") {
      this.player.addLook(input.lookX, input.lookY, this.sensitivity);
      this.player.update(dt, input.intent);
      this.updateTarget();
      this.handleInteraction(input, dt);
      this.player.applyCamera(this.camera);
      this.sky.setUnderwater(this.scene, this.player.headInWater);
      this.chunkManager.update(dt, this.player.position.x, this.player.position.z);
    } else if (this.mode === "cinematic") {
      this.updateCinematic();
      this.chunkManager.update(dt, this.spawnPoint.x, this.spawnPoint.z, 9);
    } else {
      this.chunkManager.update(dt, this.player.position.x, this.player.position.z, 2);
    }

    this.particles.update(dt);
    this.sky.update(dt, this.camera.position);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private updateCinematic(): void {
    const spawn = this.spawnPoint;
    const angle = this.orbitStartAngle + this.elapsed * 0.03;
    const radius = 38;
    const x = spawn.x + Math.sin(angle) * radius;
    const z = spawn.z + Math.cos(angle) * radius;
    let y = spawn.y + 19 + Math.sin(this.elapsed * 0.08) * 1.2;
    const ground = this.world.surfaceHeight(Math.floor(x), Math.floor(z));
    y = Math.max(y, ground + 6);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(spawn.x, spawn.y + 2, spawn.z);
  }

  private updateTarget(): void {
    this.player.getEyePosition(this.eyePosition);
    this.player.getLookDirection(this.lookDirection);
    this.targetHit = raycastVoxels(
      this.eyePosition,
      this.lookDirection,
      PLAYER.reach,
      (x, y, z) => this.world.getBlock(x, y, z),
      (id) => id !== BlockId.Air && !isLiquid(id),
    );
    if (this.targetHit) {
      this.highlight.show(this.targetHit.x, this.targetHit.y, this.targetHit.z);
    } else {
      this.highlight.hide();
    }
  }

  private handleInteraction(input: FrameInput, _dt: number): void {
    if (input.breakHeld && this.breakCooldown <= 0) {
      if (this.breakBlock()) this.breakCooldown = PLAYER.breakCooldown;
    }
    if (input.placeHeld && this.placeCooldown <= 0) {
      if (this.placeBlock()) this.placeCooldown = PLAYER.placeCooldown;
    }
  }

  breakBlock(): boolean {
    const hit = this.targetHit;
    if (!hit) return false;
    if (hit.block === BlockId.Bedrock) return false;
    if (!this.world.setBlock(hit.x, hit.y, hit.z, BlockId.Air)) return false;
    this.particles.spawn(hit.x, hit.y, hit.z, getBlockDef(hit.block).color, 12);
    this.onEdit?.({ action: "break", block: hit.block, x: hit.x, y: hit.y, z: hit.z });
    return true;
  }

  placeBlock(): boolean {
    const hit = this.targetHit;
    if (!hit) return false;
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const existing = this.world.getBlock(x, y, z);
    if (!isReplaceable(existing)) return false;
    const block = HOTBAR_BLOCKS[this.selectedSlot] ?? BlockId.Grass;
    if (this.blockIntersectsPlayer(x, y, z)) return false;
    if (!this.world.setBlock(x, y, z, block)) return false;
    this.onEdit?.({ action: "place", block, x, y, z });
    return true;
  }

  private blockIntersectsPlayer(x: number, y: number, z: number): boolean {
    const half = PLAYER.halfWidth;
    const block: Aabb = { minX: x, minY: y, minZ: z, maxX: x + 1, maxY: y + 1, maxZ: z + 1 };
    const player: Aabb = {
      minX: this.player.position.x - half,
      minY: this.player.position.y,
      minZ: this.player.position.z - half,
      maxX: this.player.position.x + half,
      maxY: this.player.position.y + PLAYER.height,
      maxZ: this.player.position.z + half,
    };
    return aabbOverlaps(block, player);
  }

  selectSlot(index: number): void {
    if (index < 0 || index >= HOTBAR_BLOCKS.length) return;
    this.selectedSlot = index;
  }

  cycleSlot(direction: number): void {
    const count = HOTBAR_BLOCKS.length;
    this.selectedSlot = ((this.selectedSlot + direction) % count + count) % count;
  }

  get selectedBlock(): number {
    return HOTBAR_BLOCKS[this.selectedSlot] ?? BlockId.Grass;
  }

  /** Renders one fresh frame and returns it as a PNG data URL. */
  captureFrame(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  downloadScreenshot(filename?: string): string {
    const name = filename ?? `cubewild-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    const dataUrl = this.captureFrame();
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return name;
  }

  /**
   * Deterministic vantage point used by the automated in-game screenshot.
   * Camera hovers just off the shoreline looking back at the coast so the
   * frame shows water, beach, grassy relief, trees and sky together.
   */
  poseForScreenshot(): void {
    const spawn = this.spawnPoint;
    const water = spawn.waterDir;
    const distance = spawn.waterDistance + 12;
    const x = spawn.x + water.x * distance;
    const z = spawn.z + water.z * distance;
    const ground = this.world.surfaceHeight(Math.floor(x), Math.floor(z));
    const y = Math.max(ground + 3, spawn.y + 11, SEA_LEVEL + 11);
    const targetX = spawn.x;
    const targetZ = spawn.z;
    const targetY = spawn.y + 1;
    const dx = targetX - x;
    const dz = targetZ - z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(targetY - y, Math.hypot(dx, dz));
    this.player.spawn(x, y, z, yaw, pitch);
    this.player.setFlying(true);
    this.player.applyCamera(this.camera);
  }

  /** Frees every GPU resource owned by the game. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.chunkManager.dispose();
    this.world.dispose();
    this.highlight.dispose();
    this.particles.dispose();
    this.sky.dispose();
    this.atlas.texture.dispose();
    this.renderer.dispose();
  }
}
