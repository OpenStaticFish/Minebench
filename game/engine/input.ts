/**
 * Input: keyboard state, mouse look via pointer lock, wheel, and the few
 * discrete actions (fly toggle, hotbar slots, pause, screenshot, debug).
 *
 * Gameplay keys are only honoured while `enabled`, so typing a seed in the
 * menu never moves the player. All listeners are removed in `dispose()`.
 */
import type { MoveInput } from "./player"

export type InputAction = "pause" | "resume" | "screenshot" | "debug" | "hud" | "slot"

type Listener = EventListenerOrEventListenerObject

const DOUBLE_TAP_MS = 280
/** Keys that would scroll, focus-cycle or trigger browser UI during play. */
const PREVENT_DEFAULT_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "Tab",
])

export class Input {
  /** Gameplay keys are processed (true only while playing). */
  enabled = false
  /** Screenshot/debug shortcuts are processed (playing or paused). */
  shortcuts = false
  /** Treat the pointer as captured without a real pointer lock (automation only). */
  virtualLock = false
  private pointerLocked = false

  /** Whether the pointer is captured by the canvas (really, or virtually). */
  get locked(): boolean {
    return this.pointerLocked || this.virtualLock
  }

  /** Whether a real browser pointer lock is held. */
  get captured(): boolean {
    return this.pointerLocked
  }

  onFlyToggle: (() => void) | null = null
  onAction: ((action: InputAction, value?: number) => void) | null = null
  /** `lost` is true when a previously held pointer lock was released (e.g. Esc). */
  onLockChange: ((locked: boolean, lost: boolean) => void) | null = null
  /** The player clicked the canvas while the pointer was not captured. */
  onCanvasClick: (() => void) | null = null

  private readonly keys = new Set<string>()
  private readonly mouse = new Set<number>()
  /** Key/button presses not yet consumed by the game loop (edge-triggered). */
  private readonly pressed = new Set<string>()
  private lookDX = 0
  private lookDY = 0
  private wheel = 0
  private lastSpaceTap = 0
  private spaceDownAt = 0
  private readonly handlers: Array<
    [EventTarget, string, Listener, AddEventListenerOptions | undefined]
  > = []

  constructor(private readonly canvas: HTMLCanvasElement) {}

  private listen(
    target: EventTarget,
    type: string,
    handler: Listener,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options)
    this.handlers.push([target, type, handler, options])
  }

  attach(): void {
    this.listen(window, "keydown", (e) => this.onKeyDown(e as KeyboardEvent))
    this.listen(window, "keyup", (e) => this.onKeyUp(e as KeyboardEvent))
    this.listen(window, "blur", () => this.reset())
    this.listen(this.canvas, "mousedown", (e) => this.onMouseDown(e as MouseEvent))
    this.listen(window, "mouseup", (e) => this.mouse.delete((e as MouseEvent).button))
    this.listen(window, "mousemove", (e) => this.onMouseMove(e as MouseEvent))
    this.listen(this.canvas, "contextmenu", (e) => e.preventDefault())
    this.listen(this.canvas, "wheel", (e) => this.onWheel(e as WheelEvent), { passive: false })
    this.listen(document, "pointerlockchange", () => this.onLockChangeInternal())
  }

  dispose(): void {
    for (const [target, type, handler, options] of this.handlers) {
      target.removeEventListener(type, handler, options)
    }
    this.handlers.length = 0
  }

  /** Forget held keys/buttons and pending deltas (used on pause, blur, lock loss). */
  reset(): void {
    this.keys.clear()
    this.mouse.clear()
    this.pressed.clear()
    this.lookDX = 0
    this.lookDY = 0
    this.wheel = 0
  }

  requestLock(): void {
    try {
      const result = this.canvas.requestPointerLock() as unknown
      if (result instanceof Promise) result.catch(() => this.onLockChange?.(false, false))
    } catch {
      this.onLockChange?.(false, false)
    }
  }

  exitLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }

  consumeLook(): [number, number] {
    const out: [number, number] = [this.lookDX, this.lookDY]
    this.lookDX = 0
    this.lookDY = 0
    return out
  }

  consumeWheel(): number {
    const w = this.wheel
    this.wheel = 0
    return w
  }

  held(button: number): boolean {
    return this.mouse.has(button)
  }

  /** True once per key press, even if the key was released between two frames. */
  consumeKeyPress(code: string): boolean {
    return this.pressed.delete(`key:${code}`)
  }

  /** True once per button press, even if released between two frames. */
  consumeMousePress(button: number): boolean {
    return this.pressed.delete(`mouse:${button}`)
  }

  moveState(): MoveInput {
    const k = this.keys
    const shift = k.has("ShiftLeft") || k.has("ShiftRight")
    return {
      forward: k.has("KeyW"),
      back: k.has("KeyS"),
      left: k.has("KeyA"),
      right: k.has("KeyD"),
      up: k.has("Space"),
      down: shift,
      sprint: shift,
      jumpPressed: false,
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    if (this.shortcuts) {
      // Esc on the pause screen resumes (the Esc that opened it is swallowed by the
      // browser's pointer-lock exit and never reaches the page).
      if (e.code === "Escape" && !this.enabled) {
        this.onAction?.("resume")
        return
      }
      if (e.code === "KeyP") {
        e.preventDefault()
        if (!e.repeat) this.onAction?.("screenshot")
        return
      }
      if (e.code === "KeyH") {
        e.preventDefault()
        if (!e.repeat) this.onAction?.("hud")
        return
      }
      if (e.code === "F3") {
        e.preventDefault()
        if (!e.repeat) this.onAction?.("debug")
        return
      }
    }

    if (!this.enabled) return
    // With a real lock, Esc is handled by the browser (lock lost → pause). Without one
    // (capture failed, or automation) we handle it ourselves.
    if (e.code === "Escape" && !this.captured) {
      this.onAction?.("pause")
      return
    }
    if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault()
    if (e.repeat) return

    this.keys.add(e.code)
    this.pressed.add(`key:${e.code}`)
    if (e.code === "Space") {
      // Double-tap Space toggles flight. After a toggle (or a long hold) the
      // pairing restarts, so tap-tap-hold to ascend does not toggle again.
      const now = performance.now()
      this.spaceDownAt = now
      if (this.lastSpaceTap !== 0 && now - this.lastSpaceTap < DOUBLE_TAP_MS) {
        this.onFlyToggle?.()
        this.lastSpaceTap = 0
      } else {
        this.lastSpaceTap = now
      }
    }
    if (e.code.startsWith("Digit")) {
      const n = Number(e.code.slice(5))
      if (n >= 1 && n <= 9) this.onAction?.("slot", n - 1)
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code)
    if (e.code === "Space" && performance.now() - this.spaceDownAt > DOUBLE_TAP_MS) {
      this.lastSpaceTap = 0
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.enabled) return
    if (!this.locked) {
      this.onCanvasClick?.()
      return
    }
    this.mouse.add(e.button)
    this.pressed.add(`mouse:${e.button}`)
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.locked || !this.enabled) return
    this.lookDX += e.movementX
    this.lookDY += e.movementY
  }

  private onWheel(e: WheelEvent): void {
    if (!this.enabled || !this.locked) return
    e.preventDefault()
    this.wheel += Math.sign(e.deltaY)
  }

  private onLockChangeInternal(): void {
    const locked = document.pointerLockElement === this.canvas
    const lost = this.pointerLocked && !locked
    this.pointerLocked = locked
    if (!locked) this.reset()
    this.onLockChange?.(locked, lost)
  }
}
