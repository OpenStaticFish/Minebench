export const enum Block {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  SAND = 4,
  WOOD = 5,
  LEAVES = 6,
  WATER = 7,
  GLASS = 8,
  BRICK = 9,
}

export interface BlockDef {
  id: Block;
  name: string;
  color: string; // hex
  topColor?: string;
  bottomColor?: string;
  emissive?: boolean;
  transparent?: boolean;
  solid: boolean;
}

export const BLOCKS: Record<Block, BlockDef> = {
  [Block.AIR]:   { id: Block.AIR,   name: "Air",   color: "#000000", solid: false, transparent: true },
  [Block.GRASS]: { id: Block.GRASS, name: "Grass", color: "#6FAE5A", topColor: "#6EC85A", bottomColor: "#8E7355", solid: true },
  [Block.DIRT]:  { id: Block.DIRT,  name: "Dirt",  color: "#9B7B5A", solid: true },
  [Block.STONE]: { id: Block.STONE, name: "Stone", color: "#B8BDC2", solid: true },
  [Block.SAND]:  { id: Block.SAND,  name: "Sand",  color: "#E6D8A8", solid: true },
  [Block.WOOD]:  { id: Block.WOOD,  name: "Wood",  color: "#8B6A3A", topColor: "#7A5A2E", solid: true },
  [Block.LEAVES]:{ id: Block.LEAVES,name: "Leaves",color: "#4FAE5A", solid: true },
  [Block.WATER]: { id: Block.WATER, name: "Water", color: "#3D9BDB", solid: false, transparent: true },
  [Block.GLASS]: { id: Block.GLASS, name: "Glass", color: "#D6EFFF", solid: false, transparent: true },
  [Block.BRICK]: { id: Block.BRICK, name: "Brick", color: "#C46A4A", solid: true },
};

export const HOTBAR_BLOCKS: Block[] = [
  Block.GRASS, Block.DIRT, Block.STONE, Block.SAND, Block.WOOD, Block.LEAVES, Block.WATER, Block.BRICK, Block.GLASS
];

export function isSolid(id: number): boolean {
  return id !== Block.AIR && id !== Block.WATER && id !== Block.GLASS && BLOCKS[id as Block]?.solid === true;
}
export function isTransparent(id: number): boolean {
  if (id === Block.AIR) return true;
  const d = BLOCKS[id as Block];
  return d ? !!d.transparent : false;
}
export function isOpaque(id: number): boolean {
  return id !== Block.AIR && !isTransparent(id);
}
