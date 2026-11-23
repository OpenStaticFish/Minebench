/**
 * ChunkManager: decides which chunks to generate/mesh around a centre and
 * does the work within a per-frame time budget so streaming never stalls play.
 *
 * Chunks within `radius + 1` are generated (so border faces are always correct)
 * and chunks within `radius` are meshed. Work is ordered nearest-first.
 */
import type { Chunk } from "../core/chunk"
import type { World } from "../core/world"
import type { ChunkRenderer } from "./chunkView"

interface Task {
  cx: number
  cz: number
  /** Distance from the centre in chunks; decides whether the chunk is meshed. */
  d: number
}

export class ChunkManager {
  private queue: Task[] = []
  private center = { cx: Number.NaN, cz: Number.NaN }
  private radius = -1
  private total = 0

  /** Chunks still waiting to be generated or meshed for the current plan. */
  pending = 0
  /** Fires whenever the queue drains. */
  onIdle: (() => void) | null = null
  onProgress: ((done: number, total: number) => void) | null = null

  constructor(
    private readonly world: World,
    private readonly renderer: ChunkRenderer,
  ) {}

  /** Re-plan when the centre chunk or radius changed. Cheap enough to call every frame. */
  setCenter(x: number, z: number, radius: number): void {
    const cx = Math.floor(x) >> 4
    const cz = Math.floor(z) >> 4
    if (cx === this.center.cx && cz === this.center.cz && radius === this.radius) return
    const shrank = radius < this.radius
    this.center = { cx, cz }
    this.radius = radius
    this.plan(shrank)
  }

  private plan(shrank: boolean): void {
    const { cx, cz } = this.center
    const radius = this.radius
    const outer = radius + 1
    // While moving, keep a hysteresis ring so chunks at the edge are not rebuilt
    // on every step. When the view distance is lowered, drop the excess at once.
    const keepDistance = shrank ? radius + 0.5 : outer + 1.5

    // Drop meshes that fell out of range; block data stays so edits survive.
    for (const key of [...this.renderer.keys()]) {
      const [kx, kz] = key.split(",").map(Number)
      if (Math.hypot(kx! - cx, kz! - cz) > keepDistance) {
        this.renderer.remove(key)
        const chunk = this.world.getChunk(kx!, kz!)
        if (chunk) chunk.dirty = true
      }
    }

    const tasks: Task[] = []
    for (let dz = -outer; dz <= outer; dz++) {
      for (let dx = -outer; dx <= outer; dx++) {
        const d = Math.hypot(dx, dz)
        if (d > outer + 0.5) continue
        const chunk = this.world.getChunk(cx + dx, cz + dz)
        const needsMesh = d <= radius + 0.5 && (!chunk || chunk.dirty)
        if (!chunk || needsMesh) tasks.push({ cx: cx + dx, cz: cz + dz, d })
      }
    }
    tasks.sort((a, b) => a.d - b.d)
    this.queue = tasks
    this.total = tasks.length
    this.pending = tasks.length
    if (tasks.length === 0) this.onIdle?.()
  }

  /** Process queued chunks until the time budget (ms) is spent. */
  update(budgetMs: number): void {
    if (this.queue.length === 0) return
    const start = performance.now()
    const radius = this.radius
    do {
      const task = this.queue.shift()!
      const chunk = this.world.ensureChunk(task.cx, task.cz)
      if (task.d <= radius + 0.5 && chunk.dirty) {
        // Neighbours must exist for border faces and occlusion; they are in the plan already.
        this.world.ensureChunk(task.cx + 1, task.cz)
        this.world.ensureChunk(task.cx - 1, task.cz)
        this.world.ensureChunk(task.cx, task.cz + 1)
        this.world.ensureChunk(task.cx, task.cz - 1)
        this.renderer.build(chunk, this.world)
      }
      this.pending = this.queue.length
      this.onProgress?.(this.total - this.pending, this.total)
      if (performance.now() - start > budgetMs) break
    } while (this.queue.length > 0)
    if (this.queue.length === 0) this.onIdle?.()
  }

  /** Rebuild meshes for edited chunks right away (a few ms at most). */
  rebuild(chunks: Chunk[]): void {
    for (const chunk of chunks) {
      if (this.renderer.has(chunk.key)) this.renderer.build(chunk, this.world)
    }
  }
}
