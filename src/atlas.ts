import { CanvasTexture, NearestFilter, NearestMipmapLinearFilter, SRGBColorSpace } from 'three';
import { Block } from './world';

export const TILE = {
  grass: 0,
  soil: 1,
  stone: 2,
  sand: 3,
  bark: 4,
  needles: 5,
  water: 6,
  amber: 7,
  snow: 8,
  boards: 9,
  bank: 10,
  rings: 11,
  solid: 12,
  clay: 13,
} as const;
export const GRID = 4;
export const tileFor = (id: Block, face: number): number => {
  switch (id) {
    case Block.Grass:
      return face === 0 ? TILE.grass : face === 5 ? TILE.soil : TILE.bank;
    case Block.Wood:
      return face === 0 || face === 5 ? TILE.rings : TILE.bark;
    case Block.Stone:
      return TILE.stone;
    case Block.Sand:
      return TILE.sand;
    case Block.Leaves:
      return TILE.needles;
    case Block.Water:
      return TILE.water;
    case Block.Amber:
      return TILE.amber;
    case Block.Snow:
      return TILE.snow;
    case Block.Planks:
      return TILE.boards;
    case Block.Clay:
      return TILE.clay;
    default:
      return TILE.soil;
  }
};

/** Original 16px swatches, padded by four texels to limit mip bleed. */
export function makeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID * 24;
  const ctx = canvas.getContext('2d')!;
  const palette = [
    '#a4b966',
    '#92694d',
    '#90958b',
    '#ebce91',
    '#836343',
    '#638457',
    '#62a7a1',
    '#d9a049',
    '#eaeadd',
    '#c09662',
    '#936d4e',
    '#c29b66',
    '#ffffff',
    '#b95e3b',
  ];
  let state = 1847;
  const rand = () => ((state = (Math.imul(1664525, state) + 1013904223) | 0) >>> 0) / 4294967296;
  palette.forEach((base, id) => {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 16;
    const t = tile.getContext('2d')!;
    t.fillStyle = base;
    t.fillRect(0, 0, 16, 16);
    for (let i = 0; i < (id === TILE.water ? 6 : id === TILE.solid ? 0 : 52); i++) {
      const light = rand() > 0.46;
      t.fillStyle = light
        ? `rgba(255,243,180,${rand() * 0.16 + 0.04})`
        : `rgba(54,50,35,${rand() * 0.14 + 0.03})`;
      const x = Math.floor(rand() * 16),
        y = Math.floor(rand() * 16);
      const length = 1 + Math.floor(rand() * (id === TILE.water ? 6 : 3));
      t.fillRect(
        x,
        y,
        id === TILE.bark ? 1 : length,
        id === TILE.bark ? length + 2 : id === TILE.needles || id === TILE.amber ? 2 : 1,
      );
    }
    if (id === TILE.bank) {
      for (let x = 0; x < 16; x++) {
        t.fillStyle = x % 4 === 2 ? '#96a45b' : '#9bab63';
        t.fillRect(x, 0, 1, 3 + Math.floor(rand() * 2));
      }
      t.fillStyle = 'rgba(95,75,40,.25)';
      t.fillRect(0, 5, 16, 1);
    }
    if (id === TILE.rings)
      for (let r = 2; r < 8; r += 3) {
        t.strokeStyle = '#a38258';
        t.strokeRect(r + 0.5, r + 0.5, 15 - r * 2, 15 - r * 2);
      }
    if (id === TILE.boards) {
      t.fillStyle = '#92704e';
      t.fillRect(0, 7, 16, 1);
      t.fillRect(0, 15, 16, 1);
      t.fillRect(5, 0, 1, 7);
      t.fillRect(12, 8, 1, 7);
    }
    const x = (id % GRID) * 24,
      y = Math.floor(id / GRID) * 24;
    ctx.drawImage(tile, x + 4, y + 4);
    ctx.drawImage(tile, 0, 0, 16, 1, x + 4, y, 16, 4);
    ctx.drawImage(tile, 0, 15, 16, 1, x + 4, y + 20, 16, 4);
    ctx.drawImage(canvas, x + 4, y, 1, 24, x, y, 4, 24);
    ctx.drawImage(canvas, x + 19, y, 1, 24, x + 20, y, 4, 24);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestMipmapLinearFilter;
  return texture;
}
