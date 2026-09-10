import { SETTINGS_LIMITS } from "../core/constants";
import type { SettingsStore } from "../state/settings";
import { createButton, createSlider, createToggle, el } from "./dom";

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Reusable settings form used by both the main menu and pause screen. */
export class SettingsPanel {
  readonly root: HTMLDivElement;

  constructor(private readonly store: SettingsStore) {
    const current = store.current;
    this.root = el("div", "cw-settings");

    const viewDistance = createSlider({
      label: "View distance",
      min: SETTINGS_LIMITS.viewDistance.min,
      max: SETTINGS_LIMITS.viewDistance.max,
      step: SETTINGS_LIMITS.viewDistance.step,
      value: current.viewDistance,
      format: (value) => `${value} chunks`,
      onInput: (value) => this.store.set({ viewDistance: value }),
    });
    const sensitivity = createSlider({
      label: "Mouse sensitivity",
      min: SETTINGS_LIMITS.sensitivity.min,
      max: SETTINGS_LIMITS.sensitivity.max,
      step: SETTINGS_LIMITS.sensitivity.step,
      value: current.sensitivity,
      format: (value) => `${value.toFixed(2)}x`,
      onInput: (value) => this.store.set({ sensitivity: value }),
    });
    const fov = createSlider({
      label: "Field of view",
      min: SETTINGS_LIMITS.fov.min,
      max: SETTINGS_LIMITS.fov.max,
      step: SETTINGS_LIMITS.fov.step,
      value: current.fov,
      format: (value) => `${value}°`,
      onInput: (value) => this.store.set({ fov: value }),
    });
    const renderScale = createSlider({
      label: "Render scale",
      min: SETTINGS_LIMITS.renderScale.min,
      max: SETTINGS_LIMITS.renderScale.max,
      step: SETTINGS_LIMITS.renderScale.step,
      value: current.renderScale,
      format: formatPercent,
      onInput: (value) => this.store.set({ renderScale: value }),
    });
    const clouds = createToggle({
      label: "Clouds",
      description: "Drifting blocky cloud layer",
      value: current.clouds,
      onChange: (value) => this.store.set({ clouds: value }),
    });

    const actions = el("div", "cw-settings-actions");
    const fullscreen = createButton("Fullscreen", {
      variant: "ghost",
      onClick: () => {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void document.documentElement.requestFullscreen().catch(() => undefined);
        }
      },
    });
    const reset = createButton("Reset defaults", {
      variant: "quieter",
      onClick: () => this.store.reset(),
    });
    actions.appendChild(fullscreen);
    actions.appendChild(reset);

    this.root.appendChild(viewDistance.root);
    this.root.appendChild(sensitivity.root);
    this.root.appendChild(fov.root);
    this.root.appendChild(renderScale.root);
    this.root.appendChild(clouds.root);
    this.root.appendChild(actions);

    store.subscribe((settings) => {
      viewDistance.setValue(settings.viewDistance);
      sensitivity.setValue(settings.sensitivity);
      fov.setValue(settings.fov);
      renderScale.setValue(settings.renderScale);
      clouds.setValue(settings.clouds);
    });
  }
}
