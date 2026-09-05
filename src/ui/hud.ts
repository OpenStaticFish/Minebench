import { HOTBAR, BLOCKS } from "../game/blocks";
import { blockIconDataURL } from "../game/textures";

/** In-game HUD: crosshair, hotbar, status readouts, toasts. */
export class Hud {
  readonly root: HTMLElement;
  private hotbarEl: HTMLElement;
  private posEl: HTMLElement;
  private fpsEl: HTMLElement;
  private flyingEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer: number | null = null;
  private icons: string[] = [];

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "hud";
    this.root.classList.add("hidden");

    const top = document.createElement("div");
    top.className = "hud-top";
    const stats = document.createElement("div");
    stats.className = "hud-stats pixel-panel";
    this.posEl = document.createElement("span");
    this.fpsEl = document.createElement("span");
    stats.append(this.posEl, this.fpsEl);
    this.flyingEl = document.createElement("div");
    this.flyingEl.className = "flying-badge pixel-panel hidden";
    this.flyingEl.textContent = "FLYING";
    top.append(stats, this.flyingEl);

    const crosshair = document.createElement("div");
    crosshair.className = "crosshair";
    crosshair.setAttribute("aria-hidden", "true");

    this.hotbarEl = document.createElement("div");
    this.hotbarEl.className = "hotbar";
    this.hotbarEl.setAttribute("role", "toolbar");
    this.hotbarEl.setAttribute("aria-label", "Block selection");
    this.icons = HOTBAR.map((id) => blockIconDataURL(id));
    HOTBAR.forEach((id, i) => {
      const slot = document.createElement("button");
      slot.className = "hotbar-slot";
      slot.dataset.slot = String(i);
      slot.title = BLOCKS[id]!.name;
      slot.setAttribute("aria-label", `${i + 1}: ${BLOCKS[id]!.name}`);
      const img = document.createElement("img");
      img.src = this.icons[i]!;
      img.alt = "";
      img.draggable = false;
      slot.append(img);
      this.hotbarEl.append(slot);
    });

    const hint = document.createElement("div");
    hint.className = "hud-hint";
    hint.textContent = "2×Space fly · LMB break · RMB place · wheel select · P screenshot · Esc pause";

    this.toastEl = document.createElement("div");
    this.toastEl.className = "toast pixel-panel hidden";

    this.root.append(top, crosshair, this.hotbarEl, hint, this.toastEl);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle("hidden", !v);
  }

  setSelected(index: number): void {
    this.hotbarEl.querySelectorAll(".hotbar-slot").forEach((el, i) => {
      el.classList.toggle("selected", i === index);
      if (i === index) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
    });
  }

  updateInfo(x: number, y: number, z: number, fps: number, flying: boolean): void {
    this.posEl.textContent = `XYZ ${x.toFixed(0)} ${y.toFixed(0)} ${z.toFixed(0)}`;
    this.fpsEl.textContent = `${fps} FPS`;
    this.flyingEl.classList.toggle("hidden", !flying);
  }

  toast(message: string, ms = 1600): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove("hidden");
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.add("hidden");
      this.toastTimer = null;
    }, ms);
  }
}
