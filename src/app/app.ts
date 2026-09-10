import * as THREE from "three";
import { DEFAULT_SEED } from "../core/constants";
import { Game, type FrameInput } from "../game/game";
import { Input } from "../input/input";
import { SettingsStore } from "../state/settings";
import { Hud, LoadingOverlay } from "../ui/hud";
import { MainMenu } from "../ui/mainMenu";
import { PauseMenu } from "../ui/pauseMenu";
import { Toasts } from "../ui/toast";
import { BIOME_NAMES, seedFromString } from "../world/worldgen";

export type AppState = "boot" | "menu" | "playing" | "paused";

export interface CubewildDebug {
  ready: boolean;
  state: AppState;
  pendingChunks: number;
  renderedChunks: number;
  seed: number;
  capture: () => string;
  startGame: (seed?: number) => void;
  poseForScreenshot: () => void;
  playerPosition: () => { x: number; y: number; z: number };
  isFlying: () => boolean;
  getBlock: (x: number, y: number, z: number) => number;
  lookAt: (x: number, y: number, z: number) => void;
  setSlot: (index: number) => void;
  selectedBlock: () => number;
  target: () => { x: number; y: number; z: number } | null;
}

declare global {
  interface Window {
    cubewild?: CubewildDebug;
  }
}

export interface AppOptions {
  canvas: HTMLCanvasElement;
  initialShot?: "menu" | "game" | null;
  initialSeed?: number;
}

/**
 * Application shell: owns the game loop, UI screens and state transitions
 * between menu, loading, playing and paused.
 */
export class App {
  private readonly game: Game;
  private readonly input = new Input();
  private readonly settings = new SettingsStore();
  private readonly hud: Hud;
  private readonly loading: LoadingOverlay;
  private readonly menu: MainMenu;
  private readonly pause: PauseMenu;
  private readonly toasts = new Toasts();

  private state: AppState = "boot";
  private readonly initialShot: "menu" | "game" | null;
  private lastTime = 0;
  private bootPending = 0;
  private fps = 60;
  private lastPauseToggle = 0;
  private disposed = false;

  constructor(private readonly options: AppOptions) {
    this.initialShot = options.initialShot ?? null;
    this.game = new Game(options.canvas, options.initialSeed ?? DEFAULT_SEED);
    this.hud = new Hud(this.game.atlas);
    this.loading = new LoadingOverlay();
    this.menu = new MainMenu(this.settings, {
      onPlay: (seedText) => this.handlePlay(seedText),
    });
    this.pause = new PauseMenu(this.settings, {
      onResume: () => this.resumeGame(),
      onScreenshot: () => this.handleScreenshot(),
      onQuit: () => this.quitToMenu(),
    });

    if (options.initialSeed !== undefined) {
      this.menu.setSeed(String(options.initialSeed));
    }

    const root = document.getElementById("ui-root");
    if (root) {
      root.appendChild(this.menu.root);
      root.appendChild(this.hud.root);
      root.appendChild(this.pause.root);
      root.appendChild(this.loading.root);
      root.appendChild(this.toasts.root);
    }

    this.input.attach(options.canvas);
    this.input.enabled = false;
    this.input.on("flyToggle", () => this.handleFlyToggle());
    this.input.on("pause", () => this.togglePause());
    this.input.on("screenshot", () => this.handleScreenshot());
    this.input.on("slot", (index) => this.selectSlot(index));
    this.input.on("wheelSlot", (direction) => this.cycleSlot(direction));

    this.hud.onSelectSlot = (index) => this.selectSlot(index);

    this.settings.subscribe((settings) => this.game.applySettings(settings));
    this.game.applySettings(this.settings.current);
    this.game.setMode("cinematic");

    this.hud.setVisible(false);
    this.menu.setVisible(false);
    this.pause.hide();
    this.loading.setVisible(true);
    this.loading.setProgress(0, "Preparing terrain");

    window.addEventListener("resize", this.handleResize);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.handleResize();
    this.exposeDebugApi();

    this.menu.focusPlay();
    requestAnimationFrame(this.frame);
  }

