/**
 * Block registry: every block type, its texture mapping and physical flags.
 *
 * Flags drive the mesher and the physics:
 *  - `solid`     → blocks player movement
 *  - `opaque`    → hides neighbouring faces entirely
 *  - `cullSame`  → faces between two identical blocks are dropped (false for leaves)
 *  - `liquid`    → non-solid, rendered in the transparent pass, swimmable
 *  - `glow`      → face ignores ambient occlusion and renders fully lit
 */
import { TILE_INDEX, type TileName } from "./textures"

export const B = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Cobblestone: 4,
  Sand: 5,
  Log: 6,
  Leaves: 7,
  Planks: 8,
  Glass: 9,
  Water: 10,
  Snow: 11,
  CoalOre: 12,
  IronOre: 13,
  Lamp: 14,
  Bedrock: 15,
} as const

export interface BlockDef {
  readonly id: number
  readonly name: string
  readonly tiles: { readonly top: number; readonly side: number; readonly bottom: number }
  readonly solid: boolean
  readonly opaque: boolean
  readonly cullSame: boolean
  readonly liquid: boolean
  readonly glow: boolean
  readonly unbreakable: boolean
}

interface Flags {
  solid?: boolean
  opaque?: boolean
  cullSame?: boolean
  liquid?: boolean
  glow?: boolean
  unbreakable?: boolean
}

const tiles = (top: TileName, side: TileName, bottom: TileName = top) => ({
  top: TILE_INDEX[top],
  side: TILE_INDEX[side],
  bottom: TILE_INDEX[bottom],
})

function def(id: number, name: string, tileMap: BlockDef["tiles"], flags: Flags = {}): BlockDef {
  return {
    id,
    name,
    tiles: tileMap,
    solid: flags.solid ?? true,
    opaque: flags.opaque ?? true,
    cullSame: flags.cullSame ?? true,
    liquid: flags.liquid ?? false,
    glow: flags.glow ?? false,
    unbreakable: flags.unbreakable ?? false,
  }
}

/** Indexed by block id. Order must match `B`. */
export const BLOCKS: readonly BlockDef[] = [
  def(B.Air, "Air", tiles("stone", "stone"), { solid: false, opaque: false, unbreakable: true }),
  def(B.Grass, "Grass Block", tiles("grass_top", "grass_side", "dirt")),
  def(B.Dirt, "Dirt", tiles("dirt", "dirt")),
  def(B.Stone, "Stone", tiles("stone", "stone")),
  def(B.Cobblestone, "Cobblestone", tiles("cobble", "cobble")),
  def(B.Sand, "Sand", tiles("sand", "sand")),
  def(B.Log, "Oak Log", tiles("log_top", "log_side")),
  def(B.Leaves, "Leaves", tiles("leaves", "leaves"), { opaque: false, cullSame: false }),
  def(B.Planks, "Planks", tiles("planks", "planks")),
  def(B.Glass, "Glass", tiles("glass", "glass"), { opaque: false }),
  def(B.Water, "Water", tiles("water", "water"), { solid: false, opaque: false, liquid: true }),
  def(B.Snow, "Snow", tiles("snow", "snow")),
  def(B.CoalOre, "Coal Ore", tiles("coal_ore", "coal_ore")),
  def(B.IronOre, "Iron Ore", tiles("iron_ore", "iron_ore")),
  def(B.Lamp, "Lamp", tiles("lamp", "lamp"), { glow: true }),
  def(B.Bedrock, "Bedrock", tiles("bedrock", "bedrock"), { unbreakable: true }),
]

export const AIR: BlockDef = BLOCKS[B.Air]!

/** Blocks offered in the hotbar, in slot order. */
export const HOTBAR: readonly number[] = [
  B.Grass,
  B.Dirt,
  B.Stone,
  B.Cobblestone,
  B.Sand,
  B.Log,
  B.Planks,
  B.Glass,
  B.Lamp,
]

/** Safe lookup; unknown ids degrade to Air instead of crashing the mesher. */
export function blockDef(id: number): BlockDef {
  return BLOCKS[id] ?? AIR
}
