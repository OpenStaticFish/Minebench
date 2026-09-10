import { clamp } from "../core/math";
import { PLAYER } from "../core/constants";

export interface InputEvents {
  flyToggle: () => void;
  pause: () => void;
  screenshot: () => void;
  slot: (index: number) => void;
  wheelSlot: (direction: number) => void;
}

/**
 * Keyboard + mouse state with pointer lock support. Gameplay code reads state
 * through small accessors; menu actions are delivered through callbacks so the
 * UI layer owns app state transitions.
 */
export class Input {
  private readonly keys = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;
  private lastSpaceTap = 0;
  /**
   * Timestamp of the last pointer-lock acquisition. Browsers send a synthetic
   * "recenter" movement delta as the first non-zero mousemove after locking;
   * it is ignored so the camera does not jump when the player starts looking.
   */
  private lockPendingSince = 0;
  private element: HTMLElement | null = null;
  private readonly events: Partial<InputEvents> = {};

  pointerLocked = false;
  enabled = true;

  on<K extends keyof InputEvents>(event: K, handler: InputEvents[K]): void {
    this.events[event] = handler;
  }

  attach(element: HTMLElement): void {
    this.element = element;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    element.addEventListener("contextmenu", this.handleContextMenu);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("mousedown", this.handleMouseDown);
    window.removeEventListener("mouseup", this.handleMouseUp);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("blur", this.handleBlur);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.element?.removeEventListener("contextmenu", this.handleContextMenu);
    this.element = null;
  }

  requestPointerLock(): void {
    const element = this.element;
    if (!element || this.pointerLocked) return;
    const result = element.requestPointerLock() as unknown;
    if (result instanceof Promise) {
      result.catch(() => {
        /* Pointer lock can be rejected if requested too soon after exiting. */
      });
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  isMouseDown(button: number): boolean {
    return this.mouseButtons.has(button);
  }

  consumeMouseDelta(): { dx: number; dy: number } {
    const delta = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return delta;
  }

  clearMouseDelta(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Escape") {
      this.events.pause?.();
      return;
    }
    if (!this.enabled) return;
    if (event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
    this.keys.add(event.code);
    if (event.repeat) return;

    if (event.code === "KeyP") {
      this.events.screenshot?.();
      return;
    }
    if (event.code === "Space") {
      const now = performance.now();
      if (now - this.lastSpaceTap < PLAYER.flyDoubleTapMs) {
        this.lastSpaceTap = 0;
        this.events.flyToggle?.();
      } else {
        this.lastSpaceTap = now;
      }
      return;
    }
    if (event.code === "KeyF" && !event.ctrlKey && !event.metaKey) {
      this.events.flyToggle?.();
      return;
    }
    if (event.code.startsWith("Digit")) {
      const digit = Number(event.code.slice(5));
      if (digit >= 1 && digit <= 9) this.events.slot?.(digit - 1);
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private handleMouseDown = (event: MouseEvent): void => {
    if (!this.enabled) return;
    if (event.button === 0 || event.button === 2) this.mouseButtons.add(event.button);
    if (event.button === 0 && !this.pointerLocked) this.requestPointerLock();
  };

  private handleMouseUp = (event: MouseEvent): void => {
    this.mouseButtons.delete(event.button);
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked || !this.enabled) return;
    if (this.lockPendingSince !== 0) {
      // Zero-delta heartbeats are common; only a real delta ends the wait.
      if (event.movementX === 0 && event.movementY === 0) return;
      this.lockPendingSince = 0;
      return;
    }
    const limit = 200;
    this.mouseDX += clamp(event.movementX, -limit, limit);
    this.mouseDY += clamp(event.movementY, -limit, limit);
  };

  private handleWheel = (event: WheelEvent): void => {
    if (!this.enabled) return;
    if (event.deltaY === 0) return;
    event.preventDefault();
    this.events.wheelSlot?.(event.deltaY > 0 ? 1 : -1);
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.mouseButtons.clear();
  };

  private handleContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.element;
    const wasLocked = this.pointerLocked;
    this.pointerLocked = locked;
    if (locked && !wasLocked) this.lockPendingSince = performance.now();
    if (wasLocked && !locked) {
      this.lockPendingSince = 0;
      this.events.pause?.();
    }
  };
}

export const KEY_BINDINGS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: "W A S D", action: "Move" },
  { keys: "Mouse", action: "Look around" },
  { keys: "Left click", action: "Break block" },
  { keys: "Right click", action: "Place block" },
  { keys: "Space", action: "Jump / fly up" },
  { keys: "Double-tap Space / F", action: "Toggle creative flight" },
  { keys: "Shift", action: "Fly down / sprint on land" },
  { keys: "Ctrl", action: "Fly down (alternative)" },
  { keys: "1 – 9 / Mouse wheel", action: "Select hotbar block" },
  { keys: "P", action: "Save screenshot PNG" },
  { keys: "Escape", action: "Pause / release mouse" },
];