  private handleResize = (): void => {
    this.game.resize(window.innerWidth, window.innerHeight);
  };

  private handleVisibility = (): void => {
    if (document.hidden && this.state === "playing") this.pauseGame();
  };

  private frame = (time: number): void => {
    if (this.disposed) return;
    const delta = this.lastTime === 0 ? 0.016 : Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    this.fps += (1 / Math.max(delta, 1e-4) - this.fps) * 0.06;

    switch (this.state) {
      case "boot": {
        this.game.update(delta);
        if (this.bootPending === 0) this.bootPending = Math.max(1, this.game.pendingChunks);
        const pending = this.game.pendingChunks;
        this.loading.setProgress(
          1 - pending / this.bootPending,
          pending > 0 ? `${pending} chunks to shape` : "Ready",
        );
        if (pending === 0) this.finishBoot();
        break;
      }
      case "menu": {
        this.game.update(delta);
        break;
      }
      case "playing": {
        this.game.update(delta, this.buildFrameInput());
        this.updateHud();
        break;
      }
      case "paused": {
        this.game.update(delta);
        this.updateHud();
        break;
      }
    }

    this.game.render();
    if (window.cubewild) {
      window.cubewild.pendingChunks = this.game.pendingChunks;
      window.cubewild.renderedChunks = this.game.renderedChunks;
      window.cubewild.state = this.state;
      window.cubewild.ready = this.state !== "boot";
      window.cubewild.seed = this.game.seed;
    }
    requestAnimationFrame(this.frame);
  };

  private finishBoot(): void {
    if (this.initialShot === "game") {
      this.startShotSession();
      return;
    }
    this.showMenu();
  }

  private showMenu(): void {
    this.state = "menu";
    this.input.enabled = false;
    this.input.exitPointerLock();
    this.game.setMode("cinematic");
    this.game.setViewDistance(this.settings.current.viewDistance);
    this.hud.setVisible(false);
    this.pause.hide();
    this.loading.setVisible(false);
    this.menu.setVisible(true);
    this.menu.focusPlay();
  }

  private handlePlay(seedText: string): void {
    const seed = seedFromString(seedText);
    if (seed !== this.game.seed) this.game.startWorld(seed);
    this.menu.setSeed(String(seed));
    this.enterPlaying(true);
  }

  private startShotSession(): void {
    const seed = this.options.initialSeed ?? DEFAULT_SEED;
    if (seed !== this.game.seed) this.game.startWorld(seed);
    this.enterPlaying(false);
    this.game.poseForScreenshot();
  }

  private enterPlaying(requestLock: boolean): void {
    this.state = "playing";
    this.input.enabled = true;
    this.menu.setVisible(false);
    this.pause.hide();
    this.loading.setVisible(false);
    this.game.setMode("playing");
    this.game.setViewDistance(this.settings.current.viewDistance);
    this.game.resetPlayerToSpawn();
    this.hud.setVisible(true);
    this.hud.setSelected(this.game.selectedSlot);
    this.input.clearMouseDelta();
    if (requestLock) this.input.requestPointerLock();
  }

  private pauseGame(): void {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.input.enabled = false;
    this.input.exitPointerLock();
    this.game.setMode("paused");
    this.pause.show();
  }

  private resumeGame(): void {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.input.enabled = true;
    this.pause.hide();
    this.game.setMode("playing");
    this.input.clearMouseDelta();
    this.input.requestPointerLock();
  }

  private togglePause(): void {
    const now = performance.now();
    if (now - this.lastPauseToggle < 350) return;
    this.lastPauseToggle = now;
    if (this.state === "playing") this.pauseGame();
    else if (this.state === "paused") this.resumeGame();
  }

