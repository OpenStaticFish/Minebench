import { CHUNK_HEIGHT, CHUNK_SIZE } from "../core/constants";
import { hash3i } from "../core/rng";
import { ATLAS_TILES, BlockId, getBlockDef, type BlockDef } from "./blocks";
import { TILE_SIZE } from "./textures";

/**
 * Chunk mesher.
 *
 * Strategy: only faces that touch a non-opaque neighbour are emitted, so a
 * 16x16x96 column of solid stone produces a handful of surface quads instead of
 * thousands of cubes. Per-vertex ambient occlusion and per-face directional
 * shading are baked into vertex colours, which keeps the scene readable with a
 * single cheap Lambert material and no shadow maps.
 *
 * The mesher is pure TypeScript (no Three.js imports) so it can be unit tested
 * with `bun test`.
 */

export const PAD_X = CHUNK_SIZE + 2;
export const PAD_Y = CHUNK_HEIGHT + 2;
export const PAD_Z = CHUNK_SIZE + 2;

/** Water surface sits slightly below a full block. */
export const WATER_TOP = 0.88;

const TILE_INDEX: Record<string, number> = {};
ATLAS_TILES.forEach((name, index) => {
  TILE_INDEX[name] = index;
});

export function padIndex(x: number, y: number, z: number): number {
  return ((x + 1) * PAD_Y + (y + 1)) * PAD_Z + (z + 1);
}

export function createPaddedView(
  originX: number,
  originZ: number,
  getBlock: (x: number, y: number, z: number) => number,
): Uint8Array {
  const view = new Uint8Array(PAD_X * PAD_Y * PAD_Z);
  for (let x = -1; x <= CHUNK_SIZE; x++) {
    for (let z = -1; z <= CHUNK_SIZE; z++) {
      for (let y = -1; y <= CHUNK_HEIGHT; y++) {
        let id: number;
        if (y < 0) id = BlockId.Bedrock;
        else if (y >= CHUNK_HEIGHT) id = BlockId.Air;
        else id = getBlock(originX + x, y, originZ + z);
        view[padIndex(x, y, z)] = id;
      }
    }
  }
  return view;
}

type Vec3 = readonly [number, number, number];

interface FaceCorner {
  pos: Vec3;
  du: Vec3;
  dv: Vec3;
}

interface FaceDef {
  normal: Vec3;
  shade: number;
  corners: FaceCorner[];
}

function makeFace(normal: Vec3, shade: number, verts: Vec3[]): FaceDef {
  const axis = normal[0] !== 0 ? 0 : normal[1] !== 0 ? 1 : 2;
  const tangentA = axis === 0 ? 1 : 0;
  const tangentB = axis === 2 ? 1 : 2;
  const corners = verts.map((pos) => {
    const du: [number, number, number] = [0, 0, 0];
    const dv: [number, number, number] = [0, 0, 0];
    du[tangentA] = pos[tangentA] === 1 ? 1 : -1;
    dv[tangentB] = pos[tangentB] === 1 ? 1 : -1;
    return { pos, du, dv };
  });
  return { normal, shade, corners };
}

/** Face order matters: 0..5 are used for tile lookups (top = index 2, bottom = 3). */
const FACES: FaceDef[] = [
  makeFace([1, 0, 0], 0.74, [
    [1, 0, 1],
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
  ]),
  makeFace([-1, 0, 0], 0.78, [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
  ]),
  makeFace([0, 1, 0], 1.0, [
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
    [0, 1, 0],
  ]),
  makeFace([0, -1, 0], 0.5, [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
  ]),
  makeFace([0, 0, 1], 0.86, [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ]),
  makeFace([0, 0, -1], 0.82, [
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ]),
];

const AO_SHADE = [0.5, 0.68, 0.84, 1] as const;
const QUAD_UVS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export interface MeshArrays {
  positions: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
}

export interface ChunkMeshData {
  opaque: MeshArrays;
  water: MeshArrays;
}

function emptyArrays(): MeshArrays {
  return { positions: [], normals: [], colors: [], uvs: [], indices: [] };
}

export interface AtlasDimensions {
  cols: number;
  rows: number;
}

function tileIndexFor(def: BlockDef, faceIndex: number): number {
  const tiles = def.tiles;
  const name = faceIndex === 2 ? tiles.top : faceIndex === 3 ? tiles.bottom : tiles.side;
  return TILE_INDEX[name] ?? 0;
}

