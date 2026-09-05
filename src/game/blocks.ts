/** Block registry. IDs are stored directly in chunk data as Uint8 values. */

export const Block = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Cobble: 4,
  Sand: 5,
  Log: 6,
  Leaves: 7,
  Water: 8,
  Snow: 9,
  Planks: 10,
} as const;
export type BlockId = (typeof Block)[keyof typeof Block];

export interface BlockDef {
  id: BlockId;
  name: string;
  /** Atlas tile indices: [top, bottom, side]. */
  tiles: readonly [number, number, number];
  /** Collides with the player. */
  solid: boolean;
  /** Occludes neighboring faces (used for face culling + ambient occlusion). */
  opaque: boolean;
}

const def = (
  id: BlockId,
  name: string,
  tiles: readonly [number, number, number],
  opts: Partial<Pick<BlockDef, "solid" | "opaque">> = {},
): BlockDef => ({ id, name, tiles, solid: true, opaque: true, ...opts });

export const BLOCKS: Record<number, BlockDef> = {
  [Block.Air]: def(Block.Air, "Air", [0, 0, 0], { solid: false, opaque: false }),
  [Block.Grass]: def(Block.Grass, "Grass", [0, 2, 1]),
  [Block.Dirt]: def(Block.Dirt, "Dirt", [2, 2, 2]),
  [Block.Stone]: def(Block.Stone, "Stone", [3, 3, 3]),
  [Block.Cobble]: def(Block.Cobble, "Cobblestone", [4, 4, 4]),
  [Block.Sand]: def(Block.Sand, "Sand", [5, 5, 5]),
  [Block.Log]: def(Block.Log, "Wood Log", [7, 7, 6]),
  [Block.Leaves]: def(Block.Leaves, "Leaves", [8, 8, 8]),
  [Block.Water]: def(Block.Water, "Water", [9, 9, 9], { solid: false, opaque: false }),
  [Block.Snow]: def(Block.Snow, "Snow", [10, 2, 11]),
  [Block.Planks]: def(Block.Planks, "Planks", [12, 12, 12]),
};

/** Blocks offered in the hotbar, in order. */
export const HOTBAR: readonly BlockId[] = [
  Block.Grass,
  Block.Dirt,
  Block.Stone,
  Block.Cobble,
  Block.Sand,
  Block.Log,
  Block.Leaves,
  Block.Planks,
  Block.Snow,
];

export function isOpaque(id: number): boolean {
  return BLOCKS[id]!.opaque;
}

export function isSolid(id: number): boolean {
  return BLOCKS[id]!.solid;
}