  private quitToMenu(): void {
    this.state = "menu";
    this.input.enabled = false;
    this.input.exitPointerLock();
    this.game.setMode("cinematic");
    this.game.setViewDistance(this.settings.current.viewDistance);
    this.game.resetPlayerToSpawn();
    this.hud.setVisible(false);
    this.pause.hide();
    this.menu.setVisible(true);
    this.menu.focusPlay();
  }

  private handleScreenshot(): void {
    if (this.state !== "playing" && this.state !== "paused") return;
    const name = this.game.downloadScreenshot();
    this.toasts.show(`Screenshot saved · ${name}`, { tone: "success", timeoutMs: 3200 });
  }

  private handleFlyToggle(): void {
    if (this.state !== "playing") return;
    this.game.player.toggleFlying();
    this.toasts.show(this.game.player.flying ? "Creative flight enabled" : "Flight disabled", {
      timeoutMs: 1400,
    });
  }

  private selectSlot(index: number): void {
    this.game.selectSlot(index);
    this.hud.setSelected(this.game.selectedSlot);
  }

  private cycleSlot(direction: number): void {
    this.game.cycleSlot(direction);
    this.hud.setSelected(this.game.selectedSlot);
  }

  private buildFrameInput(): FrameInput {
    const look = this.input.consumeMouseDelta();
    const forward =
      (this.input.isDown("KeyW") ? 1 : 0) - (this.input.isDown("KeyS") ? 1 : 0);
    const strafe = (this.input.isDown("KeyD") ? 1 : 0) - (this.input.isDown("KeyA") ? 1 : 0);
    const shift = this.input.isDown("ShiftLeft") || this.input.isDown("ShiftRight");
    const ctrl = this.input.isDown("ControlLeft") || this.input.isDown("ControlRight");
    return {
      lookX: look.dx,
      lookY: look.dy,
      intent: {
        forward,
        strafe,
        jump: this.input.isDown("Space"),
        descend: shift || ctrl,
        sprint: shift,
      },
      breakHeld: this.input.isMouseDown(0),
      placeHeld: this.input.isMouseDown(2),
    };
  }

  private updateHud(): void {
    const position = this.game.player.position;
    const biome = this.game.world.biomeAt(Math.floor(position.x), Math.floor(position.z));
    this.hud.update({
      fps: this.fps,
      x: position.x,
      y: position.y,
      z: position.z,
      biome: BIOME_NAMES[biome],
      chunks: this.game.renderedChunks,
      pending: this.game.pendingChunks,
      flying: this.game.player.flying,
      inWater: this.game.player.inWater,
      seed: this.game.seed,
    });
  }

  private exposeDebugApi(): void {
    const lookTarget = new THREE.Vector3();
    window.cubewild = {
      ready: false,
      state: this.state,
      pendingChunks: 0,
      renderedChunks: 0,
      seed: this.game.seed,
      capture: () => this.game.captureFrame(),
      startGame: (seed?: number) => {
        if (seed !== undefined && seed !== this.game.seed) this.game.startWorld(seed);
        this.enterPlaying(false);
      },
      poseForScreenshot: () => this.game.poseForScreenshot(),
      playerPosition: () => {
        const position = this.game.player.position;
        return { x: position.x, y: position.y, z: position.z };
      },
      isFlying: () => this.game.player.flying,
      getBlock: (x: number, y: number, z: number) => this.game.world.getBlock(x, y, z),
      lookAt: (x: number, y: number, z: number) => {
        const eye = this.game.player.getEyePosition(lookTarget);
        const dx = x - eye.x;
        const dy = y - eye.y;
        const dz = z - eye.z;
        this.game.player.yaw = Math.atan2(-dx, -dz);
        this.game.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      },
      setSlot: (index: number) => this.selectSlot(index),
      selectedBlock: () => this.game.selectedBlock,
      target: () => {
        const hit = this.game.target;
        return hit ? { x: hit.x, y: hit.y, z: hit.z } : null;
      },
    };
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.input.dispose();
    this.game.dispose();
    delete window.cubewild;
  }
}
