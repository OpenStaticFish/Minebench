/**
 * Global world + tuning constants.
 * Cubewild is an original voxel prototype; all values here are hand-tuned.
 */

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 96;
export const SEA_LEVEL = 62;

/** Flat index into a chunk's Uint8Array block store. */
export function chunkIndex(x: number, y: number, z: number): number {
  return (x * CHUNK_HEIGHT + y) * CHUNK_SIZE + z;
}
export const MAX_TERRAIN_HEIGHT = 92;
export const BEDROCK_LEVEL = 0;

/** How many chunks beyond the requested radius stay resident before unloading. */
export const CHUNK_KEEP_MARGIN = 2;

export const PLAYER = {
  halfWidth: 0.3,
  height: 1.8,
  eyeHeight: 1.62,
  walkSpeed: 4.6,
  sprintSpeed: 7.2,
  flySpeed: 11,
  flySprintSpeed: 19,
  swimSpeed: 3.4,
  jumpVelocity: 8.6,
  gravity: 28,
  swimGravity: 6,
  terminalVelocity: 46,
  waterDrag: 0.72,
  groundAccel: 42,
  airAccel: 14,
  flyAccel: 34,
  reach: 6,
  breakCooldown: 0.16,
  placeCooldown: 0.18,
  flyDoubleTapMs: 300,
} as const;

export const DEFAULT_SEED = 20260910;

export const DEFAULT_SETTINGS = {
  viewDistance: 6,
  sensitivity: 1,
  fov: 76,
  renderScale: 1,
  clouds: true,
} as const;

export const SETTINGS_LIMITS = {
  viewDistance: { min: 2, max: 10, step: 1 },
  sensitivity: { min: 0.2, max: 3, step: 0.05 },
  fov: { min: 60, max: 110, step: 1 },
  renderScale: { min: 0.5, max: 1, step: 0.05 },
} as const;

export const STORAGE_KEY = "cubewild.settings.v1";

/** Shared colour palette (also mirrored as CSS custom properties in style.css). */
export const PALETTE = {
  skyZenith: 0x5b93cf,
  skyHorizon: 0xdff0f6,
  fogDay: 0xcfe3ea,
  sun: 0xfff3d6,
  ambient: 0xbcd3e6,
  groundBounce: 0x6b5a44,
  underline: 0x1b2735,
} as const;

export const FOG_NEAR_FACTOR = 0.55;
export const FOG_FAR_FACTOR = 0.98;
