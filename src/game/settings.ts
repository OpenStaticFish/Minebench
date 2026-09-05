export interface Settings {
  /** Chunk radius around the player. */
  viewDistance: number;
  /** Mouse look multiplier (1 = default). */
  sensitivity: number;
  fov: number;
  clouds: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  viewDistance: 5,
  sensitivity: 1,
  fov: 75,
  clouds: true,
};

const KEY = "blockvale.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      viewDistance: clampNum(parsed.viewDistance, 2, 10, DEFAULT_SETTINGS.viewDistance),
      sensitivity: clampNum(parsed.sensitivity, 0.2, 3, DEFAULT_SETTINGS.sensitivity),
      fov: clampNum(parsed.fov, 60, 100, DEFAULT_SETTINGS.fov),
      clouds: parsed.clouds ?? true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode / storage disabled: settings stay session-only.
  }
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}
