/**
 * Player settings with localStorage persistence.
 *
 * Every numeric setting has a declared range/step so the UI sliders and the
 * sanitiser stay in sync, and corrupted storage can never break the game.
 */
import { clamp } from "./noise"

export interface Settings {
  /** Chunk radius to mesh around the player. */
  viewDistance: number
  /** Multiplier on mouse-look speed. */
  sensitivity: number
  /** Vertical field of view in degrees. */
  fov: number
  /** Resolution multiplier relative to devicePixelRatio. */
  renderScale: number
  clouds: boolean
  debugOverlay: boolean
  /** Show the FPS/position panel. Toggled in play with H (useful for clean screenshots). */
  hudStats: boolean
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  viewDistance: 8,
  sensitivity: 1,
  fov: 75,
  renderScale: 1,
  clouds: true,
  debugOverlay: false,
  hudStats: true,
}

export interface Range {
  readonly min: number
  readonly max: number
  readonly step: number
  readonly unit: string
}

export const SETTING_RANGES: Readonly<
  Record<"viewDistance" | "sensitivity" | "fov" | "renderScale", Range>
> = {
  viewDistance: { min: 3, max: 12, step: 1, unit: "chunks" },
  sensitivity: { min: 0.2, max: 2, step: 0.05, unit: "×" },
  fov: { min: 60, max: 110, step: 1, unit: "°" },
  renderScale: { min: 0.5, max: 2, step: 0.25, unit: "×" },
}

const STORAGE_KEY = "loamlands.settings.v1"

function sanitizeNumber(value: unknown, range: Range, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback
  const stepped = Math.round(value / range.step) * range.step
  return clamp(Number(stepped.toFixed(4)), range.min, range.max)
}

/** Coerce arbitrary input (e.g. parsed JSON) into a valid Settings object. */
export function sanitizeSettings(input: unknown): Settings {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const num = (key: keyof typeof SETTING_RANGES) =>
    sanitizeNumber(raw[key], SETTING_RANGES[key], DEFAULT_SETTINGS[key])
  const bool = (key: "clouds" | "debugOverlay" | "hudStats") =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : DEFAULT_SETTINGS[key]
  return {
    viewDistance: num("viewDistance"),
    sensitivity: num("sensitivity"),
    fov: num("fov"),
    renderScale: num("renderScale"),
    clouds: bool("clouds"),
    debugOverlay: bool("debugOverlay"),
    hudStats: bool("hudStats"),
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage may be unavailable (private mode); settings simply won't persist.
  }
}
