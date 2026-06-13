import * as THREE from "three";

// Procedurally generated texture atlas. All voxel textures are drawn to an
// offscreen canvas at runtime — no copyrighted assets are imported. Tiles are
// 16x16 pixels arranged in a grid, sampled with nearest filtering for a crisp
// pixel-art look.

export const TILE_PX = 16;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;
export const ATLAS_TILE_COUNT = ATLAS_COLS * ATLAS_ROWS;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

type RGB = [number, number, number];

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Fill a tile with a base color then scatter darker/lighter speckles. */
function paintSpeckled(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  base: RGB,
  variation: number,
  count: number,
  rand: () => number,
): void {
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
  for (let i = 0; i < count; i++) {
    const x = ox + Math.floor(rand() * TILE_PX);
    const y = oy + Math.floor(rand() * TILE_PX);
    const d = (rand() - 0.5) * 2 * variation;
    const r = clamp255(base[0] + d);
    const g = clamp255(base[1] + d);
    const b = clamp255(base[2] + d);
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(x, y, 1, 1);
  }
}

export interface AtlasResult {
  texture: THREE.Texture;
}

/** Build the texture atlas canvas + upload it as a Three.js texture. */
export function createTextureAtlas(): AtlasResult {
  const size = TILE_PX * ATLAS_COLS;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = TILE_PX * ATLAS_ROWS;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const rand = rng(1337);
  // Helper: tile index -> top-left pixel offset.
  const off = (tile: number): [number, number] => {
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    return [col * TILE_PX, row * TILE_PX];
  };

  // 0: grass top
  {
    const [ox, oy] = off(0);
    paintSpeckled(ctx, ox, oy, [96, 168, 74], 26, 90, rand);
  }
  // 1: grass side (dirt with grassy top strip)
  {
    const [ox, oy] = off(1);
    paintSpeckled(ctx, ox, oy, [134, 96, 64], 22, 80, rand);
    // grass overhang
    ctx.fillStyle = "rgb(86,158,66)";
    ctx.fillRect(ox, oy, TILE_PX, 4);
    for (let x = 0; x < TILE_PX; x++) {
      const h = 3 + Math.floor(rand() * 3);
      for (let y = 0; y < h; y++) {
        const d = (rand() - 0.5) * 40;
        const g = clamp255(150 + d);
        ctx.fillStyle = `rgb(${clamp255(86 + d) | 0},${g | 0},${clamp255(66 + d) | 0})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  // 2: dirt
  {
    const [ox, oy] = off(2);
    paintSpeckled(ctx, ox, oy, [134, 96, 64], 26, 110, rand);
  }
  // 3: stone
  {
    const [ox, oy] = off(3);
    paintSpeckled(ctx, ox, oy, [128, 128, 132], 20, 120, rand);
    // a couple of darker cracks
    ctx.fillStyle = "rgb(96,96,100)";
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(ox + Math.floor(rand() * TILE_PX), oy + Math.floor(rand() * TILE_PX), 2, 1);
    }
  }
  // 4: sand
  {
    const [ox, oy] = off(4);
    paintSpeckled(ctx, ox, oy, [224, 208, 150], 16, 100, rand);
  }
  // 5: wood top (concentric rings)
  {
    const [ox, oy] = off(5);
    ctx.fillStyle = "rgb(176,134,84)";
    ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
    const cx = ox + TILE_PX / 2;
    const cy = oy + TILE_PX / 2;
    for (let r = 1; r < TILE_PX / 2; r += 2) {
      ctx.strokeStyle = `rgb(${120 + ((r * 7) % 30)},${90 + ((r * 5) % 20)},56)`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgb(110,80,48)";
    ctx.fillRect(cx - 1 | 0, cy - 1 | 0, 2, 2);
  }
  // 6: wood side (vertical bark)
  {
    const [ox, oy] = off(6);
    paintSpeckled(ctx, ox, oy, [120, 86, 52], 18, 60, rand);
    for (let x = 0; x < TILE_PX; x += 1) {
      if (rand() < 0.4) {
        ctx.fillStyle = `rgb(${90 + Math.floor(rand() * 20)},64,38)`;
        ctx.fillRect(ox + x, oy, 1, TILE_PX);
      }
    }
  }
  // 7: leaves (dense green noise)
  {
    const [ox, oy] = off(7);
    paintSpeckled(ctx, ox, oy, [54, 110, 44], 40, 150, rand);
    // a few darker holes
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = "rgb(30,70,28)";
      ctx.fillRect(ox + Math.floor(rand() * TILE_PX), oy + Math.floor(rand() * TILE_PX), 1, 1);
    }
  }
  // 8: water
  {
    const [ox, oy] = off(8);
    paintSpeckled(ctx, ox, oy, [54, 110, 196], 18, 80, rand);
  }
  // 9: bedrock
  {
    const [ox, oy] = off(9);
    paintSpeckled(ctx, ox, oy, [70, 70, 74], 34, 140, rand);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  // flipY=false keeps canvas row 0 (top) at v=0, making tile math simple.
  texture.flipY = false;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  return { texture };
}

/**
 * UV rectangle (in atlas [0,1] space) for a tile index, with a half-texel
 * inset to avoid bleeding between adjacent tiles under nearest filtering.
 */
export function tileUV(tile: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const inset = 0.5 / (TILE_PX * ATLAS_COLS);
  const u0 = col / ATLAS_COLS + inset;
  const u1 = (col + 1) / ATLAS_COLS - inset;
  const v0 = row / ATLAS_ROWS + inset;
  const v1 = (row + 1) / ATLAS_ROWS - inset;
  return { u0, v0, u1, v1 };
}
