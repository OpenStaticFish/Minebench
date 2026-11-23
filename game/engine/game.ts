/**
 * Game: owns the renderer, world, player, chunk streaming and the main loop,
 * and exposes a small imperative API for the UI (start/pause/resume/settings).
 *
 * Screens: `menu` (cinematic camera over the world), `playing` (pointer-locked
 * first person) and `paused` (world frozen, pointer released).
 */
import * as THREE from "three"
import { B, type BlockDef, blockDef, HOTBAR } from "../core/blocks"
import { WORLD_HEIGHT } from "../core/chunk"
import { smoothstep } from "../core/noise"
import { type RayHit, raycastVoxel } from "../core/raycast"
import { hashSeed } from "../core/rng"
import type { Settings } from "../core/settings"
import { findSpawn, type SpawnPoint } from "../core/spawn"
import { BIOME_NAMES, TerrainGenerator } from "../core/terrain"
import { buildAtlas } from "../core/textures"
import { World } from "../core/world"
import { ChunkManager } from "./chunkManager"
import { ChunkRenderer } from "./chunkView"
import { Clouds } from "./clouds"
import { BlockHighlight } from "./highlight"
import { Input, type InputAction } from "./input"
import {
  createAtlasTexture,
  createChunkMaterial,
  createCloudMaterial,
  createSharedUniforms,
  type SharedUniforms,
} from "./materials"
import { Particles } from "./particles"
import { Player } from "./player"
import { Sky } from "./sky"

export type GameScreen = "menu" | "playing" | "paused"

export interface HudStats {
  fps: number
  frameMs: number
  x: number
  y: number
  z: number
  chunkX: number
  chunkZ: number
  flying: boolean
  inWater: boolean
  sprinting: boolean
  chunksMeshed: number
  chunksPending: number
  drawCalls: number
  triangles: number
  target: string | null
  biome: string
  seed: string
  eyeInWater: boolean
}

export interface GameEvents {
  onScreenChange?: (screen: GameScreen) => void
  onHudStats?: (stats: HudStats) => void
  onProgress?: (done: number, total: number) => void
  onToast?: (message: string) => void
  onSelectionChange?: (index: number, block: BlockDef) => void
  onLockChange?: (locked: boolean) => void
  onToggleDebug?: () => void
  onToggleHudStats?: () => void
}

/** Default world seed, chosen for its spawn vista (alpine lake below snowy peaks). */
export const DEFAULT_SEED = "dune"
/** Block interaction range in blocks. */
export const REACH = 6

const REPEAT_SECONDS = 0.22
const MENU_ORBIT_RADIUS = 30
const MENU_ORBIT_HEIGHT = 15
const MENU_ORBIT_SPEED = 0.12
const TRANSITION_SECONDS = 0.9
const CLOUD_HEIGHT = 150
const FALLBACK_COLOR = new THREE.Color(0.5, 0.5, 0.5)

export class Game {
  readonly settings: Settings
  readonly input: Input
  readonly player = new Player()
  readonly hotbar: readonly BlockDef[] = HOTBAR.map((id) => blockDef(id))
  selectedSlot = 0
  screen: GameScreen = "menu"
  /** Procedural tile data, shared with the HUD for icons. */
  readonly atlas = buildAtlas()

  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly shared: SharedUniforms
  private readonly chunkRenderer: ChunkRenderer
  private readonly sky: Sky
  private readonly clouds: Clouds
  private readonly highlight: BlockHighlight
  private readonly particles: Particles
  private readonly tileColors: THREE.Color[]
  private readonly atlasTexture: THREE.Texture
  private readonly chunkMaterials: THREE.ShaderMaterial[]
  private readonly cloudMaterial: THREE.ShaderMaterial

  /** Current world. Replaced by `newWorld`; tooling may read it. */
  world!: World
  private spawn!: SpawnPoint
  private chunkManager!: ChunkManager
  private seedText = DEFAULT_SEED

