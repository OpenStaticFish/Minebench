import type { Settings } from "../game/settings";

export interface MenuCallbacks {
  onPlay: () => void;
  onSettingsChanged: (s: Settings) => void;
  onResume: () => void;
  onExitToMenu: () => void;
  onScreenshot: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void, className = "menu-btn"): HTMLButtonElement {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/**
 * All DOM overlays: main menu, pause menu, settings and controls panels.
 * One shared settings panel is reused by both menus.
 */
export class Overlays {
  readonly root: HTMLElement;
  private menuEl: HTMLElement;
  private pauseEl: HTMLElement;
  private settingsEl: HTMLElement;
  private controlsEl: HTMLElement;

  constructor(
    private settings: Settings,
    private cb: MenuCallbacks,
  ) {
    this.root = el("div", "overlays");
    this.menuEl = this.buildMenu();
    this.pauseEl = this.buildPause();
    this.settingsEl = this.buildSettings();
    this.controlsEl = this.buildControls();
    this.root.append(this.menuEl, this.pauseEl, this.settingsEl, this.controlsEl);
    this.showOnly("menu");
  }

  private showOnly(name: "menu" | "pause" | "settings" | "controls" | "none"): void {
    const map = { menu: this.menuEl, pause: this.pauseEl, settings: this.settingsEl, controls: this.controlsEl };
    for (const [key, node] of Object.entries(map)) {
      node.classList.toggle("hidden", key !== name);
      node.classList.toggle("visible", key === name);
    }
  }

  // ---- main menu -----------------------------------------------------------

  private buildMenu(): HTMLElement {
    const wrap = el("section", "overlay menu-overlay visible");
    wrap.setAttribute("aria-label", "Main menu");

    const clouds = el("div", "menu-clouds");
    clouds.setAttribute("aria-hidden", "true");

    const card = el("div", "menu-card");
    const title = el("h1", "game-title", "BLOCKVALE");
    const subtitle = el("p", "game-subtitle", "a voxel sandbox prototype");
    const buttons = el("div", "menu-buttons");
    buttons.append(
      button("Play", this.cb.onPlay, "menu-btn primary"),
      button("Settings", () => {
        this.showOnly("settings");
      }),
      button("Controls", () => {
        this.showOnly("controls");
      }),
    );
    const footer = el("p", "menu-footer", "v0.1 · original prototype · not affiliated with any block game");

    card.append(title, subtitle, buttons, footer);
    wrap.append(clouds, card);
    return wrap;
  }

  // ---- pause ---------------------------------------------------------------

  private buildPause(): HTMLElement {
    const wrap = el("section", "overlay pause-overlay hidden");
    wrap.setAttribute("aria-label", "Paused");
    const card = el("div", "menu-card small");
    card.append(
      el("h2", "pause-title", "PAUSED"),
      button("Resume", this.cb.onResume, "menu-btn primary"),
      button("Screenshot (P)", this.cb.onScreenshot),
      button("Settings", () => {
        this.showOnly("settings");
      }),
      button("Controls", () => {
        this.showOnly("controls");
      }),
      button("Exit to menu", this.cb.onExitToMenu, "menu-btn danger"),
    );
    wrap.append(card);
    return wrap;
  }

  // ---- settings ------------------------------------------------------------

  private buildSettings(): HTMLElement {
    const wrap = el("section", "overlay settings-overlay hidden");
    wrap.setAttribute("aria-label", "Settings");
    const card = el("div", "menu-card small");

    const title = el("h2", "pause-title", "SETTINGS");

    const viewRow = this.sliderRow(
      "View distance",
      `${this.settings.viewDistance} chunks`,
      { min: 2, max: 10, step: 1, value: this.settings.viewDistance },
      (v) => {
        this.settings.viewDistance = v;
        viewLabel.textContent = `${v} chunks`;
        this.commit();
      },
    );
    const viewLabel = viewRow.querySelector(".slider-value")!;

    const sensRow = this.sliderRow(
      "Mouse sensitivity",
      this.settings.sensitivity.toFixed(1),
      { min: 0.2, max: 3, step: 0.1, value: this.settings.sensitivity },
      (v) => {
        this.settings.sensitivity = v;
        sensLabel.textContent = v.toFixed(1);
        this.commit();
      },
    );
    const sensLabel = sensRow.querySelector(".slider-value")!;

    const fovRow = this.sliderRow(
      "Field of view",
      `${this.settings.fov}°`,
      { min: 60, max: 100, step: 1, value: this.settings.fov },
      (v) => {
        this.settings.fov = v;
        fovLabel.textContent = `${v}°`;
        this.commit();
      },
    );
    const fovLabel = fovRow.querySelector(".slider-value")!;

    const cloudsRow = el("div", "setting-row");
    const cloudsLabel = el("label", "setting-label");
    cloudsLabel.textContent = "Clouds";
    cloudsLabel.htmlFor = "setting-clouds";
    const cloudsToggle = el("input");
    cloudsToggle.type = "checkbox";
    cloudsToggle.id = "setting-clouds";
    cloudsToggle.checked = this.settings.clouds;
    cloudsToggle.addEventListener("change", () => {
      this.settings.clouds = cloudsToggle.checked;
      this.commit();
    });
    cloudsRow.append(cloudsLabel, cloudsToggle);

    card.append(
      title,
      viewRow,
      sensRow,
      fovRow,
      cloudsRow,
      button("Done", () => {
        this.showOnly(this.returnTo);
      }),
    );
    wrap.append(card);
    return wrap;
  }

  private sliderRow(
    labelText: string,
    valueText: string,
    attrs: { min: number; max: number; step: number; value: number },
    onInput: (v: number) => void,
  ): HTMLElement {
    const row = el("div", "setting-row");
    const label = el("label", "setting-label", labelText);
    const id = `setting-${labelText.toLowerCase().replace(/[^a-z]+/g, "-")}`;
    label.htmlFor = id;
    const value = el("span", "slider-value", valueText);
    value.id = id;
    const input = el("input");
    input.type = "range";
    input.min = String(attrs.min);
    input.max = String(attrs.max);
    input.step = String(attrs.step);
    input.value = String(attrs.value);
    input.setAttribute("aria-valuetext", valueText);
    input.addEventListener("input", () => onInput(Number(input.value)));
    row.append(label, input, value);
    return row;
  }

  private commit(): void {
    this.cb.onSettingsChanged({ ...this.settings });
  }

  private returnTo: "menu" | "pause" = "menu";

  // ---- controls ------------------------------------------------------------

  private buildControls(): HTMLElement {
    const wrap = el("section", "overlay settings-overlay hidden");
    wrap.setAttribute("aria-label", "Controls");
    const card = el("div", "menu-card small");
    card.append(el("h2", "pause-title", "CONTROLS"));

    const table = el("table", "controls-table");
    const rows: Array<[string, string]> = [
      ["W A S D", "Move"],
      ["Mouse", "Look around"],
      ["Space", "Jump / fly up"],
      ["Space ×2 or F", "Toggle flying"],
      ["Shift", "Fly down"],
      ["Left click", "Break block"],
      ["Right click", "Place block"],
      ["1–9 / Wheel", "Select block"],
      ["P", "Save screenshot"],
      ["Esc", "Pause / release mouse"],
    ];
    for (const [key, action] of rows) {
      const tr = document.createElement("tr");
      const ktd = document.createElement("td");
      const kbd = el("kbd", undefined, key);
      ktd.append(kbd);
      const atd = document.createElement("td");
      atd.textContent = action;
      tr.append(ktd, atd);
      table.append(tr);
    }
    card.append(table, button("Done", () => {
      this.showOnly(this.returnTo);
    }));
    wrap.append(card);
    return wrap;
  }

  // ---- state ---------------------------------------------------------------

  showMenu(): void {
    this.returnTo = "menu";
    this.showOnly("menu");
  }

  showPause(): void {
    this.returnTo = "pause";
    this.showOnly("pause");
  }

  hideAll(): void {
    this.showOnly("none");
  }
}
