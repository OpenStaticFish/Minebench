import * as THREE from "three";
import { World, WORLD_SEA_LEVEL } from "./world";
import { Player } from "./player";
import { createClouds, updateClouds } from "./clouds";
import { Block, HOTBAR_BLOCKS, BLOCKS, isSolid } from "./blocks";
import { raycast, getPlacePosition } from "./raycast";

export interface GameSettings {
  viewDistance: number;
  sensitivity: number;
  fov: number;
}

const DEFAULT_SETTINGS: GameSettings = {
  viewDistance: 5,
  sensitivity: 0.0025,
  fov: 78,
};

export class Game {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: World;
  player: Player;
  clouds: THREE.Group;
  settings: GameSettings;
  seed: number;

  // UI refs
  uiMain: HTMLElement;
  uiHud: HTMLElement;
  uiPause: HTMLElement;
  uiCoords: HTMLElement;
  uiBiome: HTMLElement;
  uiFlyBadge: HTMLElement;
  uiHotbar: HTMLElement;
  uiToast: HTMLElement;

  // state
  state: "menu" | "playing" | "paused" = "menu";
  rafId = 0;
  lastT = 0;
  selectedIdx = 0;
  hoverHit: ReturnType<typeof raycast> = null;
  highlightMesh: THREE.Mesh | null = null;
  rayFreq = 0;

  // settings UI
  viewSlider!: HTMLInputElement;
  viewVal!: HTMLElement;
  sensSlider!: HTMLInputElement;
  sensVal!: HTMLElement;
  fovSlider!: HTMLInputElement;
  fovVal!: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    const savedSeed = Number(localStorage.getItem("vox_seed") || "");
    this.seed = Number.isFinite(savedSeed) && savedSeed !== 0 ? savedSeed : Math.floor(Math.random() * 1e9);
    const savedSettings = (() => {
      try { return JSON.parse(localStorage.getItem("vox_settings") || "null"); } catch { return null; }
    })();
    this.settings = { ...DEFAULT_SETTINGS, ...(savedSettings || {}) };
    if (this.settings.viewDistance < 2) this.settings.viewDistance = 2;
    if (this.settings.viewDistance > 8) this.settings.viewDistance = 8;

    // Canvas
    this.canvas = document.createElement("canvas");
    this.canvas.id = "canvas";
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#87C4FF");
    this.scene.fog = new THREE.FogExp2("#C8E6FF", 0.016);