  private readonly getBlock: (x: number, y: number, z: number) => number

  private time = 0
  private lastTime = 0
  private raf = 0
  private disposed = false
  private transition = 1
  private readonly transitionFromPos = new THREE.Vector3()
  private readonly transitionFromQuat = new THREE.Quaternion()
  private readonly targetQuat = new THREE.Quaternion()
  private readonly targetEuler = new THREE.Euler(0, 0, 0, "YXZ")
  private breakCooldown = 0
  private placeCooldown = 0
  private rayHit: RayHit | null = null

  private fps = 0
  private fpsFrames = 0
  private fpsTime = 0
  private frameMs = 0
  private hudTimer = 0
  private idleWaiters: Array<() => void> = []

  /** Set by Playwright and friends; skips pointer lock so screenshots are hands-off. */
  private readonly automated = navigator.webdriver === true
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  constructor(
    private readonly canvas: HTMLCanvasElement,
    settings: Settings,
    private readonly events: GameEvents = {},
  ) {
    this.settings = { ...settings }
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    })
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.1, 1200)

    this.shared = createSharedUniforms()
    const texture = createAtlasTexture(
      this.atlas.data,
      this.atlas.width,
      this.atlas.height,
      this.atlas.depth,
    )
    this.tileColors = tileAverageColors(this.atlas.data, this.atlas.depth)
    this.atlasTexture = texture
    this.chunkMaterials = [
      createChunkMaterial(this.shared, texture, "opaque"),
      createChunkMaterial(this.shared, texture, "water"),
    ]
    this.chunkRenderer = new ChunkRenderer(
      this.scene,
      this.chunkMaterials[0]!,
      this.chunkMaterials[1]!,
    )
    this.sky = new Sky(this.scene)
    this.cloudMaterial = createCloudMaterial(this.shared)
    this.clouds = new Clouds(this.scene, this.cloudMaterial, 0, CLOUD_HEIGHT)
    this.highlight = new BlockHighlight(this.scene)
    this.particles = new Particles(this.scene)

    this.getBlock = (x, y, z) => this.world.getBlock(x, y, z)

    this.input = new Input(canvas)
    // Under browser automation there is no user gesture to capture the pointer, so
    // behave as if it were captured: mouse buttons and look work without a lock.
    this.input.virtualLock = this.automated
    this.input.onFlyToggle = () => this.player.toggleFly()
    this.input.onAction = (action, value) => this.onAction(action, value)
    this.input.onLockChange = (locked, lost) => this.onLockChange(locked, lost)
    this.input.onCanvasClick = () => this.input.requestLock()
    this.input.attach()

    this.newWorld(DEFAULT_SEED)
    this.applySettings(settings)
    this.resize()
    window.addEventListener("resize", this.resize)

    this.lastTime = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  // ───────────────────────── world & screens ─────────────────────────

  /** Seed text of the current world. */
  get seed(): string {
    return this.seedText
  }

  /** Block currently under the crosshair, if any within reach. */
  get target(): RayHit | null {
    return this.rayHit
  }

  /** Build a fresh world from a seed string. Only valid from the main menu. */
  newWorld(seedText: string): void {
    this.seedText = seedText.trim() || DEFAULT_SEED
    const seed = hashSeed(this.seedText)
    this.world?.dispose()
    this.chunkRenderer.dispose()
    this.world = new World(seed, new TerrainGenerator(seed))
    this.spawn = findSpawn(this.world.generator)
    this.player.teleport(this.spawn.x, this.spawn.y, this.spawn.z, this.spawn.yaw, this.spawn.pitch)
    this.clouds.reseed(seed)

    const manager = new ChunkManager(this.world, this.chunkRenderer)
    manager.onProgress = (done, total) => this.events.onProgress?.(done, total)
    manager.onIdle = () => {
      const waiters = this.idleWaiters
      this.idleWaiters = []
      for (const w of waiters) w()
    }
    this.chunkManager = manager
    this.chunkManager.setCenter(this.spawn.x, this.spawn.z, this.settings.viewDistance)
  }

  /** Resolves once every chunk in the current plan is generated and meshed. */
  whenIdle(): Promise<void> {
    if (this.chunkManager.pending === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  start(): void {
    if (this.screen !== "menu") return
    this.setScreen("playing")
    this.transition = this.reducedMotion ? 1 : 0
    this.transitionFromPos.copy(this.camera.position)
    this.transitionFromQuat.copy(this.camera.quaternion)
    this.requestLock()
  }

  pause(): void {
    if (this.screen !== "playing") return
    this.setScreen("paused")
    this.input.exitLock()
  }

  resume(): void {
    if (this.screen !== "paused") return
    this.setScreen("playing")
    this.requestLock()
  }

  quitToMenu(): void {
    if (this.screen === "menu") return
    this.input.exitLock()
    this.setScreen("menu")
    this.transition = 1
  }

  private setScreen(screen: GameScreen): void {
    this.screen = screen
    this.input.enabled = screen === "playing"
    this.input.shortcuts = screen !== "menu"
    this.input.reset()
    this.highlight.set(null)
    this.events.onScreenChange?.(screen)
  }

  private requestLock(): void {
    if (!this.automated) this.input.requestLock()
  }

  private onLockChange(locked: boolean, lost: boolean): void {
    this.events.onLockChange?.(locked)
    // Esc (or any loss of a held lock) pauses; a failed request just leaves us unlocked.
    if (lost && this.screen === "playing" && !this.automated) this.pause()
  }

  // ───────────────────────── settings ─────────────────────────

  /** Apply changed settings immediately (view distance, fog, FOV, resolution, clouds). */
  applySettings(next: Settings): void {
    const viewDistanceChanged = next.viewDistance !== this.settings.viewDistance
    Object.assign(this.settings, next)
    this.camera.fov = next.fov
    this.camera.updateProjectionMatrix()
    this.shared.uFogNear.value = Math.max(8, (next.viewDistance - 2) * 16)
    this.shared.uFogFar.value = (next.viewDistance + 0.5) * 16
    this.clouds.mesh.visible = next.clouds
    // Re-plan immediately so `whenIdle()` and the progress bar reflect the new radius.
    if (viewDistanceChanged) this.recentreChunks()
    this.resize()
  }

  resize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * this.settings.renderScale
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
  }

  // ───────────────────────── interaction ─────────────────────────

  selectSlot(index: number): void {
    const n = this.hotbar.length
    this.selectedSlot = ((index % n) + n) % n
    this.events.onSelectionChange?.(this.selectedSlot, this.hotbar[this.selectedSlot]!)
  }

  private onAction(action: InputAction, value?: number): void {
    switch (action) {
      case "slot":
        this.selectSlot(value ?? 0)
        break
      case "pause":
        this.pause()
        break
      case "resume":
        this.resume()
        break
      case "screenshot":
        this.captureScreenshot().catch(() => this.events.onToast?.("Screenshot failed"))
        break
      case "debug":
        this.events.onToggleDebug?.()
        break
      case "hud":
        this.events.onToggleHudStats?.()
        break
    }
  }

  private edit(x: number, y: number, z: number, id: number): void {
    this.chunkManager.rebuild(this.world.setBlock(x, y, z, id))
  }

  private breakBlock(hit: RayHit): void {
    const def = blockDef(hit.id)
    if (def.unbreakable) return
    this.edit(hit.x, hit.y, hit.z, B.Air)
    this.particles.burst(hit.x, hit.y, hit.z, this.tileColors[def.tiles.side] ?? FALLBACK_COLOR)
  }

  private placeBlock(hit: RayHit): void {
    const x = hit.x + hit.nx
    const y = hit.y + hit.ny
    const z = hit.z + hit.nz
    if (y < 0 || y >= WORLD_HEIGHT) return
    const existing = this.world.getBlock(x, y, z)
    if (existing !== B.Air && !blockDef(existing).liquid) return
    const id = this.hotbar[this.selectedSlot]!.id
    if (blockDef(id).solid && this.blockIntersectsPlayer(x, y, z)) return
    this.edit(x, y, z, id)
  }

  private blockIntersectsPlayer(x: number, y: number, z: number): boolean {
    const box = this.player.box()
    return (
      box.maxX > x &&
      box.minX < x + 1 &&
      box.maxY > y &&
      box.minY < y + 1 &&
      box.maxZ > z &&
      box.minZ < z + 1
    )
  }

  /** Render a fresh frame and download it as a PNG (3D view only; the HUD is DOM). */
  async captureScreenshot(): Promise<void> {
    this.renderer.render(this.scene, this.camera)
    const blob = await new Promise<Blob | null>((resolve) =>
      this.canvas.toBlob(resolve, "image/png"),
    )
    if (!blob) throw new Error("toBlob returned nothing")
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    a.href = url
    a.download = `loamlands-${stamp}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    this.events.onToast?.(`Saved ${a.download}`)
  }

  // ───────────────────────── main loop ─────────────────────────

  private tick = (now: number): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.tick)
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000))
    this.lastTime = now
    const started = performance.now()

    this.update(dt)
    this.renderer.render(this.scene, this.camera)

    this.frameMs = performance.now() - started
    this.fpsFrames++
    this.fpsTime += dt
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime
      this.fpsFrames = 0
      this.fpsTime = 0
    }
  }

  private update(dt: number): void {
    this.time += dt
    this.shared.uTime.value = this.time

    if (this.screen === "playing") this.updatePlaying(dt)
    this.particles.update(dt)
    this.recentreChunks()
    // Spend a generous budget while the menu is up (nothing else to do), a small one in play.
    this.chunkManager.update(this.screen === "menu" ? 24 : 5)

    if (this.screen === "menu") this.updateMenuCamera()
    else this.updatePlayerCamera(dt)

    this.sky.update(this.camera)
    this.clouds.update(this.time, this.camera.position.x, this.camera.position.z)

    this.hudTimer += dt
    if (this.hudTimer >= 0.2) {
      this.hudTimer = 0
      this.events.onHudStats?.(this.stats())
    }
  }

  /** Ask the streamer for the chunks around whatever the camera is looking at. */
  private recentreChunks(): void {
    const centre = this.screen === "menu" ? this.spawn : this.player.position
    this.chunkManager.setCenter(centre.x, centre.z, this.settings.viewDistance)
  }

  private updatePlaying(dt: number): void {
    const { input, player } = this
    const [dx, dy] = input.consumeLook()
    if (input.locked) player.look(dx, dy, this.settings.sensitivity)
    const wheel = input.consumeWheel()
    if (wheel !== 0) this.selectSlot(this.selectedSlot + wheel)

    const move = input.moveState()
    move.jumpPressed = input.consumeKeyPress("Space")
    player.update(dt, move, this.world)

    const eye = player.eye
    const dir = player.lookDirection
    this.rayHit = raycastVoxel(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH, this.getBlock)
    this.highlight.set(this.rayHit)

    // Only interact while the pointer is captured; the first click just captures it.
    if (input.locked) {
      this.breakCooldown -= dt
      this.placeCooldown -= dt
      // Edge-triggered presses make single clicks reliable even at low frame rates;
      // holding a button repeats at REPEAT_SECONDS.
      const breakPressed = input.held(0) || input.consumeMousePress(0)
      const placePressed = input.held(2) || input.consumeMousePress(2)
      if (!breakPressed) this.breakCooldown = 0
      if (!placePressed) this.placeCooldown = 0
      if (breakPressed && this.breakCooldown <= 0 && this.rayHit) {
        this.breakBlock(this.rayHit)
        this.breakCooldown = REPEAT_SECONDS
      }
      if (placePressed && this.placeCooldown <= 0 && this.rayHit) {
        this.placeBlock(this.rayHit)
        this.placeCooldown = REPEAT_SECONDS
      }
    } else {
      input.consumeMousePress(0)
      input.consumeMousePress(2)
    }
  }

  private updatePlayerCamera(dt: number): void {
    const eye = this.player.eye
    this.targetEuler.set(this.player.pitch, this.player.yaw, 0)
    this.targetQuat.setFromEuler(this.targetEuler)
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / TRANSITION_SECONDS)
      const t = smoothstep(0, 1, this.transition)
      this.camera.position.lerpVectors(this.transitionFromPos, eye, t)
      this.camera.quaternion.slerpQuaternions(this.transitionFromQuat, this.targetQuat, t)
    } else {
      this.camera.position.copy(eye)
      this.camera.quaternion.copy(this.targetQuat)
    }
  }

  /**
   * Title-screen camera: floats behind and above the spawn, gently swaying,
   * looking down the same vista the player will see when they press Play.
   */
  private updateMenuCamera(): void {
    const s = this.spawn
    const sway = this.reducedMotion ? 0 : Math.sin(this.time * MENU_ORBIT_SPEED) * 0.35
    const angle = s.yaw + sway
    const dx = -Math.sin(angle)
    const dz = -Math.cos(angle)
    const x = s.x - dx * MENU_ORBIT_RADIUS
    const z = s.z - dz * MENU_ORBIT_RADIUS
    // Never sink the camera into a hill behind the spawn.
    const ground = this.world.generator.column(Math.floor(x), Math.floor(z)).height
    const y = Math.max(s.y + MENU_ORBIT_HEIGHT, ground + 8)
    this.camera.position.set(x, y, z)
    this.camera.lookAt(s.x + dx * 90, s.y + 6, s.z + dz * 90)
  }

  stats(): HudStats {
    const p = this.player.position
    const info = this.renderer.info.render
    const column = this.world.generator.column(Math.floor(p.x), Math.floor(p.z))
    return {
      fps: this.fps,
      frameMs: this.frameMs,
      x: p.x,
      y: p.y,
      z: p.z,
      chunkX: Math.floor(p.x) >> 4,
      chunkZ: Math.floor(p.z) >> 4,
      flying: this.player.flying,
      inWater: this.player.inWater,
      sprinting: this.player.sprinting,
      chunksMeshed: this.chunkRenderer.chunkCount,
      chunksPending: this.chunkManager.pending,
      drawCalls: info.calls,
      triangles: info.triangles,
      target: this.rayHit ? blockDef(this.rayHit.id).name : null,
      biome: BIOME_NAMES[column.biome],
      seed: this.seedText,
      eyeInWater: this.player.eyeInWater,
    }
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener("resize", this.resize)
    this.input.exitLock()
    this.input.dispose()
    this.chunkRenderer.dispose()
    this.sky.dispose()
    this.clouds.dispose()
    this.highlight.dispose()
    this.particles.dispose()
    for (const material of this.chunkMaterials) material.dispose()
    this.cloudMaterial.dispose()
    this.atlasTexture.dispose()
    this.world.dispose()
    this.renderer.dispose()
  }
}

/** Mean colour of each tile (ignoring transparent pixels) for particle tints. */
function tileAverageColors(data: Uint8Array, depth: number): THREE.Color[] {
  const colors: THREE.Color[] = []
  const pixels = 16 * 16
  for (let layer = 0; layer < depth; layer++) {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let i = 0; i < pixels; i++) {
      const o = (layer * pixels + i) * 4
      if (data[o + 3] === 0) continue
      r += data[o]!
      g += data[o + 1]!
      b += data[o + 2]!
      n++
    }
    colors.push(new THREE.Color(n ? r / n / 255 : 1, n ? g / n / 255 : 1, n ? b / n / 255 : 1))
  }
  return colors
}
