import * as THREE from "three";
import { BLOCKS } from "./blocks";

/**
 * Procedurally painted 16x16 tile atlas (4x4 grid = 64x64 px).
 * Every texture is generated at runtime — no external art assets.
 */

export const TILE = 16;
export const ATLAS_TILES = 4; // tiles per row/column
export const ATLAS_SIZE = TILE * ATLAS_TILES;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Painter = (ctx: CanvasRenderingContext2D, rand: () => number) => void;

function speckle(base: string, dark: string, light: string, amount = 0.5): Painter {
  return (ctx, rand) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, TILE, TILE);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const r = rand();
        if (r < amount * 0.4) ctx.fillStyle = dark;
        else if (r < amount) ctx.fillStyle = light;
        else continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  };
}

const PAINTERS: Painter[] = [
  // 0: grass top
  speckle("#5da13f", "#4a8a31", "#71b44d", 0.6),
  // 1: grass side (dirt with grass fringe)
  (ctx, rand) => {
    PAINTERS[2]!(ctx, rand);
    ctx.fillStyle = "#5da13f";
    ctx.fillRect(0, 0, TILE, 3);
    for (let x = 0; x < TILE; x++) {
      if (rand() < 0.7) ctx.fillRect(x, 3, 1, 1);
      if (rand() < 0.3) ctx.fillRect(x, 4, 1, 1);
    }
  },
  // 2: dirt
  speckle("#8a5f38", "#74502f", "#9c7045", 0.55),
  // 3: stone
  speckle("#8d8d93", "#7c7c82", "#9d9da3", 0.5),
  // 4: cobblestone
  (ctx, rand) => {
    ctx.fillStyle = "#6f6f76";
    ctx.fillRect(0, 0, TILE, TILE);
    const stones: Array<[number, number, number, number]> = [
      [1, 1, 6, 5], [8, 1, 7, 6], [1, 7, 4, 4], [6, 8, 5, 4],
      [12, 8, 3, 4], [1, 12, 7, 3], [9, 13, 6, 2], [12, 3, 3, 4],
    ];
    for (const [sx, sy, sw, sh] of stones) {
      const shade = 0.75 + rand() * 0.3;
      const b = Math.round(150 * shade);
      ctx.fillStyle = `rgb(${b},${b},${b + 5})`;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(sx, sy + sh - 1, sw, 1);
    }
  },
  // 5: sand
  speckle("#dcc98d", "#cdb87d", "#e9d99f", 0.5),
  // 6: log side (vertical bark stripes)
  (ctx, rand) => {
    for (let x = 0; x < TILE; x++) {
      const v = 0.8 + rand() * 0.35;
      const r = Math.round(0x6b * v), g = Math.round(0x4c * v), b = Math.round(0x2e * v);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, 1, TILE);
    }
    ctx.fillStyle = "#3d2a18";
    for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(rand() * TILE), Math.floor(rand() * TILE), 1, 2 + Math.floor(rand() * 3));
  },
  // 7: log top (rings)
  (ctx) => {
    ctx.fillStyle = "#a9793f";
    ctx.fillRect(0, 0, TILE, TILE);
    const rings = ["#8f6231", "#a9793f", "#8f6231", "#a9793f"];
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = rings[i]!;
      ctx.beginPath();
      ctx.arc(8, 8, 2 + i * 2.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  // 8: leaves (two-tone green clumps)
  (ctx, rand) => {
    ctx.fillStyle = "#3e7a2a";
    ctx.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = rand() < 0.5 ? "#4e9436" : "#356b23";
      ctx.fillRect(Math.floor(rand() * TILE), Math.floor(rand() * TILE), 2, 2);
    }
  },
  // 9: water
  speckle("#3a7dd8", "#2f6cc0", "#4b8ce4", 0.4),
  // 10: snow top
  speckle("#e8eef2", "#d5dde4", "#f7fbfd", 0.45),
  // 11: snow side (snow over dirt)
  (ctx, rand) => {
    PAINTERS[2]!(ctx, rand);
    ctx.fillStyle = "#e8eef2";
    ctx.fillRect(0, 0, TILE, 4);
    for (let x = 0; x < TILE; x++) if (rand() < 0.6) ctx.fillRect(x, 4, 1, 1);
  },
  // 12: planks (horizontal boards)
  (ctx, rand) => {
    ctx.fillStyle = "#b08149";
    ctx.fillRect(0, 0, TILE, TILE);
    for (let y = 0; y < TILE; y++) {
      const v = 0.85 + rand() * 0.25;
      ctx.fillStyle = `rgba(${Math.round(60 * v)},${Math.round(35 * v)},${Math.round(10 * v)},0.25)`;
      ctx.fillRect(0, y, TILE, 1);
    }
    ctx.fillStyle = "#7a5427";
    for (const y of [3, 7, 11, 15]) ctx.fillRect(0, y, TILE, 1);
    for (const [x, y] of [[4, 0], [12, 4], [6, 8], [10, 12]] as const) ctx.fillRect(x, y, 1, 4);
  },
];

let cachedAtlas: THREE.Texture | null = null;

export function buildAtlas(): THREE.Texture {
  if (cachedAtlas) return cachedAtlas;

  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const rand = rng(20260905);
  PAINTERS.forEach((paint, i) => {
    const tx = (i % ATLAS_TILES) * TILE;
    const ty = Math.floor(i / ATLAS_TILES) * TILE;
    ctx.save();
    ctx.translate(tx, ty);
    paint(ctx, rand);
    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedAtlas = tex;
  return tex;
}

/** UV rect for a tile index: [u0, v0, u1, v1]. */
export function tileUV(tile: number): [number, number, number, number] {
  const u0 = (tile % ATLAS_TILES) / ATLAS_TILES;
  const v0 = 1 - (Math.floor(tile / ATLAS_TILES) + 1) / ATLAS_TILES;
  const s = 1 / ATLAS_TILES;
  return [u0 + s * 0.01, v0 + s * 0.01, u0 + s * 0.99, v0 + s * 0.99];
}

/** Small standalone canvas per hotbar item (used by the HUD). */
export function blockIconDataURL(blockId: number): string {
  const def = BLOCKS[blockId]!;
  const canvas = document.createElement("canvas");
  canvas.width = TILE * 3;
  canvas.height = TILE * 3;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const atlas = document.createElement("canvas");
  atlas.width = ATLAS_SIZE;
  atlas.height = ATLAS_SIZE;
  const actx = atlas.getContext("2d")!;
  const rand = rng(20260905);
  PAINTERS.forEach((paint, i) => {
    const tx = (i % ATLAS_TILES) * TILE;
    const ty = Math.floor(i / ATLAS_TILES) * TILE;
    actx.save();
    actx.translate(tx, ty);
    paint(actx, rand);
    actx.restore();
  });
  // Side + top composite for a simple iso-cube look.
  const [top, , side] = def.tiles;
  ctx.drawImage(atlas, (side % 4) * TILE, Math.floor(side / 4) * TILE, TILE, TILE, 0, TILE, TILE, TILE);
  ctx.drawImage(atlas, (side % 4) * TILE, Math.floor(side / 4) * TILE, TILE, TILE, TILE, TILE, TILE, TILE);
  ctx.drawImage(atlas, (top % 4) * TILE, Math.floor(top / 4) * TILE, TILE, TILE, TILE, 0, TILE, TILE);
  return canvas.toDataURL();
}