    // Camera
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.1, 800);

    // World
    this.world = new World({ seed: this.seed, viewDistance: this.settings.viewDistance, scene: this.scene });
    this.player = new Player({ world: this.world, camera: this.camera, sensitivity: this.settings.sensitivity });
    this.scene.add(this.player.worldCamera);

    // Lighting
    const amb = new THREE.HemisphereLight(0xffffff, 0x8CA8C8, 0.82);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xfff6e8, 1.25);
    dir.position.set(160, 220, 120);
    dir.castShadow = false;
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0xdfefff, 0.35);
    fill.position.set(-60, 80, -80);
    this.scene.add(fill);

    // Clouds
    this.clouds = createClouds();
    this.scene.add(this.clouds);

    // Highlight box
    const hlGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.0 });
    const hlEdges = new THREE.EdgesGeometry(hlGeo);
    const hlLine = new THREE.LineSegments(hlEdges, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.9 }));
    // Use a mesh with line? We'll use wireframe mesh but toggle opacity
    this.highlightMesh = new THREE.Mesh(hlGeo, new THREE.MeshBasicMaterial({ color: 0x112233, wireframe: true, transparent: true, opacity: 0 }));
    // Instead use line
    this.highlightMesh = hlLine as unknown as THREE.Mesh;
    this.highlightMesh.visible = false;
    this.scene.add(this.highlightMesh as unknown as THREE.Object3D);

    // Ground helper? Not needed

    // Build UI
    const layers = this.buildUI();
    this.uiMain = layers.main;
    this.uiHud = layers.hud;
    this.uiPause = layers.pause;
    this.uiCoords = layers.coords;
    this.uiBiome = layers.biome;
    this.uiFlyBadge = layers.fly;
    this.uiHotbar = layers.hotbar;
    this.uiToast = layers.toast;

    this.viewSlider = layers.viewSlider;
    this.viewVal = layers.viewVal;
    this.sensSlider = layers.sensSlider;
    this.sensVal = layers.sensVal;
    this.fovSlider = layers.fovSlider!;
    this.fovVal = layers.fovVal!;

    this.bindInputs();
    this.buildHotbar();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    // start loop even in menu for background preview? We'll run loop always
    this.loop(0);
    this.enterMenu();
  }

  private buildUI() {
    // Main menu
    const main = document.createElement("div");
    main.className = "menu-layer";
    main.id = "menu-main";
    main.innerHTML = `
      <div class="menu-card" role="dialog" aria-label="Main Menu">
        <div class="menu-head">
          <div class="brand-row">
            <div class="brand-mark">◈</div>
            <div>
              <div class="brand-title">VOX <span>CREST</span></div>
              <div class="brand-sub">Indie Voxel Sandbox — Prototype 0.1</div>
            </div>
          </div>
        </div>
        <div class="menu-body">
          <p class="menu-desc">
            A compact creative sandbox. Carve hills, raise towers, trace coastlines and cave mouths. Built for screenshots, made to be played. No login. Just blocks, sky, and a quiet frontier.
          </p>
          <div class="menu-actions">
            <button class="btn btn-primary" id="btn-play">▶ PLAY — ENTER FRONTIER</button>
            <button class="btn btn-ghost" id="btn-controls">CONTROLS & HELP</button>
          </div>

          <div class="settings-grid">
            <div class="field">
              <label>Seed <span style="text-transform:none; letter-spacing:0; color:var(--muted); font-size:10px;">— deterministic terrain</span></label>
              <div class="field-row">
                <input id="seed-input" type="text" value="${this.seed}" style="flex:1; background:#0f161d; border:1px solid var(--line); color:var(--text); padding:8px 10px; border-radius:8px; font-size:13px;" />
                <button class="btn btn-ghost btn-small" id="btn-random-seed">Randomize</button>
              </div>
            </div>
            <div class="field">
              <label>View Distance — <span id="view-val">${this.settings.viewDistance}</span> chunks</label>
              <div class="field-row">
                <input id="view-slider" type="range" min="2" max="8" step="1" value="${this.settings.viewDistance}" />
                <span class="value-chip" id="view-chip">${this.settings.viewDistance}</span>
              </div>
            </div>
            <div class="field">
              <label>Mouse Sensitivity — <span id="sens-val">${(this.settings.sensitivity*1000).toFixed(1)}</span></label>
              <div class="field-row">
                <input id="sens-slider" type="range" min="0.5" max="6" step="0.1" value="${(this.settings.sensitivity*1000).toFixed(1)}" />
                <span class="value-chip" id="sens-chip">${(this.settings.sensitivity*1000).toFixed(1)}</span>
              </div>
            </div>
            <div class="field">
              <label>Field of View — <span id="fov-val">${this.settings.fov}°</span></label>
              <div class="field-row">
                <input id="fov-slider" type="range" min="60" max="95" step="1" value="${this.settings.fov}" />
                <span class="value-chip" id="fov-chip">${this.settings.fov}°</span>
              </div>
            </div>
          </div>
          <div id="controls-panel" style="display:none; margin-top:16px; padding:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:10px; font-size:12px; line-height:1.7; color:var(--muted);">
            <b style="color:var(--text)">Controls</b><br>
            <span style="color:var(--text)">WASD</span> move &nbsp;•&nbsp; <span style="color:var(--text)">Mouse</span> look (click to lock) &nbsp;•&nbsp; <span style="color:var(--text)">Space</span> jump / hold to fly up<br>
            <span style="color:var(--text)">Double-tap Space</span> or <span style="color:var(--text)">F</span> toggle flight &nbsp;•&nbsp; <span style="color:var(--text)">Shift / Ctrl</span> fly down &nbsp;•&nbsp; <span style="color:var(--text)">Ctrl</span> sprint (fly)<br>
            <span style="color:var(--text)">Left click</span> break &nbsp;•&nbsp; <span style="color:var(--text)">Right click</span> place &nbsp;•&nbsp; <span style="color:var(--text)">1–9 / Scroll</span> select block &nbsp;•&nbsp; <span style="color:var(--text)">Esc</span> pause &nbsp;•&nbsp; <span style="color:var(--text)">P</span> screenshot<br>
            <div style="margin-top:8px; color:#9fb8d0;">Tip: spawn looks toward mountains. If you spawn inside foliage, break out or toggle flight.</div>
          </div>
        </div>
        <div class="menu-foot">
          <span>BUILT WITH THREE.JS + VITE • BUN • P = SCREENSHOT</span>
          <span><kbd>P</kbd> capture &nbsp; <kbd>ESC</kbd> pause</span>
        </div>
      </div>
    `;
    this.container.appendChild(main);

    // HUD
    const hud = document.createElement("div");
    hud.className = "hud hidden";
    hud.id = "hud";
    hud.innerHTML = `
      <div class="crosshair"><div class="crosshair-dot"></div></div>
      <div class="hud-top">
        <div class="hud-card">
          <div><b id="hud-title">VOX CREST</b> <span style="color:var(--muted); font-size:10px;">CREATIVE • SEED ${this.seed}</span></div>
          <div class="hud-coords" id="hud-coords">X 0 · Y 64 · Z 0</div>
          <div class="hud-coords" id="hud-biome">Plains · Sea lvl ${WORLD_SEA_LEVEL}</div>
          <div id="hud-fly" class="fly-badge off">● Walking — double-tap SPACE to fly</div>
          <div style="margin-top:6px; font-size:10px; color:var(--muted);">LMB break • RMB place • 1-9 select • ESC pause • P screenshot</div>
        </div>
        <div class="hud-card" style="min-width:auto; text-align:right;">
          <div style="font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted);">View</div>
          <div style="font-size:12px; font-weight:700;" id="hud-view">— chunks</div>
          <div style="font-size:10px; color:var(--muted);" id="hud-fps">60 FPS</div>
        </div>
      </div>
      <div class="hotbar-wrap">
        <div class="hotbar" id="hotbar"></div>
        <div class="hotbar-hint" id="hotbar-hint">Grass — LMB break • RMB place</div>
      </div>
      <div class="help-bubble" id="help-bubble">
        <b>Quick Start</b><br>
        Click to lock mouse. <b>Double-Space</b> to fly.<br>
        Explore → coast has sand, highlands have stone.
      </div>
      <div class="toast" id="toast"></div>
    `;
    this.container.appendChild(hud);

    // Pause
    const pause = document.createElement("div");
    pause.className = "pause-layer hidden";
    pause.id = "pause";
    pause.innerHTML = `
      <div class="pause-card">
        <div class="pause-title">Paused</div>
        <div class="pause-actions">
          <button class="btn btn-primary" id="btn-resume">Resume</button>
          <button class="btn btn-ghost" id="btn-settings">Settings</button>
          <button class="btn btn-ghost" id="btn-to-menu">Return to Menu</button>
          <button class="btn btn-ghost" id="btn-screenshot">📸 Save Screenshot (P)</button>
        </div>
        <div id="pause-settings" style="display:none;" class="settings-grid">
          <div class="field">
            <label>View Distance — <span id="p-view-val">${this.settings.viewDistance}</span></label>
            <div class="field-row">
              <input id="p-view-slider" type="range" min="2" max="8" step="1" value="${this.settings.viewDistance}" />
              <span class="value-chip" id="p-view-chip">${this.settings.viewDistance}</span>
            </div>
          </div>
          <div class="field">
            <label>Mouse Sensitivity — <span id="p-sens-val">${(this.settings.sensitivity*1000).toFixed(1)}</span></label>
            <div class="field-row">
              <input id="p-sens-slider" type="range" min="0.5" max="6" step="0.1" value="${(this.settings.sensitivity*1000).toFixed(1)}" />
              <span class="value-chip" id="p-sens-chip">${(this.settings.sensitivity*1000).toFixed(1)}</span>
            </div>
          </div>
          <div class="field">
            <label>Field of View — <span id="p-fov-val">${this.settings.fov}°</span></label>
            <div class="field-row">
              <input id="p-fov-slider" type="range" min="60" max="95" step="1" value="${this.settings.fov}" />
              <span class="value-chip" id="p-fov-chip">${this.settings.fov}°</span>
            </div>
          </div>
          <div style="font-size:11px; color:var(--muted); margin-top:6px;">Changes apply instantly.</div>
        </div>
      </div>
    `;
    this.container.appendChild(pause);

    // Refs
    const coords = hud.querySelector("#hud-coords") as HTMLElement;
    const biome = hud.querySelector("#hud-biome") as HTMLElement;
    const fly = hud.querySelector("#hud-fly") as HTMLElement;
    const hotbar = hud.querySelector("#hotbar") as HTMLElement;
    const toast = hud.querySelector("#toast") as HTMLElement;

    const viewSlider = main.querySelector("#view-slider") as HTMLInputElement;
    const viewVal = main.querySelector("#view-chip") as HTMLElement;
    const viewLabel = main.querySelector("#view-val") as HTMLElement;
    const sensSlider = main.querySelector("#sens-slider") as HTMLInputElement;
    const sensVal = main.querySelector("#sens-chip") as HTMLElement;
    const sensLabel = main.querySelector("#sens-val") as HTMLElement;
    const fovSlider = main.querySelector("#fov-slider") as HTMLInputElement;
    const fovVal = main.querySelector("#fov-chip") as HTMLElement;
    const fovLabel = main.querySelector("#fov-val") as HTMLElement;

    // wire dummy to keep both labels in sync
    const syncView = (v: string) => { viewVal.textContent = v; viewLabel.textContent = v; const pv = pause.querySelector("#p-view-chip") as HTMLElement; const pl = pause.querySelector("#p-view-val") as HTMLElement; if(pv) pv.textContent=v; if(pl) pl.textContent=v; const hv = hud.querySelector("#hud-view") as HTMLElement; if(hv) hv.textContent = `${v} chunks`; };
    const syncSens = (v: string) => { sensVal.textContent=v; sensLabel.textContent=v; const pv = pause.querySelector("#p-sens-chip") as HTMLElement; const pl = pause.querySelector("#p-sens-val") as HTMLElement; if(pv) pv.textContent=v; if(pl) pl.textContent=v; };
    const syncFov = (v: string) => { fovVal.textContent = v+"°"; fovLabel.textContent=v+"°"; const pv = pause.querySelector("#p-fov-chip") as HTMLElement; const pl = pause.querySelector("#p-fov-val") as HTMLElement; if(pv) pv.textContent=v+"°"; if(pl) pl.textContent=v+"°"; };

    // attach listeners later outside, but store refs
    // @ts-ignore inject sync helpers
    (viewSlider as any)._sync = syncView;
    (sensSlider as any)._sync = syncSens;
    (fovSlider as any)._sync = syncFov;

    return {
      main, hud, pause, coords, biome, fly, hotbar, toast,
      viewSlider, viewVal, sensSlider, sensVal, fovSlider, fovVal
    };
  }

  private buildHotbar() {
    this.uiHotbar.innerHTML = "";
    HOTBAR_BLOCKS.forEach((b, i) => {
      const def = BLOCKS[b];
      const slot = document.createElement("div");
      slot.className = "hotbar-slot" + (i === this.selectedIdx ? " active" : "");
      slot.dataset.idx = String(i);
      const color = def.topColor || def.color;
      slot.innerHTML = `
        <span class="slot-key">${i+1}</span>
        <span class="slot-icon" style="background:${color}; ${b===Block.WATER ? 'opacity:0.85; border-color:#6bb8e8;' : ''} ${b===Block.LEAVES ? 'border-radius:3px;' : ''}"></span>
        <span class="slot-label">${def.name}</span>
      `;
      slot.addEventListener("click", () => this.selectSlot(i));
      this.uiHotbar.appendChild(slot);
    });
    this.updateHotbarHint();
  }

  private selectSlot(i: number) {
    this.selectedIdx = i;
    for (const el of this.uiHotbar.children) el.classList.remove("active");
    this.uiHotbar.children[i]?.classList.add("active");
    this.updateHotbarHint();
  }
  private updateHotbarHint() {
    const b = HOTBAR_BLOCKS[this.selectedIdx]!;
    const def = BLOCKS[b];
    const hint = document.getElementById("hotbar-hint") as HTMLElement;
    if (hint) hint.textContent = `${def.name} — LMB break • RMB place • Scroll to switch`;
  }

  private bindInputs() {
    // buttons
    const btnPlay = document.getElementById("btn-play")!;
    const btnControls = document.getElementById("btn-controls")!;
    const controlsPanel = document.getElementById("controls-panel")!;
    const btnRandom = document.getElementById("btn-random-seed")!;
    const seedInput = document.getElementById("seed-input") as HTMLInputElement;
    const btnResume = document.getElementById("btn-resume")!;
    const btnToMenu = document.getElementById("btn-to-menu")!;
    const btnSettings = document.getElementById("btn-settings")!;
    const pauseSettings = document.getElementById("pause-settings")!;
    const btnScreenshot = document.getElementById("btn-screenshot")!;

    btnPlay.addEventListener("click", () => {
      const v = Number(seedInput.value);
      if (Number.isFinite(v) && v !== 0) this.seed = v >>> 0;
      localStorage.setItem("vox_seed", String(this.seed));
      this.startGame();
    });
    btnControls.addEventListener("click", () => {
      const shown = controlsPanel.style.display !== "none";
      controlsPanel.style.display = shown ? "none" : "block";
      btnControls.textContent = shown ? "CONTROLS & HELP" : "HIDE CONTROLS";
    });
    btnRandom.addEventListener("click", () => {
      const r = Math.floor(Math.random()*1e9);
      seedInput.value = String(r);
    });

    btnResume.addEventListener("click", () => this.resume());
    btnToMenu.addEventListener("click", () => this.enterMenu());
    btnSettings.addEventListener("click", () => {
      pauseSettings.style.display = pauseSettings.style.display === "none" ? "grid" : "none";
    });
    btnScreenshot.addEventListener("click", () => this.captureScreenshot());

    // Settings sliders main
    const onView = (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.settings.viewDistance = v;
      (this.viewSlider as any)._sync(String(v));
      const pSlider = document.getElementById("p-view-slider") as HTMLInputElement;
      if (pSlider) pSlider.value = String(v);
      this.world.updateViewDistance(v, this.player.pos.x, this.player.pos.z);
      this.saveSettings();
      this.showToast(`View distance: ${v} chunks`);
    };
    const onSens = (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value) / 1000;
      this.settings.sensitivity = v;
      (this.sensSlider as any)._sync(((v*1000).toFixed(1)));
      const pSlider = document.getElementById("p-sens-slider") as HTMLInputElement;
      if (pSlider) pSlider.value = String(v*1000);
      this.player.setSensitivity(v);
      this.saveSettings();
    };
    const onFov = (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.settings.fov = v;
      (this.fovSlider as any)._sync(String(v));
      const pSlider = document.getElementById("p-fov-slider") as HTMLInputElement;
      if (pSlider) pSlider.value = String(v);
      this.camera.fov = v;
      this.camera.updateProjectionMatrix();
      this.saveSettings();
    };
    this.viewSlider.addEventListener("input", onView);
    this.sensSlider.addEventListener("input", onSens);
    this.fovSlider.addEventListener("input", onFov);

    // pause sliders
    const pView = document.getElementById("p-view-slider") as HTMLInputElement;
    const pSens = document.getElementById("p-sens-slider") as HTMLInputElement;
    const pFov = document.getElementById("p-fov-slider") as HTMLInputElement;
    if (pView) pView.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.settings.viewDistance = v;
      this.viewSlider.value = String(v);
      (this.viewSlider as any)._sync(String(v));
      this.world.updateViewDistance(v, this.player.pos.x, this.player.pos.z);
      this.saveSettings();
    });
    if (pSens) pSens.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value)/1000;
      this.settings.sensitivity = v;
      this.sensSlider.value = String(v*1000);
      (this.sensSlider as any)._sync((v*1000).toFixed(1));
      this.player.setSensitivity(v);
      this.saveSettings();
    });
    if (pFov) pFov.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.settings.fov = v;
      this.fovSlider.value = String(v);
      (this.fovSlider as any)._sync(String(v));
      this.camera.fov = v; this.camera.updateProjectionMatrix();
      this.saveSettings();
    });

    // canvas pointer lock
    this.canvas.addEventListener("click", () => {
      if (this.state === "playing") {
        if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock();
      }
    });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement === this.canvas) {
        if (this.state === "paused") this.resume();
      } else {
        if (this.state === "playing") {
          // if not manually paused, show pause? Only if esc
          // We'll let ESC handler manage; if click lost, don't auto pause unless pressing esc
        }
      }
    });
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === this.canvas && this.state === "playing") {
        this.player.handleMouseMove(e.movementX, e.movementY);
      }
    });

    // keyboard
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.player.handleKeyUp(e));

    // mouse block interactions
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.state !== "playing") return;
      if (document.pointerLockElement !== this.canvas) return;
      if (e.button === 0) this.breakBlock();
      if (e.button === 2) this.placeBlock();
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("wheel", (e) => {
      if (this.state !== "playing") return;
      e.preventDefault();
      const dir = Math.sign(e.deltaY);
      let idx = this.selectedIdx + dir;
      if (idx < 0) idx = HOTBAR_BLOCKS.length - 1;
      if (idx >= HOTBAR_BLOCKS.length) idx = 0;
      this.selectSlot(idx);
    }, { passive: false });

    // prevent tab search etc
    window.addEventListener("blur", () => {
      this.player.keys.clear();
    });
  }

  private saveSettings() {
    localStorage.setItem("vox_settings", JSON.stringify(this.settings));
    const t = document.getElementById("hud-title") as HTMLElement;
    if (t) t.nextElementSibling && (t.nextElementSibling.textContent = `CREATIVE • SEED ${this.seed}`);
  }

  private onKeyDown(e: KeyboardEvent) {
    // screenshot always
    if (e.code === "KeyP" && (this.state === "playing" || this.state === "menu" || this.state === "paused")) {
      // avoid typing in seed input
      if (document.activeElement?.tagName === "INPUT") return;
      e.preventDefault();
      this.captureScreenshot();
      return;
    }

    if (this.state === "menu") {
      if (e.code === "Enter") {
        const seedInput = document.getElementById("seed-input") as HTMLInputElement;
        const v = Number(seedInput.value);
        if (Number.isFinite(v) && v !== 0) this.seed = v >>> 0;
        this.startGame();
      }
      return;
    }

    if (e.code === "Escape") {
      e.preventDefault();
      if (this.state === "playing") this.pause();
      else if (this.state === "paused") this.resume();
      return;
    }
    if (this.state !== "playing") return;

    // number keys hotbar
    if (e.code.startsWith("Digit")) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 9) this.selectSlot(n - 1);
    }

    this.player.handleKeyDown(e);
  }

  private enterMenu() {
    this.state = "menu";
    this.uiMain.classList.remove("hidden");
    this.uiHud.classList.add("hidden");
    this.uiPause.classList.add("hidden");
    document.exitPointerLock?.();
    // ensure world visible preview: place camera at nice angle for screenshot
    this.player.pos.set(0, 44, 22);
    this.player.yaw = Math.PI * 0.95;
    this.player.pitch = -0.18;
    this.player.flying = true;
    this.player.update(0);
    // ensure chunks around menu cam
    this.world.seed = this.seed;
    // clear chunks and regenerate
    for (const ch of this.world.chunks.values()) {
      this.world.scene.remove(ch.mesh);
      if (ch.waterMesh) this.world.scene.remove(ch.waterMesh);
      ch.dispose();
    }
    this.world.chunks.clear();
    this.world.ensureChunksAround(this.player.pos.x, this.player.pos.z);
    // sync hud seed display? but hud hidden
    this.saveSettings();
  }

  private startGame() {
    this.state = "playing";
    this.uiMain.classList.add("hidden");
    this.uiHud.classList.remove("hidden");
    this.uiPause.classList.add("hidden");

    // apply seed if changed
    const seedInput = document.getElementById("seed-input") as HTMLInputElement | null;
    if (seedInput) {
      const v = Number(seedInput.value);
      if (Number.isFinite(v) && v !== 0 && v !== this.seed) {
        this.seed = v >>> 0;
        this.world.seed = this.seed;
        for (const ch of this.world.chunks.values()) {
          this.world.scene.remove(ch.mesh);
          if (ch.waterMesh) this.world.scene.remove(ch.waterMesh);
          ch.dispose();
        }
        this.world.chunks.clear();
      } else {
        this.world.seed = this.seed;
      }
    }

    // spawn player safely
    this.player.world = this.world;
    // find nice spawn near 40,40 with good view: search for high ground
    let spawnX = 24 + (this.seed % 80);
    let spawnZ = 18 + ((this.seed * 7) % 80);
    // clamp to avoid ocean spawn: sample height
    this.player.spawnAt(spawnX, spawnZ);
    this.player.flying = false; // start walking
    this.player.update(0);
    this.world.ensureChunksAround(this.player.pos.x, this.player.pos.z);
    this.canvas.focus();
    // request pointer lock next click
    this.showToast("Click to lock mouse • Double-Space to fly");
    this.updateHud();
  }

  private pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.uiPause.classList.remove("hidden");
    document.exitPointerLock?.();
  }
  private resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.uiPause.classList.add("hidden");
    this.canvas.requestPointerLock?.();
  }

  private breakBlock() {
    if (!this.hoverHit) return;
    const { x, y, z } = this.hoverHit;
    // don't break bedrock at y=0?
    if (y === 0) { this.showToast("Bedrock is unbreakable"); return; }
    this.world.setBlock(x, y, z, Block.AIR);
    this.showToast(`Broke ${BLOCKS[this.hoverHit.blockId as Block]?.name || "block"}`);
  }
  private placeBlock() {
    if (!this.hoverHit) return;
    const pos = getPlacePosition(this.hoverHit);
    if (!pos) return;
    if (pos.y < 0 || pos.y >= 96) return;
    // prevent placing inside player
    const p = this.player.pos;
    const r = this.player.radius;
    const h = this.player.height;
    if (pos.x + 1 > p.x - r && pos.x < p.x + r && pos.z + 1 > p.z - r && pos.z < p.z + r && pos.y + 1 > p.y && pos.y < p.y + h) {
      this.showToast("Cannot place inside yourself");
      return;
    }
    const cur = this.world.getBlock(pos.x, pos.y, pos.z);
    if (isSolid(cur)) return;
    const blockId = HOTBAR_BLOCKS[this.selectedIdx]!;
    // water placement: if placing water, allow replacing air
    this.world.setBlock(pos.x, pos.y, pos.z, blockId);
  }

  captureScreenshot() {
    // render one frame then download
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    const a = document.createElement("a");
    const name = this.state === "menu" ? "main-menu.png" : "in-game.png";
    // If in paused, use in-game.png as well
    const fname = this.state === "menu" ? "main-menu.png" : "in-game.png";
    a.href = url;
    a.download = fname;
    a.click();
    this.showToast(`Screenshot saved → ${fname} (check downloads; move to screenshots/ if needed)`);
    // also try to save via Bun? No; browser security prevents direct FS. Document.
  }

  private showToast(msg: string) {
    this.uiToast.textContent = msg;
    this.uiToast.classList.add("show");
    clearTimeout((this.uiToast as any)._t);
    (this.uiToast as any)._t = setTimeout(() => this.uiToast.classList.remove("show"), 2200);
  }

  private updateHud() {
    const p = this.player.pos;
    this.uiCoords.textContent = `X ${p.x.toFixed(1)} · Y ${p.y.toFixed(1)} · Z ${p.z.toFixed(1)}`;
    // biome approx
    const h = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 1), Math.floor(p.z));
    const biomeName = (() => {
      if (p.y < WORLD_SEA_LEVEL - 1) return "Ocean";
      if (h === Block.SAND) return "Beach";
      if (p.y > 62) return "Highlands";
      if (p.y > 48) return "Hills";
      return "Plains";
    })();
    this.uiBiome.textContent = `${biomeName} · Sea lvl ${WORLD_SEA_LEVEL} · ${this.world.chunks.size} chunks`;
    const fly = this.player.flying;
    this.uiFlyBadge.textContent = fly ? "✦ FLYING — Space ↑ · Shift ↓ · Double-Space to land" : "● Walking — double-tap SPACE or press F to fly";
    this.uiFlyBadge.className = fly ? "fly-badge" : "fly-badge off";
    const hv = document.getElementById("hud-view") as HTMLElement;
    if (hv) hv.textContent = `${this.settings.viewDistance} chunks`;
    const fpsEl = document.getElementById("hud-fps") as HTMLElement;
    if (fpsEl && this.lastFps) fpsEl.textContent = `${this.lastFps} FPS · ${this.world.getStats().blocks.toLocaleString()} blocks`;
  }
  private lastFps = 60;
  private fpsAcc = 0;
  private fpsCount = 0;
  private fpsTimer = 0;

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (t: number) => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (t - this.lastT) / 1000 || 0);
    this.lastT = t;

    // FPS
    this.fpsAcc += dt;
    this.fpsCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer > 0.5) {
      this.lastFps = Math.round(this.fpsCount / this.fpsTimer);
      this.fpsCount = 0; this.fpsTimer = 0;
    }

    // update clouds
    updateClouds(this.clouds, dt);

    // state updates
    if (this.state === "playing") {
      this.player.update(dt);
      this.world.ensureChunksAround(this.player.pos.x, this.player.pos.z);
      // raycast highlight at ~20 Hz
      this.rayFreq += dt;
      if (this.rayFreq > 0.05) {
        this.rayFreq = 0;
        const eye = this.player.getEyePos();
        const dir = this.player.getLookDir();
        this.hoverHit = raycast(this.world, eye, dir, 7);
        if (this.hoverHit) {
          this.highlightMesh!.visible = true;
          (this.highlightMesh as any).position.set(this.hoverHit.x + 0.5, this.hoverHit.y + 0.5, this.hoverHit.z + 0.5);
          // make visible
          const mat = (this.highlightMesh as any).material as THREE.LineBasicMaterial;
          if (mat) mat.opacity = 0.95;
        } else {
          this.highlightMesh!.visible = false;
        }
      }
      this.updateHud();
    } else if (this.state === "menu") {
      // slow orbit camera for preview screenshot composition
      // keep player camera but gently yaw drift
      this.player.yaw += dt * 0.04;
      this.player.update(0);
      this.world.ensureChunksAround(this.player.pos.x, this.player.pos.z);
      // still need highlight off
      this.highlightMesh!.visible = false;
    } else if (this.state === "paused") {
      // still render world but not update player?
      this.world.ensureChunksAround(this.player.pos.x, this.player.pos.z);
    }

    // Fog adjust with view distance: more distance = less fog density
    const fog = this.scene.fog as THREE.FogExp2;
    const targetDensity = 0.019 - (this.settings.viewDistance - 2) * 0.0016; // 0.019 at 2 .. 0.0094 at 8
    fog.color.setHSL(0.58, 0.35, 0.88);
    (fog as any).density = targetDensity;

    // Render
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.renderer.dispose();
  }
}
