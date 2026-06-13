import type { BlockId } from "../types";

// Block registry. Each block maps its six faces to texture-atlas tile indices
// and carries physical/rendering flags used by the mesher and physics.

/** Face indices used across the codebase. */
export const FACE = {
  PX: 0, // +x (east)
  NX: 1, // -x (west)
  PY: 2, // +y (top)
  NY: 3, // -y (bottom)
  PZ: 4, // +z (south)
  NZ: 5, // -z (north)
} as const;

export type FaceIndex = (typeof FACE)[keyof typeof FACE];

// Texture-atlas tile indices (see Textures.ts).
const T = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD_TOP: 5,
  WOOD_SIDE: 6,
  LEAVES: 7,
  WATER: 8,
  BEDROCK: 9,
} as const;

export interface BlockDef {
  id: BlockId;
  name: string;
  /** Tile per face [PX, NX, PY, NY, PZ, NZ]. */
  tiles: readonly [number, number, number, number, number, number];
  /** Representative UI color (hex). */
  color: string;
  /** Collides with the player. */
  solid: boolean;
  /** Fully hides neighbor faces (culls them). */
  opaque: boolean;
  /** See-through (water, leaves). Faces render but don't cull opaque neighbors. */
  transparent: boolean;
  /** Acts like a fluid (no collision, lowered surface, animated material). */
  liquid: boolean;
}

function uniform(tile: number): readonly [number, number, number, number, number, number] {
  return [tile, tile, tile, tile, tile, tile];
}

const AIR: BlockDef = {
  id: 0,
  name: "Air",
  tiles: uniform(0),
  color: "#000000",
  solid: false,
  opaque: false,
  transparent: false,
  liquid: false,
};

export const BLOCKS: readonly BlockDef[] = [
  AIR,
  {
    id: 1,
    name: "Grass",
    tiles: [T.GRASS_SIDE, T.GRASS_SIDE, T.GRASS_TOP, T.DIRT, T.GRASS_SIDE, T.GRASS_SIDE],
    color: "#5fa84a",
    solid: true,
    opaque: true,
    transparent: false,
    liquid: false,
  },
  {
    id: 2,
    name: "Dirt",
    tiles: uniform(T.DIRT),
    color: "#866040",
    solid: true,
    opaque: true,
    transparent: false,
    liquid: false,
  },
  {
    id: 3,
    name: "Stone",
    tiles: uniform(T.STONE),
    color: "#808084",
    solid: true,
    opaque: true,
    transparent: false,
    liquid: false,
  },
  {
    id: 4,
    name: "Sand",
    tiles: uniform(T.SAND),
    color: "#e0d096",
    solid: true,
    opaque: true,
    transparent: false,
    liquid: false,
  },
  {
    id: 5,
    name: "Wood",
    tiles: [T.WOOD_SIDE, T.WOOD_SIDE, T.WOOD_TOP, T.WOOD_TOP, T.WOOD_SIDE, T.WOOD_SIDE],
    color: "#785634",
    solid: true,
    opaque: true,
    transparent: false,
    liquid: false,
  },
  {
    id: 6,
    name: "Leaves",
    tiles: uniform(T.LEAVES),
    color: "#366e2c",
    solid: true,
    opaque: true,
    transparent: false,
    liquid: false,
  },
  {
    id: 7,
    name: "Water",
    tiles: uniform(T.WATER),
    color: "#366ec4",
    solid: false,
    opaque: false,
    transparent: true,
    liquid: true,
  },
  {
    id: 8,
    name: "Bedrock",
    tiles: uniform(T.BEDROCK),
    color: "#46464a",
    solid: true,
    opaque: true,
    transparent: false,
    liquid: false,
  },
];

export const AIR_BLOCK = 0;

export function isAir(id: BlockId): boolean {
  return id === AIR_BLOCK;
}

export function getBlock(id: BlockId): BlockDef {
  return BLOCKS[id] ?? AIR;
}

/** Blocks available in the hotbar (creative palette). */
export const HOTBAR_BLOCKS: readonly BlockId[] = [1, 2, 3, 4, 5, 6, 7, 8];
