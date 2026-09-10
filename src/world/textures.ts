import * as THREE from "three";
import { ATLAS_TILES } from "./blocks";
import { hashStringToSeed, mulberry32 } from "../core/rng";

/**
 * Procedurally painted 16x16 pixel-art atlas. No external image assets, no
 * copyrighted textures — every tile is drawn in code with a seeded RNG so the
 * result is stable between runs.
 */

export const TILE_SIZE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = Math.ceil(ATLAS_TILES.length / ATLAS_COLS);

export interface BlockAtlas {
  texture: THREE.CanvasTexture;
  cols: number;
  rows: number;
  tileIndex: Record<string, number>;
  canvas: HTMLCanvasElement;
}

type Rgb = [number, number, number];
type TilePainter = (set: (x: number, y: number, color: number) => void, rand: () => number) => void;

function rgb(hex: number): Rgb {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function toHex([r, g, b]: Rgb): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function mix(a: number, b: number, t: number): number {
  const ca = rgb(a);
  const cb = rgb(b);
  return toHex([
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t,
  ]);
}

function speckle(
  set: (x: number, y: number, color: number) => void,
  rand: () => number,
  palette: number[],
  density = 1,
): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (rand() > density) continue;
      const color = palette[Math.floor(rand() * palette.length)] as number;
      set(x, y, color);
    }
  }
}

const GRASS_BASE = 0x5fae4f;
const GRASS_LIGHT = 0x6cbb59;
const GRASS_DARK = 0x4d9340;
const GRASS_SHADE = 0x3f7d36;