function emitQuad(
  mesh: MeshArrays,
  positions: ReadonlyArray<Vec3>,
  normal: Vec3,
  colors: ReadonlyArray<number>,
  tileIndex: number,
  atlas: AtlasDimensions,
  uvs: ReadonlyArray<readonly [number, number]> = QUAD_UVS,
): void {
  const base = mesh.positions.length / 3;
  const cols = atlas.cols;
  const rows = atlas.rows;
  const col = tileIndex % cols;
  const row = Math.floor(tileIndex / cols);
  const u0 = col / cols;
  const u1 = (col + 1) / cols;
  const vTop = 1 - row / rows;
  const vBottom = 1 - (row + 1) / rows;
  const insetU = 0.5 / (cols * TILE_SIZE);
  const insetV = 0.5 / (rows * TILE_SIZE);

  for (let i = 0; i < 4; i++) {
    const pos = positions[i] as Vec3;
    const color = colors[i] ?? 1;
    const uv = uvs[i] ?? QUAD_UVS[i] as readonly [number, number];
    mesh.positions.push(pos[0], pos[1], pos[2]);
    mesh.normals.push(normal[0], normal[1], normal[2]);
    mesh.colors.push(color, color, color);
    mesh.uvs.push(
      u0 + uv[0] * (u1 - u0 - insetU * 2) + insetU,
      vBottom + uv[1] * (vTop - vBottom - insetV * 2) + insetV,
    );
  }

  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function isSolidForAo(id: number): boolean {
  return getBlockDef(id).opaque;
}

function readPadded(view: Uint8Array, x: number, y: number, z: number): number {
  return view[padIndex(x, y, z)] as number;
}

export function buildChunkMesh(padded: Uint8Array, atlas: AtlasDimensions): ChunkMeshData {
  const opaque = emptyArrays();
  const water = emptyArrays();

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = readPadded(padded, x, y, z);
        if (id === BlockId.Air) continue;
        const def = getBlockDef(id);

        if (def.render === "cross") {
          emitCross(opaque, def, x, y, z, atlas);
          continue;
        }

        if (def.liquid) {
          emitLiquid(water, def, padded, x, y, z, atlas);
          continue;
        }

        emitCube(opaque, def, padded, x, y, z, atlas);
      }
    }
  }

  return { opaque, water };
}

function emitCube(
  mesh: MeshArrays,
  def: BlockDef,
  padded: Uint8Array,
  x: number,
  y: number,
  z: number,
  atlas: AtlasDimensions,
): void {
  const variation = 0.96 + hash3i(x, y, z, 9173) * 0.08;

  for (let faceIndex = 0; faceIndex < FACES.length; faceIndex++) {
    const face = FACES[faceIndex] as FaceDef;
    const n = face.normal;
    const nx = x + n[0];
    const ny = y + n[1];
    const nz = z + n[2];
    const neighbour = readPadded(padded, nx, ny, nz);
    if (isSolidForAo(neighbour)) continue;

    const positions: Vec3[] = [];
    const colors: number[] = [];
    for (const corner of face.corners) {
      const pos = corner.pos;
      positions.push([pos[0] + x, pos[1] + y, pos[2] + z]);
      const s1 = isSolidForAo(
        readPadded(padded, nx + corner.du[0], ny + corner.du[1], nz + corner.du[2]),
      )
        ? 1
        : 0;
      const s2 = isSolidForAo(
        readPadded(padded, nx + corner.dv[0], ny + corner.dv[1], nz + corner.dv[2]),
      )
        ? 1
        : 0;
      const cornerSolid = isSolidForAo(
        readPadded(
          padded,
          nx + corner.du[0] + corner.dv[0],
          ny + corner.du[1] + corner.dv[1],
          nz + corner.du[2] + corner.dv[2],
        ),
      )
        ? 1
        : 0;
      const ao = s1 === 1 && s2 === 1 ? 0 : 3 - (s1 + s2 + cornerSolid);
      colors.push(Math.min(1, (AO_SHADE[ao] as number) * face.shade * variation));
    }

    emitQuad(mesh, positions, face.normal, colors, tileIndexFor(def, faceIndex), atlas);
  }
}

function emitLiquid(
  mesh: MeshArrays,
  def: BlockDef,
  padded: Uint8Array,
  x: number,
  y: number,
  z: number,
  atlas: AtlasDimensions,
): void {
  const tile = tileIndexFor(def, 2);
  for (let faceIndex = 0; faceIndex < FACES.length; faceIndex++) {
    const face = FACES[faceIndex] as FaceDef;
    const n = face.normal;
    if (n[1] === -1) continue; // never visible
    const neighbour = readPadded(padded, x + n[0], y + n[1], z + n[2]);
    const neighbourDef = getBlockDef(neighbour);
    if (neighbourDef.opaque || neighbour === def.id) continue;

    const positions: Vec3[] = face.corners.map((corner) => {
      const pos = corner.pos;
      return [
        pos[0] + x,
        (pos[1] === 1 ? WATER_TOP : pos[1]) + y,
        pos[2] + z,
      ] as Vec3;
    });
    const colors = positions.map(() => face.shade * 0.98);
    emitQuad(mesh, positions, face.normal, colors, tile, atlas);
  }
}

function emitCross(
  mesh: MeshArrays,
  def: BlockDef,
  x: number,
  y: number,
  z: number,
  atlas: AtlasDimensions,
): void {
  const tile = tileIndexFor(def, 2);
  const min = 0.146;
  const max = 0.854;
  const shade = 0.94;
  const planes: Vec3[][] = [
    [
      [x + min, y, z + min],
      [x + max, y, z + max],
      [x + max, y + 1, z + max],
      [x + min, y + 1, z + min],
    ],
    [
      [x + max, y, z + min],
      [x + min, y, z + max],
      [x + min, y + 1, z + max],
      [x + max, y + 1, z + min],
    ],
  ];
  for (const plane of planes) {
    const colors = [shade, shade, shade, shade];
    emitQuad(mesh, plane, [0, 1, 0], colors, tile, atlas);
    const reversed = [...plane].reverse() as Vec3[];
    emitQuad(mesh, reversed, [0, 1, 0], colors, tile, atlas);
  }
}
