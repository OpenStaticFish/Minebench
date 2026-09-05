import * as THREE from "three";
import { World } from "./world";
import { Player, PLAYER_SPAWN } from "./player";
import { Sky, LIGHT_DIR } from "./sky";
import { Input } from "./input";
import { raycastVoxel } from "./raycast";
import { Block, HOTBAR, BLOCKS } from "./blocks";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "./settings";
import { CHUNK_H } from "./constants";
import { Hud } from "../ui/hud";
import { Overlays } from "../ui/overlays";

export type GameState = "menu" | "playing" | "paused";

const REACH = 6;
const FLY_TOGGLE_WINDOW = 280;

/** Owns the renderer, world, player, input and UI wiring. */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private player = new Player();
  private sky: Sky;
  private sunLight: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;
  private input: Input;
  private hud: Hud;
  private overlays: Overlays;
  private highlight: THREE.LineSegments;

  private settings: Settings;
  private state: GameState = "menu";
  private hotbarIndex = 0;
  private lastSpaceAt = 0;
  private spawned = false;
  private raf = 0;
  private lastTime = 0;
  private frames = 0;
  private fpsTime = 0;
  private fps = 0;
  private suppressPauseOnUnlock = false;
  private unregister: Array<() => void> = [];

  constructor(
    container: HTMLElement,
    settings?: Partial<Settings>,
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...loadSettings(), ...settings };

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = "game-canvas";

    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      1600,
    );

    this.sunLight = new THREE.DirectionalLight(0xfff2dd, 2.1);
    this.sunLight.position.copy(LIGHT_DIR).multiplyScalar(100);
    this.scene.add(this.sunLight);
    this.ambient = new THREE.HemisphereLight(0xbfd9ff, 0x8c7a5c, 1.15);
    this.scene.add(this.ambient);

    this.world = new World(this.scene);
    this.world.viewDistance = this.settings.viewDistance;
    this.sky = new Sky(this.scene, this.fogRange(this.settings.viewDistance));
    this.sky.setCloudsVisible(this.settings.clouds);

    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x101418, transparent: true, opacity: 0.85 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud();
    this.overlays = new Overlays(this.settings, {
      onPlay: () => this.play(),
      onResume: () => this.resume(),
      onExitToMenu: () => this.exitToMenu(),
      onScreenshot: () => this.captureAndDownload(),
      onSettingsChanged: (s) => this.applySettings(s),
    });

    this.camera.position.set(PLAYER_SPAWN.x + 0.5, 40, PLAYER_SPAWN.z + 0.5);
    container.append(this.hud.root, this.overlays.root);

    this.bindEvents();
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---- state transitions ---------------------------------------------------

  play(): void {
    if (!this.spawned) {
      this.spawned = true;
      this.player.spawn(this.world, PLAYER_SPAWN.x, PLAYER_SPAWN.z);
    }
    this.state = "playing";
    this.overlays.hideAll();
    this.hud.setVisible(true);
    this.hud.setSelected(this.hotbarIndex);
    this.input.requestLock();
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.input.releaseLock();
    this.overlays.showPause();
  }

  resume(): void {
    this.state = "playing";
    this.overlays.hideAll();
    this.input.requestLock();
  }

  exitToMenu(): void {
    this.state = "menu";
    this.suppressPauseOnUnlock = true;
    this.input.releaseLock();
    this.hud.setVisible(false);
    this.overlays.showMenu();
  }

  get isRunning(): boolean {
    return this.state !== "menu";
  }

  // ---- events ---------------------------------------------------------------

  private bindEvents(): void {
    const onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    this.unregister.push(() => window.removeEventListener("resize", onResize));

    this.input.attach((locked) => {
      if (!locked && this.state === "playing" && !this.suppressPauseOnUnlock) {
        this.pause();
      }
      this.suppressPauseOnUnlock = false;
    });

    // Click canvas (while playing, unlocked) to re-grab the mouse.
    const canvasClick = () => {
      if (this.state === "playing") this.input.requestLock();
    };
    this.renderer.domElement.addEventListener("click", canvasClick);
    this.unregister.push(() => this.renderer.domElement.removeEventListener("click", canvasClick));

    const preventContext = (e: Event) => e.preventDefault();
    this.renderer.domElement.addEventListener("contextmenu", preventContext);
    this.unregister.push(() =>
      this.renderer.domElement.removeEventListener("contextmenu", preventContext),
    );

    const onDown = (e: MouseEvent) => {
      if (this.state !== "playing" || document.pointerLockElement !== this.renderer.domElement) return;
      if (e.button === 0) this.breakBlock();
      else if (e.button === 2) this.placeBlock();
    };
    document.addEventListener("mousedown", onDown);
    this.unregister.push(() => document.removeEventListener("mousedown", onDown));

    this.unregister.push(
      this.input.onPress("KeyF", () => {
        if (this.state !== "playing") return;
        this.player.flying = !this.player.flying;
        this.hud.toast(this.player.flying ? "Flying enabled" : "Flying disabled");
      }),
      this.input.onPress("Space", () => {
        if (this.state !== "playing") return;
        const now = performance.now();
        if (now - this.lastSpaceAt < FLY_TOGGLE_WINDOW) {
          this.lastSpaceAt = 0;
          this.player.flying = !this.player.flying;
          this.hud.toast(this.player.flying ? "Flying enabled" : "Flying disabled");
        } else {
          this.lastSpaceAt = now;
        }
      }),
      this.input.onPress("KeyP", () => {
        if (this.state === "menu") return;
        this.captureAndDownload();
      }),
      this.input.onPress("Escape", () => {
        if (this.state === "paused") this.resume();
      }),
    );

    for (let i = 0; i < HOTBAR.length; i++) {
      const index = i;
      this.unregister.push(
        this.input.onPress(`Digit${i + 1}`, () => {
          if (this.state !== "playing") return;
          this.selectSlot(index);
        }),
      );
    }
  }

  private selectSlot(index: number): void {
    this.hotbarIndex = index;
    this.hud.setSelected(index);
    this.hud.toast(BLOCKS[HOTBAR[index]!]!.name);
  }

  // ---- block interaction ----------------------------------------------------

  private breakBlock(): void {
    const hit = raycastVoxel(this.world, this.player.eyePosition, this.player.direction, REACH);
    if (!hit || hit.y <= 0) return;
    this.world.setBlock(hit.x, hit.y, hit.z, Block.Air);
  }

  private placeBlock(): void {
    const hit = raycastVoxel(this.world, this.player.eyePosition, this.player.direction, REACH);
    if (!hit) return;
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (y < 1 || y >= CHUNK_H) return;
    const existing = this.world.getBlock(x, y, z);
    if (existing !== Block.Air && existing !== Block.Water) return;
    if (this.player.intersectsBlock(x, y, z)) return;
    const id = HOTBAR[this.hotbarIndex]!;
    this.world.setBlock(x, y, z, id);
  }

  // ---- settings -------------------------------------------------------------

  private fogRange(viewDistance: number): { fogNear: number; fogFar: number } {
    return { fogNear: (viewDistance - 1.4) * 16, fogFar: (viewDistance + 0.4) * 16 };
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.world.viewDistance = s.viewDistance;
    const fog = this.fogRange(s.viewDistance);
    const sceneFog = this.scene.fog as THREE.Fog;
    sceneFog.near = fog.fogNear;
    sceneFog.far = fog.fogFar;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.sky.setCloudsVisible(s.clouds);
  }

  // ---- frame loop -----------------------------------------------------------

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (this.state !== "menu") {
      if (this.state === "playing") {
        const { dx, dy } = this.input.consumeMouseDelta();
        const sens = 0.0022 * this.settings.sensitivity;
        this.player.yaw -= dx * sens;
        this.player.pitch = THREE.MathUtils.clamp(
          this.player.pitch - dy * sens,
          -Math.PI / 2 + 0.01,
          Math.PI / 2 - 0.01,
        );

        const moveZ = (this.input.isDown("KeyW") ? 1 : 0) - (this.input.isDown("KeyS") ? 1 : 0);
        const moveX = (this.input.isDown("KeyD") ? 1 : 0) - (this.input.isDown("KeyA") ? 1 : 0);
        this.player.update(
          dt,
          {
            moveX,
            moveZ,
            jump: this.input.isDown("Space"),
            down: this.input.isDown("ShiftLeft") || this.input.isDown("ShiftRight"),
            flying: this.player.flying,
          },
          this.world,
        );

        const wheel = this.input.consumeWheel();
        if (wheel !== 0) {
          const n = HOTBAR.length;
          this.selectSlot((this.hotbarIndex + wheel % n + n) % n);
        }
      } else {
        this.input.consumeMouseDelta();
      }

      this.world.update(this.player.pos.x, this.player.pos.z);

      // Camera follows the player eye.
      const eye = this.player.eyePosition;
      this.camera.position.copy(eye);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);

      // Block highlight.
      const hit = raycastVoxel(this.world, eye, this.player.direction, REACH);
      if (hit) {
        this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        this.highlight.visible = true;
      } else {
        this.highlight.visible = false;
      }

      this.frames++;
      if (now - this.fpsTime > 500) {
        this.fps = Math.round((this.frames * 1000) / (now - this.fpsTime));
        this.frames = 0;
        this.fpsTime = now;
        this.hud.updateInfo(
          this.player.pos.x,
          this.player.pos.y,
          this.player.pos.z,
          this.fps,
          this.player.flying,
        );
      }
    } else {
      // Preload chunks around the spawn point while the menu is open.
      this.world.update(PLAYER_SPAWN.x + 0.5, PLAYER_SPAWN.z + 0.5);
    }

    this.sky.update(dt, this.camera);
    this.render();
  };

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // ---- screenshots ----------------------------------------------------------

  /** Renders a fresh frame and returns the canvas as a PNG data URL. */
  screenshot(): string {
    this.render();
    return this.renderer.domElement.toDataURL("image/png");
  }

  private captureAndDownload(): void {
    const url = this.screenshot();
    const a = document.createElement("a");
    a.href = url;
    a.download = "in-game.png";
    a.click();
    this.hud.toast("Screenshot saved as in-game.png", 2500);
  }

  /** Test/automation hooks (used by scripts/screenshots.ts). */
  get debug(): {
    isReady: (radius: number) => boolean;
    setPose: (x: number, y: number, z: number, yaw: number, pitch: number, flying?: boolean) => void;
    getBlock: (x: number, y: number, z: number) => number;
    probeHeight: (x: number, z: number) => number;
    chunkCount: number;
    fog: { near: number; far: number } | null;
    setViewDistance: (v: number) => void;
    pos: { x: number; y: number; z: number };
    onGround: boolean;
    testBreak: () => void;
    testPlace: () => void;
    state: GameState;
    flying: boolean;
  } {
    const world = this.world;
    const player = this.player;
    const game = this;
    return {
      isReady: (radius: number) => world.isAreaReady(player.pos.x, player.pos.z, radius),
      setPose: (x, y, z, yaw, pitch, flying = true) => {
        player.pos.set(x, y, z);
        player.vel.set(0, 0, 0);
        player.flying = flying;
        player.yaw = yaw;
        player.pitch = pitch;
      },
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    probeHeight: (x: number, z: number) => world.surfaceHeight(x, z),
    get chunkCount() {
      return world.chunkCount;
    },
    get fog() {
      const fog = game.scene.fog as THREE.Fog | null;
      return fog ? { near: fog.near, far: fog.far } : null;
    },
    setViewDistance: (v: number) => game.applySettings({ ...game.settings, viewDistance: v }),
    testBreak: () => game.breakBlock(),
      testPlace: () => game.placeBlock(),
      get state() {
        return game.state;
      },
      get pos() {
        return { x: player.pos.x, y: player.pos.y, z: player.pos.z };
      },
      get onGround() {
        return player.onGround;
      },
      get flying() {
        return player.flying;
      },
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const fn of this.unregister) fn();
    this.unregister = [];
    this.input.detach();
    this.world.dispose();
    this.sky.dispose(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