const painters: Record<string, TilePainter> = {
  grass_top: (set, rand) => {
    speckle(set, rand, [GRASS_BASE, GRASS_LIGHT, GRASS_DARK, GRASS_BASE, GRASS_LIGHT]);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rand() * TILE_SIZE);
      const y = Math.floor(rand() * TILE_SIZE);
      set(x, y, GRASS_SHADE);
      set(x, Math.min(TILE_SIZE - 1, y + 1), mix(GRASS_SHADE, GRASS_BASE, 0.5));
    }
  },

  grass_side: (set, rand) => {
    for (let x = 0; x < TILE_SIZE; x++) {
      const height = 3 + Math.floor(rand() * 3);
      const tint = rand();
      for (let y = 0; y < TILE_SIZE; y++) {
        if (y < height) {
          const palette = [GRASS_BASE, GRASS_LIGHT, GRASS_DARK];
          set(x, y, palette[Math.floor(rand() * palette.length)] as number);
        } else if (y === height) {
          set(x, y, tint > 0.5 ? GRASS_SHADE : mix(GRASS_SHADE, 0x2f5c28, 0.5));
        } else {
          const dirt = [0x74513a, 0x7d573d, 0x684831, 0x815c40];
          set(x, y, dirt[Math.floor(rand() * dirt.length)] as number);
        }
      }
    }
  },

  dirt: (set, rand) => {
    speckle(set, rand, [0x74513a, 0x7d573d, 0x684831, 0x5f422b, 0x815c40]);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(rand() * (TILE_SIZE - 1));
      const y = Math.floor(rand() * TILE_SIZE);
      set(x, y, 0x5a3d28);
      set(x + 1, y, 0x654631);
    }
  },

  stone: (set, rand) => {
    speckle(set, rand, [0x8a8f96, 0x82878e, 0x939aa1, 0x878c93, 0x7c8189]);
    let x = 2 + Math.floor(rand() * 4);
    let y = 3 + Math.floor(rand() * 5);
    for (let i = 0; i < 7; i++) {
      set(x, y, 0x6d727a);
      x += rand() > 0.5 ? 1 : 0;
      y += rand() > 0.35 ? 1 : -1;
      if (x > 14 || y > 14 || y < 1) break;
    }
    x = 9 + Math.floor(rand() * 4);
    y = 5 + Math.floor(rand() * 6);
    for (let i = 0; i < 5; i++) {
      set(x, y, 0x70757d);
      x -= rand() > 0.5 ? 1 : 0;
      y += rand() > 0.5 ? 1 : 0;
      if (x < 1 || y > 14) break;
    }
  },

  cobble: (set, rand) => {
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) set(x, y, 0x565b62);
    }
    const stones: Array<[number, number, number, number]> = [
      [1, 1, 6, 5],
      [8, 1, 6, 4],
      [1, 7, 4, 6],
      [6, 6, 4, 4],
      [11, 6, 4, 5],
      [6, 11, 5, 4],
      [12, 12, 3, 3],
      [1, 14, 4, 1],
    ];
    for (const [sx, sy, sw, sh] of stones) {
      if (rand() < 0.08) continue;
      const base = [0x7d838b, 0x878d95, 0x767c84][Math.floor(rand() * 3)] as number;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const px = sx + x;
          const py = sy + y;
          if (px > 15 || py > 15) continue;
          let color = base;
          if (y === 0) color = mix(base, 0xa2a8b0, 0.55);
          else if (y === sh - 1) color = mix(base, 0x5d6269, 0.5);
          if (rand() < 0.12) color = mix(base, 0x9aa0a8, 0.35);
          set(px, py, color);
        }
      }
    }
  },

  sand: (set, rand) => {
    speckle(set, rand, [0xe3d59b, 0xdccd90, 0xeee3ad, 0xd5c383, 0xe8db9f]);
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(rand() * (TILE_SIZE - 1));
      const y = Math.floor(rand() * TILE_SIZE);
      set(x, y, 0xcdbb7d);
      set(x + 1, y, 0xd8c88a);
    }
  },

  sandstone: (set, rand) => {
    speckle(set, rand, [0xddcb92, 0xe4d49d, 0xd4c188]);
    for (let y = 0; y < TILE_SIZE; y++) {
      if (y % 5 === 4) {
        for (let x = 0; x < TILE_SIZE; x++) {
          set(x, y, rand() < 0.75 ? 0xc3b075 : 0xd0bd82);
        }
      } else if (y % 5 === 0) {
        for (let x = 0; x < TILE_SIZE; x++) set(x, y, mix(0xf0e2b2, 0xddcb92, rand() * 0.5));
      }
    }
  },

  log_side: (set, rand) => {
    for (let x = 0; x < TILE_SIZE; x++) {
      const streak = [0x6f4f2f, 0x7a5836, 0x654727, 0x745332][Math.floor(rand() * 4)] as number;
      const edge = x < 1 || x > 14;
      for (let y = 0; y < TILE_SIZE; y++) {
        let color = streak;
        if (edge) color = mix(streak, 0x46301c, 0.6);
        else if (rand() < 0.18) color = mix(streak, 0x8a6538, 0.45);
        else if (rand() < 0.1) color = mix(streak, 0x523823, 0.4);
        set(x, y, color);
      }
    }
    const knotY = 4 + Math.floor(rand() * 8);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 2; x++) set(6 + x, knotY + y, mix(0x523823, 0x3a2715, 0.4));
    }
  },

  log_top: (set, rand) => {
    const cx = 7.5;
    const cy = 7.5;
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const dist = Math.max(Math.abs(x - cx), Math.abs(y - cy));
        if (dist > 6.6) {
          set(x, y, mix(0x5d4026, 0x46301c, rand() * 0.5));
        } else if (dist > 5.4) {
          set(x, y, 0x8a6538);
        } else if (dist > 2.2) {
          set(x, y, rand() < 0.5 ? 0xa07a4a : 0x957041);
        } else {
          set(x, y, rand() < 0.5 ? 0xb08a52 : 0xa37c48);
        }
        if (rand() < 0.08) set(x, y, 0x7a5730);
      }
    }
  },

  leaves: (set, rand) => {
    speckle(set, rand, [0x3f7f3a, 0x4f9348, 0x336b30, 0x3a7836, 0x468a40]);
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(rand() * (TILE_SIZE - 1));
      const y = Math.floor(rand() * TILE_SIZE);
      set(x, y, 0x2c5c29);
      set(x + 1, y, 0x356b31);
    }
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(rand() * TILE_SIZE);
      const y = Math.floor(rand() * TILE_SIZE);
      set(x, y, 0x5aa04b);
    }
  },

  planks: (set, rand) => {
    speckle(set, rand, [0xb08a52, 0xa9824b, 0xb89160, 0xa37c48]);
    for (let y = 0; y < TILE_SIZE; y++) {
      if (y % 5 === 4) {
        for (let x = 0; x < TILE_SIZE; x++) set(x, y, 0x8a6a3d);
      } else if (y % 5 === 0) {
        for (let x = 0; x < TILE_SIZE; x++) set(x, y, mix(0xc9a26c, 0xb08a52, rand() * 0.4));
      } else {
        for (let x = 0; x < TILE_SIZE; x++) {
          if (rand() < 0.1) set(x, y, 0x9a7443);
        }
      }
    }
    const rowCount = Math.floor(TILE_SIZE / 5);
    for (let row = 0; row < rowCount; row++) {
      const joint = row % 2 === 0 ? 5 : 11;
      for (let y = row * 5; y < row * 5 + 4; y++) {
        set(joint, y, 0x82623a);
        set(Math.min(15, joint + 1), y, 0xb89160);
      }
    }
  },

  snow: (set, rand) => {
    speckle(set, rand, [0xf2f7fa, 0xe8f0f6, 0xffffff, 0xeaf2f8]);
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rand() * TILE_SIZE);
      const y = Math.floor(rand() * TILE_SIZE);
      set(x, y, 0xd7e4ee);
      if (rand() > 0.5) set(x, Math.min(15, y + 1), 0xdfeaf2);
    }
  },

  water: (set, rand) => {
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const shade = rand();
        let color = 0x3f7fd0;
        if (shade < 0.12) color = 0x3a77c6;
        else if (shade > 0.9) color = 0x4586d6;
        set(x, y, color);
      }
    }
    const lines = [3, 10];
    for (const baseY of lines) {
      let x = 1 + Math.floor(rand() * 5);
      while (x < TILE_SIZE) {
        const len = 4 + Math.floor(rand() * 5);
        for (let i = 0; i < len && x + i < TILE_SIZE; i++) set(x + i, baseY, 0x5f9be0);
        x += len + 3 + Math.floor(rand() * 4);
      }
    }
    for (let i = 0; i < 4; i++) {
      set(Math.floor(rand() * TILE_SIZE), Math.floor(rand() * TILE_SIZE), 0x376eb8);
    }
  },

  bedrock: (set, rand) => {
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) set(x, y, 0x4a4f57);
    }
    const shades = [0x3a3e45, 0x5a6069, 0x42474f, 0x525860, 0x33373d];
    for (let i = 0; i < 14; i++) {
      const bx = Math.floor(rand() * 4) * 4;
      const by = Math.floor(rand() * 4) * 4;
      const shade = shades[Math.floor(rand() * shades.length)] as number;
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          if (bx + x < TILE_SIZE && by + y < TILE_SIZE) set(bx + x, by + y, shade);
        }
      }
    }
    for (let i = 0; i < 24; i++) {
      set(Math.floor(rand() * TILE_SIZE), Math.floor(rand() * TILE_SIZE), 0x2c3036);
    }
  },

  tuft: (set, rand) => {
    const blades = 7;
    for (let i = 0; i < blades; i++) {
      const x = 1 + i * 2 + Math.floor(rand() * 2);
      if (x > 15) continue;
      const height = 4 + Math.floor(rand() * 5);
      const lean = rand() > 0.6 ? (rand() > 0.5 ? 1 : -1) : 0;
      const color = [0x58a04a, 0x6fbf5b, 0x4a8f3e, 0x63b053][Math.floor(rand() * 4)] as number;
      for (let h = 0; h < height; h++) {
        const y = 15 - h;
        const px = x + (h > height - 3 ? lean : 0);
        if (px >= 0 && px < TILE_SIZE) set(px, y, color);
      }
    }
  },

  flower: (set, rand) => {
    const stem = 0x4f8f42;
    for (let y = 9; y < 16; y++) set(7, y, stem);
    set(6, 11, stem);
    set(5, 11, 0x63b053);
    set(8, 12, stem);
    set(9, 12, 0x63b053);
    const petal = 0xe8b04b;
    const petalLight = 0xf2c25a;
    const petalDark = 0xd9a03c;
    const petalPositions: Array<[number, number, number]> = [
      [7, 4, petalLight],
      [6, 5, petal],
      [8, 5, petal],
      [5, 6, petalDark],
      [7, 6, petal],
      [9, 6, petalDark],
      [6, 7, petalDark],
      [8, 7, petalDark],
      [7, 8, petalDark],
    ];
    for (const [x, y, color] of petalPositions) set(x, y, color);
    set(7, 5, 0xd0563f);
    set(7, 7, 0xd0563f);
    if (rand() < 0.5) set(6, 6, 0xf2c25a);
  },

  cactus_top: (set, rand) => {
    speckle(set, rand, [0x4f8f42, 0x468239, 0x5a9c4b]);
    for (let x = 3; x < 13; x++) {
      for (let y = 3; y < 13; y++) {
        const edge = x === 3 || x === 12 || y === 3 || y === 12;
        if (edge) set(x, y, 0x3a6f31);
        else if (rand() < 0.16) set(x, y, 0x5fa74f);
      }
    }
    set(7, 7, 0x63b053);
    set(8, 8, 0x63b053);
  },

  cactus_side: (set, rand) => {
    speckle(set, rand, [0x4f8f42, 0x468239, 0x549643]);
    for (let x = 0; x < TILE_SIZE; x++) {
      const ridge = x % 4 === 1;
      for (let y = 0; y < TILE_SIZE; y++) {
        if (ridge) set(x, y, 0x3a6f31);
        else if (rand() < 0.1) set(x, y, 0x5fa74f);
      }
    }
    for (let y = 0; y < TILE_SIZE; y += 3) {
      const x = 2 + Math.floor(rand() * 3);
      set(x, y, 0xe8e3c8);
    }
  },
};

