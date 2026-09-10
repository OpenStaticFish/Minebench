/**
 * Block registry. Every block is data-driven: the mesher, HUD, particles and
 * world generator all read from this table instead of hard-coding ids.
 */

export const BlockId = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Cobble: 4,
  Sand: 5,
  Sandstone: 6,
  Log: 7,
  Leaves: 8,
  Planks: 9,
  Snow: 10,
  Water: 11,
  GrassTuft: 12,
  Flower: 13,
  Bedrock: 14,
  Cactus: 15,
} as const;

export type BlockId = (typeof BlockId)[keyof typeof BlockId];

export type BlockRenderStyle = "cube" | "cross";

export interface BlockTiles {
  top: string;
  bottom: string;
  side: string;
}

export interface BlockDef {
  id: BlockId;
  /** Player-visible name (HUD, controls docs). */
  name: string;
  /** Participates in collision. */
  solid: boolean;
  /** Hides neighbouring block faces. */
  opaque: boolean;
  /** Water-like block: swimmable, translucent. */
  liquid: boolean;
  /** Can be replaced when placing a block (air, water, plants). */
  replaceable: boolean;
  render: BlockRenderStyle;
  tiles: BlockTiles;
  /** Flat colour used for break particles and UI accents. */
  color: number;
  /** Tile used for the hotbar icon. */
  iconTile: string;
}

const cube = (tile: string): BlockTiles => ({ top: tile, bottom: tile, side: tile });

export const BLOCKS: Record<BlockId, BlockDef> = {
  [BlockId.Air]: {
    id: BlockId.Air,
    name: "Air",
    solid: false,
    opaque: false,
    liquid: false,
    replaceable: true,
    render: "cube",
    tiles: cube("grass_top"),
    color: 0x000000,
    iconTile: "grass_top",
  },
  [BlockId.Grass]: {
    id: BlockId.Grass,
    name: "Grass",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: { top: "grass_top", bottom: "dirt", side: "grass_side" },
    color: 0x6aab4d,
    iconTile: "grass_side",
  },
  [BlockId.Dirt]: {
    id: BlockId.Dirt,
    name: "Dirt",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: cube("dirt"),
    color: 0x74513a,
    iconTile: "dirt",
  },
  [BlockId.Stone]: {
    id: BlockId.Stone,
    name: "Stone",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: cube("stone"),
    color: 0x8a8f96,
    iconTile: "stone",
  },
  [BlockId.Cobble]: {
    id: BlockId.Cobble,
    name: "Cobble",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: cube("cobble"),
    color: 0x7d838b,
    iconTile: "cobble",
  },
  [BlockId.Sand]: {
    id: BlockId.Sand,
    name: "Sand",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: cube("sand"),
    color: 0xe0d193,
    iconTile: "sand",
  },
  [BlockId.Sandstone]: {
    id: BlockId.Sandstone,
    name: "Sandstone",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: cube("sandstone"),
    color: 0xd8c58c,
    iconTile: "sandstone",
  },
  [BlockId.Log]: {
    id: BlockId.Log,
    name: "Log",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: { top: "log_top", bottom: "log_top", side: "log_side" },
    color: 0x6f4f2f,
    iconTile: "log_side",
  },
  [BlockId.Leaves]: {
    id: BlockId.Leaves,
    name: "Leaves",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: cube("leaves"),
    color: 0x3f7f3a,
    iconTile: "leaves",
  },
  [BlockId.Planks]: {
    id: BlockId.Planks,
    name: "Planks",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: cube("planks"),
    color: 0xb08a52,
    iconTile: "planks",
  },
  [BlockId.Snow]: {
    id: BlockId.Snow,
    name: "Snow",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: cube("snow"),
    color: 0xeef5fa,
    iconTile: "snow",
  },
  [BlockId.Water]: {
    id: BlockId.Water,
    name: "Water",
    solid: false,
    opaque: false,
    liquid: true,
    replaceable: true,
    render: "cube",
    tiles: cube("water"),
    color: 0x3f7fd0,
    iconTile: "water",
  },
  [BlockId.GrassTuft]: {
    id: BlockId.GrassTuft,
    name: "Grass Tuft",
    solid: false,
    opaque: false,
    liquid: false,
    replaceable: true,
    render: "cross",
    tiles: cube("tuft"),
    color: 0x5fae4f,
    iconTile: "tuft",
  },
  [BlockId.Flower]: {
    id: BlockId.Flower,
    name: "Flower",
    solid: false,
    opaque: false,
    liquid: false,
    replaceable: true,
    render: "cross",
    tiles: cube("flower"),
    color: 0xe8b04b,
    iconTile: "flower",
  },
  [BlockId.Bedrock]: {
    id: BlockId.Bedrock,
    name: "Bedrock",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: cube("bedrock"),
    color: 0x4a4f57,
    iconTile: "bedrock",
  },
  [BlockId.Cactus]: {
    id: BlockId.Cactus,
    name: "Cactus",
    solid: true,
    opaque: true,
    liquid: false,
    replaceable: false,
    render: "cube",
    tiles: { top: "cactus_top", bottom: "cactus_top", side: "cactus_side" },
    color: 0x4f8f42,
    iconTile: "cactus_side",
  },
};

export function getBlockDef(id: number): BlockDef {
  return BLOCKS[id as BlockId] ?? BLOCKS[BlockId.Air];
}

export function isOpaque(id: number): boolean {
  return getBlockDef(id).opaque;
}

export function isSolid(id: number): boolean {
  return getBlockDef(id).solid;
}

export function isLiquid(id: number): boolean {
  return getBlockDef(id).liquid;
}

export function isReplaceable(id: number): boolean {
  return getBlockDef(id).replaceable;
}

export function isCross(id: number): boolean {
  return getBlockDef(id).render === "cross";
}

/** Hotbar contents, selectable with number keys 1-9 and the mouse wheel. */
export const HOTBAR_BLOCKS: readonly BlockId[] = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Cobble,
  BlockId.Sand,
  BlockId.Log,
  BlockId.Leaves,
  BlockId.Planks,
  BlockId.Snow,
];

/** Every tile name the procedural atlas must contain, in atlas order. */
export const ATLAS_TILES: readonly string[] = [
  "grass_top",
  "grass_side",
  "dirt",
  "stone",
  "cobble",
  "sand",
  "sandstone",
  "log_side",
  "log_top",
  "leaves",
  "planks",
  "snow",
  "water",
  "bedrock",
  "tuft",
  "flower",
  "cactus_top",
  "cactus_side",
];
