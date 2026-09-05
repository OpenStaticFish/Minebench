import * as THREE from "three";
import { BLOCKS, Block, isOpaque } from "./blocks";
import { tileUV } from "./textures";
import type { Chunk } from "./chunk";
import { CHUNK_W, CHUNK_H } from "./constants";
import type { World } from "./world";

interface FaceDef {
  /** Face normal. */
  n: readonly [number, number, number];
  /** Tangent axes so that u x v = n. */
  u: readonly [number, number, number];
  v: readonly [number, number, number];
  /** Tile slot in BlockDef.tiles: 0 top, 1 bottom, 2 side. */
  slot: 0 | 1 | 2;
}

const FACES: readonly FaceDef[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], slot: 2 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], slot: 2 },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], slot: 0 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], slot: 1 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], slot: 2 },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], slot: 2 },
];

/** Corner order (su, sv) — CCW seen from outside since u x v = n. */
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

const UVS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const AO_LEVELS = [0.55, 0.7, 0.85, 1.0];

interface MeshBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function newBuffers(): MeshBuffers {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

function toGeometry(b: MeshBuffers): THREE.BufferGeometry | null {
  if (b.indices.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(b.normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uvs, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(b.colors, 3));
  g.setIndex(b.indices);
  return g;
}

/**
 * Builds solid + water geometry for a chunk.
 * Only faces adjacent to non-opaque neighbors are emitted; solid vertices
 * carry baked ambient occlusion in their color attribute.
 */
export function buildChunkMeshes(world: World, chunk: Chunk): {
  solid: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
} {
  const solid = newBuffers();
  const water = newBuffers();
  const ox = chunk.cx * CHUNK_W;
  const oz = chunk.cz * CHUNK_W;

  for (let y = 0; y < CHUNK_H; y++) {
    for (let z = 0; z < CHUNK_W; z++) {
      for (let x = 0; x < CHUNK_W; x++) {
        const id = chunk.get(x, y, z);
        if (id === Block.Air) continue;

        const wx = ox + x;
        const wz = oz + z;

        if (id === Block.Water) {
          addWaterFaces(world, water, x, y, z, wx, wz);
          continue;
        }

        const def = BLOCKS[id]!;
        for (const face of FACES) {
          const nx = wx + face.n[0]!;
          const ny = y + face.n[1]!;
          const nz = wz + face.n[2]!;
          const neighbor = world.getBlock(nx, ny, nz);
          if (isOpaque(neighbor)) continue;
          if (id === Block.Leaves && neighbor === Block.Leaves) continue;

          addSolidFace(solid, world, def, face, x, y, z, wx, wz);
        }
      }
    }
  }

  return { solid: toGeometry(solid), water: toGeometry(water) };
}

/**
 * Adds one quad. Vertex positions use local chunk coords (lx/lz) because the
 * mesh is positioned at the chunk origin; occlusion lookups use world coords.
 */
function addSolidFace(
  buf: MeshBuffers,
  world: World,
  def: (typeof BLOCKS)[number],
  face: FaceDef,
  lx: number,
  ly: number,
  lz: number,
  wx: number,
  wz: number,
): void {
  const tile = def.tiles[face.slot];
  const [u0, v0, u1, v1] = tileUV(tile);
  const base = buf.positions.length / 3;
  const ao: number[] = [];

  for (let c = 0; c < 4; c++) {
    const [su, sv] = CORNERS[c]!;
    // Vertex position: cube face center offset along the two tangents.
    const px = lx + 0.5 + face.n[0]! * 0.5 + (face.u[0]! * su + face.v[0]! * sv) * 0.5;
    const py = ly + 0.5 + face.n[1]! * 0.5 + (face.u[1]! * su + face.v[1]! * sv) * 0.5;
    const pz = lz + 0.5 + face.n[2]! * 0.5 + (face.u[2]! * su + face.v[2]! * sv) * 0.5;
    buf.positions.push(px, py, pz);
    buf.normals.push(face.n[0]!, face.n[1]!, face.n[2]!);
    const [uu, vv] = UVS[c]!;
    buf.uvs.push(uu ? u1 : u0, vv ? v1 : v0);

    // Ambient occlusion from the three neighbors around this corner.
    const bx = wx + face.n[0]!;
    const by = ly + face.n[1]!;
    const bz = wz + face.n[2]!;
    const s1 = isOpaque(world.getBlock(bx + face.u[0]! * su, by + face.u[1]! * su, bz + face.u[2]! * su)) ? 1 : 0;
    const s2 = isOpaque(world.getBlock(bx + face.v[0]! * sv, by + face.v[1]! * sv, bz + face.v[2]! * sv)) ? 1 : 0;
    const cr = isOpaque(
      world.getBlock(
        bx + face.u[0]! * su + face.v[0]! * sv,
        by + face.u[1]! * su + face.v[1]! * sv,
        bz + face.u[2]! * su + face.v[2]! * sv,
      ),
    ) ? 1 : 0;
    const level = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
    ao.push(level);
    const b = AO_LEVELS[level]!;
    buf.colors.push(b, b, b);
  }

  // Flip the quad diagonal to avoid AO interpolation artifacts.
  if (ao[0]! + ao[2]! > ao[1]! + ao[3]!) {
    buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    buf.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  }
}

const WATER_TOP = 0.875;

function addWaterFaces(
  world: World,
  buf: MeshBuffers,
  lx: number,
  ly: number,
  lz: number,
  wx: number,
  wz: number,
): void {
  for (const face of FACES) {
    const nx = wx + face.n[0]!;
    const ny = ly + face.n[1]!;
    const nz = wz + face.n[2]!;
    const neighbor = world.getBlock(nx, ny, nz);
    // Water renders only against air (and the world underside is ignored).
    if (neighbor !== Block.Air) continue;

    const tile = BLOCKS[Block.Water]!.tiles[face.slot]!;
    const [u0, v0, u1, v1] = tileUV(tile);
    const base = buf.positions.length / 3;

    for (let c = 0; c < 4; c++) {
      const [su, sv] = CORNERS[c]!;
      const isTopCorner = face.n[1] === 1 || (face.n[1] === 0 && face.v[1]! * sv > 0);
      const topDrop = isTopCorner && world.getBlock(wx, ly + 1, wz) !== Block.Water ? WATER_TOP - 1 : 0;
      const px = lx + 0.5 + face.n[0]! * 0.5 + (face.u[0]! * su + face.v[0]! * sv) * 0.5;
      const py = ly + 0.5 + face.n[1]! * 0.5 + (face.u[1]! * su + face.v[1]! * sv) * 0.5 + topDrop;
      const pz = lz + 0.5 + face.n[2]! * 0.5 + (face.u[2]! * su + face.v[2]! * sv) * 0.5;
      buf.positions.push(px, py, pz);
      buf.normals.push(face.n[0]!, face.n[1]!, face.n[2]!);
      const [uu, vv] = UVS[c]!;
      buf.uvs.push(uu ? u1 : u0, vv ? v1 : v0);
      buf.colors.push(1, 1, 1);
    }
    buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
