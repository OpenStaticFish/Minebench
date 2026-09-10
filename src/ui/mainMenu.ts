import { DEFAULT_SEED } from "../core/constants";
import type { SettingsStore } from "../state/settings";
import { ControlsPanel } from "./controlsPanel";
import { createButton, el } from "./dom";
import { logoSvg } from "./logo";
import { SettingsPanel } from "./settingsPanel";

export interface MainMenuCallbacks {
  onPlay: (seedText: string) => void;
}

type MenuPanel = "main" | "settings" | "controls";

/** Title screen: seed entry, play action, settings and controls drawers. */
export class MainMenu {
  readonly root: HTMLDivElement;
  private readonly settingsPanel: SettingsPanel;
  private readonly controlsPanel: ControlsPanel;
  private readonly seedInput: HTMLInputElement;
  private readonly panels: Record<MenuPanel, HTMLElement>;
  private readonly playButton: HTMLButtonElement;

  constructor(
    store: SettingsStore,
    private readonly callbacks: MainMenuCallbacks,
  ) {
    this.root = el("div", "cw-screen cw-menu");

    const scrim = el("div", "cw-menu-scrim");
    this.root.appendChild(scrim);

    const panel = el("div", "cw-menu-panel");
    const header = el("header", "cw-menu-header");
    const logoWrap = el("div", "cw-menu-logo");
    logoWrap.innerHTML = logoSvg(72);
    header.appendChild(logoWrap);
    const titles = el("div", "cw-menu-titles");
    titles.appendChild(el("h1", "cw-title", "Cubewild"));
    titles.appendChild(el("p", "cw-tagline", "A tiny voxel wilderness sandbox"));
    header.appendChild(titles);
    panel.appendChild(header);

    const mainPanel = el("div", "cw-menu-body");
    const seedField = el("div", "cw-field cw-seed-field");
    seedField.appendChild(el("span", "cw-field-label", "World seed"));
    const seedRow = el("div", "cw-seed-row");
    this.seedInput = el("input", "cw-input");
    this.seedInput.type = "text";
    this.seedInput.value = String(DEFAULT_SEED);
    this.seedInput.spellcheck = false;
    this.seedInput.setAttribute("aria-label", "World seed");
    this.seedInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.callbacks.onPlay(this.seedInput.value);
    });
    const dice = el("button", "cw-dice", "Random");
    dice.type = "button";
    dice.title = "Generate a random seed";
    dice.addEventListener("click", () => {
      this.seedInput.value = String(Math.floor(Math.random() * 1_000_000_000));
    });
    seedRow.appendChild(this.seedInput);
    seedRow.appendChild(dice);
    seedField.appendChild(seedRow);
    seedField.appendChild(el("span", "cw-field-hint", "Same seed — same world. Try 20260910."));
    mainPanel.appendChild(seedField);

    const buttons = el("div", "cw-menu-buttons");
    this.playButton = createButton("Play", {
      variant: "primary",
      onClick: () => this.callbacks.onPlay(this.seedInput.value),
    });
    this.playButton.classList.add("cw-button-hero");
    buttons.appendChild(this.playButton);
    buttons.appendChild(
      createButton("Settings", { variant: "ghost", onClick: () => this.showPanel("settings") }),
    );
    buttons.appendChild(
      createButton("Controls", { variant: "ghost", onClick: () => this.showPanel("controls") }),
    );
    mainPanel.appendChild(buttons);
    panel.appendChild(mainPanel);

    const settingsPanel = el("div", "cw-menu-body");
    const settingsHead = el("div", "cw-drawer-head");
    settingsHead.appendChild(el("h2", "cw-drawer-title", "Settings"));
    settingsHead.appendChild(
      createButton("Back", { variant: "quieter", onClick: () => this.showPanel("main") }),
    );
    settingsPanel.appendChild(settingsHead);
    this.settingsPanel = new SettingsPanel(store);
    settingsPanel.appendChild(this.settingsPanel.root);
    panel.appendChild(settingsPanel);

    const controlsPanel = el("div", "cw-menu-body");
    const controlsHead = el("div", "cw-drawer-head");
    controlsHead.appendChild(el("h2", "cw-drawer-title", "Controls"));
    controlsHead.appendChild(
      createButton("Back", { variant: "quieter", onClick: () => this.showPanel("main") }),
    );
    controlsPanel.appendChild(controlsHead);
    this.controlsPanel = new ControlsPanel();
    controlsPanel.appendChild(this.controlsPanel.root);
    panel.appendChild(controlsPanel);

    const footer = el("footer", "cw-menu-footer");
    footer.appendChild(
      el(
        "span",
        "cw-footer-note",
        "Original indie prototype — not affiliated with any block-building game.",
      ),
    );
    footer.appendChild(el("span", "cw-footer-note", "Bun · TypeScript · Three.js"));
    panel.appendChild(footer);

    this.root.appendChild(panel);
    this.panels = { main: mainPanel, settings: settingsPanel, controls: controlsPanel };
    this.showPanel("main");
  }

  showPanel(panel: MenuPanel): void {
    for (const [name, node] of Object.entries(this.panels)) {
      node.classList.toggle("is-active", name === panel);
    }
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("is-visible", visible);
    this.root.setAttribute("aria-hidden", String(!visible));
    if (visible) {
      this.showPanel("main");
      window.setTimeout(() => this.playButton.focus({ preventScroll: true }), 30);
    }
  }

  get seedText(): string {
    return this.seedInput.value;
  }

  setSeed(value: string): void {
    this.seedInput.value = value;
  }

  focusPlay(): void {
    this.playButton.focus({ preventScroll: true });
  }
}
