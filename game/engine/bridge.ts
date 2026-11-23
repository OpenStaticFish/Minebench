/**
 * Minimal automation bridge exposed as `window.loamlands`.
 *
 * Used by the screenshot script (and any other tooling) to wait for the world
 * to finish streaming instead of guessing with timers. Read-only.
 */
import type { Game, GameScreen } from "./game"

export interface GameState {
  screen: GameScreen
  /** Chunks still queued for generation/meshing. */
  pending: number
  meshed: number
  fps: number
  position: [number, number, number]
  yaw: number
  pitch: number
  flying: boolean
  onGround: boolean
  /** Hotbar slot index and the block id it places. */
  selected: number
  selectedBlock: number
  /** Block the crosshair targets (and the face normal), or null. */
  target: { x: number; y: number; z: number; nx: number; ny: number; nz: number; id: number } | null
  viewDistance: number
  seed: string
  /** Last frame's draw calls and triangles (for performance notes). */
  drawCalls: number
  triangles: number
}

export interface LoamlandsApi {
  readonly version: 1
  getState(): GameState
  /** Resolves when the current streaming plan has finished. */
  whenIdle(): Promise<void>
  /** Read-only block lookup in world coordinates. */
  getBlock(x: number, y: number, z: number): number
}

declare global {
  interface Window {
    loamlands?: LoamlandsApi
  }
}

export function installBridge(game: Game): void {
  window.loamlands = {
    version: 1,
    getState: () => {
      const s = game.stats()
      return {
        screen: game.screen,
        pending: s.chunksPending,
        meshed: s.chunksMeshed,
        fps: s.fps,
        position: [s.x, s.y, s.z],
        yaw: game.player.yaw,
        pitch: game.player.pitch,
        flying: s.flying,
        onGround: game.player.onGround,
        selected: game.selectedSlot,
        selectedBlock: game.hotbar[game.selectedSlot]!.id,
        target: game.target,
        viewDistance: game.settings.viewDistance,
        seed: s.seed,
        drawCalls: s.drawCalls,
        triangles: s.triangles,
      }
    },
    whenIdle: () => game.whenIdle(),
    getBlock: (x, y, z) => game.world.getBlock(x, y, z),
  }
}
