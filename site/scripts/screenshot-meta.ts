/**
 * Single source of truth for the real screenshots captured from the Cubewild
 * game prototype (first benchmark). Both the asset preparation script and the
 * Vite HTML plugin read this list.
 */

export interface ScreenshotMeta {
  key: string;
  /** Path relative to the repository root. */
  source: string;
  title: string;
  alt: string;
  caption: string;
}

export const SCREENSHOT_META: readonly ScreenshotMeta[] = [
  {
    key: "in-game",
    source: "screenshots/in-game.png",
    title: "Over the coastline",
    alt: "Cubewild in-game view: a forested coastline with grassy terraces, sandy beaches, blue water, drifting blocky clouds and the in-game HUD showing coordinates, biome, a flight badge and the hotbar.",
    caption:
      "A generated world on the default seed — forest coast, beaches, water and drifting clouds, captured from the running prototype with the HUD visible.",
  },
  {
    key: "main-menu",
    source: "screenshots/main-menu.png",
    title: "Main menu",
    alt: "Cubewild main menu with the game logo, world seed field, and Play, Settings and Controls buttons over a live view of the generated world.",
    caption:
      "The main menu renders the live world behind the UI, so every session opens on a generated vista instead of a static background.",
  },
];

export interface ScreenshotVariant {
  width: number;
  src: string;
}

export interface ScreenshotAsset {
  key: string;
  available: boolean;
  title: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  /** Tiny blurred preview as a data URI (used for the hero backdrop). */
  lqip: string;
  variants: ScreenshotVariant[];
  /** Largest variant, used by the lightbox. */
  full: string;
}

export type ScreenshotManifest = Record<string, ScreenshotAsset>;
