export enum Block { Air, Grass, Dirt, Stone, Sand, Wood, Leaves, Water, Brick, Glow }
export const blocks = [
  { id: Block.Grass, name: 'Meadow', color: '#819d50' },
  { id: Block.Dirt, name: 'Earth', color: '#967052' },
  { id: Block.Stone, name: 'Slate', color: '#88918a' },
  { id: Block.Sand, name: 'Sand', color: '#dfcb91' },
  { id: Block.Wood, name: 'Cedar', color: '#886040' },
  { id: Block.Leaves, name: 'Canopy', color: '#4f814a' },
  { id: Block.Brick, name: 'Terracotta', color: '#b77558' },
  { id: Block.Glow, name: 'Sunstone', color: '#f2d986' },
] as const;
export const solid = (id: Block): boolean => id !== Block.Air && id !== Block.Water;
export const palette: Record<number, [number, number, number]> = {
  [Block.Grass]: [0.46, 0.62, 0.29], [Block.Dirt]: [0.48, 0.32, 0.21],
  [Block.Stone]: [0.48, 0.53, 0.51], [Block.Sand]: [0.83, 0.74, 0.49],
  [Block.Wood]: [0.38, 0.25, 0.14], [Block.Leaves]: [0.26, 0.46, 0.24],
  [Block.Water]: [0.08, 0.4, 0.43], [Block.Brick]: [0.67, 0.34, 0.23],
  [Block.Glow]: [0.96, 0.78, 0.36],
};