export function createBlockAtlas(): BlockAtlas {
  const width = ATLAS_COLS * TILE_SIZE;
  const height = ATLAS_ROWS * TILE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  const tileIndex: Record<string, number> = {};
  ATLAS_TILES.forEach((name, index) => {
    const painter = painters[name];
    if (!painter) throw new Error(`Missing atlas painter for tile "${name}"`);
    const rand = mulberry32(hashStringToSeed(`cubewild-tile-${name}`));
    const originX = (index % ATLAS_COLS) * TILE_SIZE;
    const originY = Math.floor(index / ATLAS_COLS) * TILE_SIZE;
    painter((x, y, color) => {
      if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return;
      ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx.fillRect(originX + x, originY + y, 1, 1);
    }, rand);
    tileIndex[name] = index;
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return { texture, cols: ATLAS_COLS, rows: ATLAS_ROWS, tileIndex, canvas };
}

/** Renders one atlas tile to a standalone canvas for HUD / menu icons. */
export function createTileIcon(atlas: BlockAtlas, tile: string, size = 48): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  const index = atlas.tileIndex[tile] ?? 0;
  const sx = (index % ATLAS_COLS) * TILE_SIZE;
  const sy = Math.floor(index / ATLAS_COLS) * TILE_SIZE;
  ctx.drawImage(atlas.canvas, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, size, size);
  const shade = ctx.createLinearGradient(0, size * 0.55, 0, size);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
