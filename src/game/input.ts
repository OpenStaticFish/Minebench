/** Keyboard + mouse input with per-frame consumed mouse deltas and wheel events. */
export class Input {
  private keys = new Set<string>();
  private downListeners = new Map<string, () => void>();
  private dx = 0;
  private dy = 0;
  private wheel = 0;
  private locked = false;
  private onLockChange: ((locked: boolean) => void) | null = null;

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.downListeners.get(e.code)?.();
    }
    // Prevent page scroll with Space / arrows during play.
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
  };
  private readonly handleKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private readonly handleMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };
  private readonly handleWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
  };
  private readonly handlePointerLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    this.onLockChange?.(this.locked);
  };

  constructor(private readonly canvas: HTMLCanvasElement) {}

  attach(onLockChange: (locked: boolean) => void): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    this.onLockChange = onLockChange;
  }

  detach(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    document.removeEventListener("mousemove", this.handleMouseMove);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.keys.clear();
  }

  requestLock(): void {
    this.canvas.requestPointerLock();
  }

  releaseLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Registers a one-shot handler for a key press. Returns an unregister fn. */
  onPress(code: string, fn: () => void): () => void {
    this.downListeners.set(code, fn);
    return () => {
      if (this.downListeners.get(code) === fn) this.downListeners.delete(code);
    };
  }

  /** Consumes accumulated mouse movement since the last frame. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
}
