import { DEFAULT_SETTINGS, SETTINGS_LIMITS, STORAGE_KEY } from "../core/constants";
import { clamp } from "../core/math";

export interface GameSettings {
  /** Chunk render radius. */
  viewDistance: number;
  /** Mouse look multiplier. */
  sensitivity: number;
  /** Vertical field of view in degrees. */
  fov: number;
  /** Internal resolution multiplier (0.5 - 1). */
  renderScale: number;
  clouds: boolean;
}

function defaultSettings(): GameSettings {
  return { ...DEFAULT_SETTINGS };
}

function sanitize(input: Partial<GameSettings>): GameSettings {
  const base = defaultSettings();
  return {
    viewDistance: clamp(
      Math.round(input.viewDistance ?? base.viewDistance),
      SETTINGS_LIMITS.viewDistance.min,
      SETTINGS_LIMITS.viewDistance.max,
    ),
    sensitivity: clamp(
      input.sensitivity ?? base.sensitivity,
      SETTINGS_LIMITS.sensitivity.min,
      SETTINGS_LIMITS.sensitivity.max,
    ),
    fov: clamp(
      Math.round(input.fov ?? base.fov),
      SETTINGS_LIMITS.fov.min,
      SETTINGS_LIMITS.fov.max,
    ),
    renderScale: clamp(
      input.renderScale ?? base.renderScale,
      SETTINGS_LIMITS.renderScale.min,
      SETTINGS_LIMITS.renderScale.max,
    ),
    clouds: input.clouds ?? base.clouds,
  };
}

/** Small observable settings store with localStorage persistence. */
export class SettingsStore {
  private values: GameSettings;
  private readonly listeners = new Set<(settings: GameSettings) => void>();

  constructor() {
    this.values = sanitize(this.load());
  }

  get current(): GameSettings {
    return { ...this.values };
  }

  set(partial: Partial<GameSettings>): void {
    this.values = sanitize({ ...this.values, ...partial });
    this.save();
    const snapshot = this.current;
    for (const listener of this.listeners) listener(snapshot);
  }

  reset(): void {
    this.values = defaultSettings();
    this.save();
    const snapshot = this.current;
    for (const listener of this.listeners) listener(snapshot);
  }

  subscribe(listener: (settings: GameSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): Partial<GameSettings> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return {};
      return parsed as Partial<GameSettings>;
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      /* Storage can be unavailable (private mode); settings stay in memory. */
    }
  }
}
