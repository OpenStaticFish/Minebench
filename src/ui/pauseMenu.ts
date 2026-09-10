import type { SettingsStore } from "../state/settings";
import { ControlsPanel } from "./controlsPanel";
import { createButton, el } from "./dom";
import { SettingsPanel } from "./settingsPanel";

export interface PauseMenuCallbacks {
  onResume: () => void;
  onScreenshot: () => void;
  onQuit: () => void;
}

type PausePanel = "main" | "settings" | "controls";

/** Overlay shown when the player pauses (Escape / pointer lock release). */
export class PauseMenu {
  readonly root: HTMLDivElement;
  private readonly settingsPanel: SettingsPanel;
  private readonly controlsPanel: ControlsPanel;
  private readonly panels: Record<PausePanel, HTMLElement>;
  private readonly resumeButton: HTMLButtonElement;

  constructor(
    store: SettingsStore,
    private readonly callbacks: PauseMenuCallbacks,
  ) {
    this.root = el("div", "cw-screen cw-pause");
    this.root.appendChild(el("div", "cw-pause-backdrop"));

    const panel = el("div", "cw-pause-panel");
    panel.appendChild(el("h1", "cw-pause-title", "Paused"));
    panel.appendChild(el("p", "cw-pause-sub", "The wilderness will wait."));

    const mainPanel = el("div", "cw-menu-body");
    const buttons = el("div", "cw-menu-buttons");
    this.resumeButton = createButton("Resume", {
      variant: "primary",
      onClick: () => this.callbacks.onResume(),
    });
    buttons.appendChild(this.resumeButton);
    buttons.appendChild(
      createButton("Screenshot (P)", {
        variant: "ghost",
        onClick: () => this.callbacks.onScreenshot(),
      }),
    );
    buttons.appendChild(
      createButton("Settings", { variant: "ghost", onClick: () => this.showPanel("settings") }),
    );
    buttons.appendChild(
      createButton("Controls", { variant: "ghost", onClick: () => this.showPanel("controls") }),
    );
    buttons.appendChild(
      createButton("Quit to menu", { variant: "quieter", onClick: () => this.callbacks.onQuit() }),
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

    this.root.appendChild(panel);
    this.panels = { main: mainPanel, settings: settingsPanel, controls: controlsPanel };
    this.showPanel("main");
  }

  private showPanel(panel: PausePanel): void {
    for (const [name, node] of Object.entries(this.panels)) {
      node.classList.toggle("is-active", name === panel);
    }
  }

  show(): void {
    this.root.classList.add("is-visible");
    this.root.setAttribute("aria-hidden", "false");
    this.showPanel("main");
    window.setTimeout(() => this.resumeButton.focus({ preventScroll: true }), 30);
  }

  hide(): void {
    this.root.classList.remove("is-visible");
    this.root.setAttribute("aria-hidden", "true");
  }

  get isOpen(): boolean {
    return this.root.classList.contains("is-visible");
  }
}
