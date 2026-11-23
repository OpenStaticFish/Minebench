/**
 * HUD: crosshair, stats panel, mode badge, hotbar with generated block icons,
 * toasts, pointer-lock hint and underwater tint.
 */
import type { BlockDef } from "../core/blocks"
import { TILE_SIZE } from "../core/textures"
import type { HudStats } from "../engine/game"

export type IconFactory = (block: BlockDef, size: number) => HTMLCanvasElement

/**
 * Draw an isometric block icon from its top and side tiles with pure canvas
 * (no image assets), so hotbar icons always match the procedural textures.
 */
export function createIconFactory(atlas: { data: Uint8Array; depth: number }): IconFactory {
  const tileCache = new Map<number, HTMLCanvasElement>()
  const tileCanvas = (tile: number): HTMLCanvasElement => {
    let canvas = tileCache.get(tile)
    if (!canvas) {
      canvas = document.createElement("canvas")
      canvas.width = TILE_SIZE
      canvas.height = TILE_SIZE
      const bytes = TILE_SIZE * TILE_SIZE * 4
      const view = new Uint8ClampedArray(bytes)
      view.set(atlas.data.subarray(tile * bytes, (tile + 1) * bytes))
      canvas.getContext("2d")!.putImageData(new ImageData(view, TILE_SIZE, TILE_SIZE), 0, 0)
      tileCache.set(tile, canvas)
    }
    return canvas
  }

  return (block, size) => {
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")!
    const top = tileCanvas(block.tiles.top)
    const side = tileCanvas(block.tiles.side)
    const s = size * 0.86
    const cx = size / 2
    const topY = (size - s * 0.75) / 2
    ctx.imageSmoothingEnabled = false
    // Each face is the unit square mapped onto a rhombus via setTransform(a, b, c, d, e, f).
    ctx.setTransform(s / 2, s / 4, -s / 2, s / 4, cx, topY) // top
    ctx.drawImage(top, 0, 0, 1, 1)
    ctx.setTransform(s / 2, s / 4, 0, s / 2, cx - s / 2, topY + s / 4) // left
    ctx.drawImage(side, 0, 0, 1, 1)
    ctx.fillStyle = "rgba(0,0,0,0.28)"
    ctx.fillRect(0, 0, 1, 1)
    ctx.setTransform(s / 2, -s / 4, 0, s / 2, cx, topY + s / 2) // right
    ctx.drawImage(side, 0, 0, 1, 1)
    ctx.fillStyle = "rgba(0,0,0,0.45)"
    ctx.fillRect(0, 0, 1, 1)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return canvas
  }
}

const SLOT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

export class Hud {
  private readonly root: HTMLElement
  private readonly slots: HTMLButtonElement[] = []
  private readonly stats: Record<string, HTMLElement>
  private readonly modeBadge: HTMLElement
  private readonly blockLabel: HTMLElement
  private readonly toastEl: HTMLElement
  private readonly lockHint: HTMLElement
  private readonly waterTint: HTMLElement
  private toastTimer = 0
  private labelTimer = 0
  private lockHintTimer = 0
  private debug = false

  constructor(
    root: HTMLElement,
    private readonly icon: IconFactory,
  ) {
    this.root = root
    const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!
    this.stats = {
      fps: $("stat-fps"),
      pos: $("stat-pos"),
      chunk: $("stat-chunk"),
      biome: $("stat-biome"),
      frame: $("stat-frame"),
      draws: $("stat-draws"),
      tris: $("stat-tris"),
      chunks: $("stat-chunks"),
    }
    this.modeBadge = $("mode-badge")
    this.blockLabel = $("block-label")
    this.toastEl = $("toast")
    this.lockHint = $("lock-hint")
    this.waterTint = $("water-tint")
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible
  }

  buildHotbar(blocks: readonly BlockDef[], onSelect: (index: number) => void): void {
    const bar = this.root.querySelector<HTMLElement>("#hotbar")!
    bar.replaceChildren()
    this.slots.length = 0
    blocks.forEach((block, i) => {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "slot"
      button.title = block.name
      button.setAttribute("aria-label", `${SLOT_KEYS[i]}: ${block.name}`)
      button.setAttribute("aria-pressed", "false")
      const canvas = this.icon(block, 48)
      canvas.setAttribute("aria-hidden", "true")
      const key = document.createElement("span")
      key.className = "slot__key"
      key.textContent = SLOT_KEYS[i]!
      button.append(canvas, key)
      button.addEventListener("click", () => onSelect(i))
      bar.appendChild(button)
      this.slots.push(button)
    })
    this.setSelected(0, blocks[0]!)
  }

  setSelected(index: number, block: BlockDef): void {
    this.slots.forEach((slot, i) => {
      slot.classList.toggle("slot--selected", i === index)
      slot.setAttribute("aria-pressed", String(i === index))
    })
    this.blockLabel.textContent = block.name
    this.blockLabel.classList.add("block-label--show")
    window.clearTimeout(this.labelTimer)
    this.labelTimer = window.setTimeout(
      () => this.blockLabel.classList.remove("block-label--show"),
      1400,
    )
  }

  /** The FPS/position panel can be hidden for uncluttered screenshots (H key). */
  setStatsVisible(visible: boolean): void {
    this.root.classList.toggle("hud--nostats", !visible)
  }

  setDebug(debug: boolean): void {
    this.debug = debug
    this.root.classList.toggle("hud--debug", debug)
  }

  setStats(s: HudStats): void {
    this.stats.fps!.textContent = String(Math.round(s.fps))
    this.stats.pos!.textContent = `${s.x.toFixed(1)} / ${s.y.toFixed(1)} / ${s.z.toFixed(1)}`
    this.stats.chunk!.textContent = `${s.chunkX}, ${s.chunkZ}`
    this.stats.biome!.textContent = s.biome
    if (!this.debug) return
    this.stats.frame!.textContent = `${s.frameMs.toFixed(1)} ms`
    this.stats.draws!.textContent = String(s.drawCalls)
    this.stats.tris!.textContent = `${Math.round(s.triangles / 1000)}k`
    this.stats.chunks!.textContent = `${s.chunksMeshed} meshed · ${s.chunksPending} queued`
  }

  setMode(flying: boolean, inWater: boolean, sprinting: boolean, eyeInWater: boolean): void {
    const label = flying ? "Flying" : inWater ? "Swimming" : sprinting ? "Sprinting" : "Walking"
    if (this.modeBadge.textContent !== label) this.modeBadge.textContent = label
    this.modeBadge.classList.toggle("badge--flying", flying)
    this.modeBadge.classList.toggle("badge--water", inWater)
    this.waterTint.classList.toggle("water-tint--on", eyeInWater)
  }

  /** Show the "click to capture" banner only if the pointer stays unlocked for a moment. */
  setLocked(locked: boolean): void {
    window.clearTimeout(this.lockHintTimer)
    if (locked) {
      this.lockHint.hidden = true
      return
    }
    this.lockHintTimer = window.setTimeout(() => {
      this.lockHint.hidden = false
    }, 400)
  }

  hideLockHint(): void {
    window.clearTimeout(this.lockHintTimer)
    this.lockHint.hidden = true
  }

  toast(message: string): void {
    this.toastEl.textContent = message
    this.toastEl.classList.add("toast--show")
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("toast--show"), 2200)
  }
}
