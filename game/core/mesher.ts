/**
 * Chunk mesher: turns block data into render buffers.
 *
 * Only faces that touch a non-opaque block are emitted, so a solid mountain
 * costs the same as its surface. Ambient occlusion (AO) and directional face
 * shading are baked into a per-vertex light value, which keeps the shader trivial.
 */
import { B, BLOCKS, type BlockDef } from "./blocks"
import { CHUNK_SIZE, type Chunk, chunkIndex, WORLD_HEIGHT } from "./chunk"

export interface BlockSource {
  getBlock(x: number, y: number, z: number): number
}

export interface MeshData {
  positions: Float32Array
  uvs: Float32Array
  /** Interleaved [tileIndex, light] per vertex, both 0–255. */
  data: Uint8Array
  indices: Uint32Array
  vertexCount: number
  faceCount: number
}

type Vec3 = readonly [number, number, number]
type Vec2 = readonly [number, number]

interface Face {
  readonly n: Vec3
  /** Corners in counter-clockwise order seen from outside (three.js front faces). */
  readonly c: readonly Vec3[]
  readonly shade: number
}

// The sun sits roughly in the east/south, so those faces catch more light.
const FACES: readonly Face[] = [
  {
    n: [1, 0, 0],
    c: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    shade: 0.86,
  },
  {
    n: [-1, 0, 0],
    c: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    shade: 0.66,
  },
  {
    n: [0, 1, 0],
    c: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    shade: 1.0,
  },
  {
    n: [0, -1, 0],
    c: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    shade: 0.5,
  },
  {
    n: [0, 0, 1],
    c: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    shade: 0.8,
  },
  {
    n: [0, 0, -1],
    c: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    shade: 0.7,
  },
]

// Texture v is flipped: tile row 0 is the "top" of a texture, which maps to v=0.
const UV: readonly Vec2[] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
]

const AO_CURVE = [0.52, 0.7, 0.85, 1.0]

/**
 * For each face corner, the three neighbours that occlude it: two sides and the
 * diagonal, all in the layer the face points into.
 */
const AO_NEIGHBOURS: Array<Array<[Vec3, Vec3, Vec3]>> = FACES.map((face) =>
  face.c.map((corner) => {
    const axis = face.n[0] !== 0 ? 0 : face.n[1] !== 0 ? 1 : 2
    const [a, b] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]
    const sa = corner[a] === 1 ? 1 : -1
    const sb = corner[b] === 1 ? 1 : -1
    const shift = (da: number, db: number): Vec3 => {
      const v: [number, number, number] = [face.n[0], face.n[1], face.n[2]]
      v[a] = v[a]! + da
      v[b] = v[b]! + db
      return v
    }
    return [shift(sa, 0), shift(0, sb), shift(sa, sb)]
  }),
)

/** Grow-as-you-go vertex buffers; finished with sliced views. */
class Builder {
  private positions = new Float32Array(4096 * 3)
  private uvs = new Float32Array(4096 * 2)
  private data = new Uint8Array(4096 * 2)
  private indices = new Uint32Array(4096 * 2)
  vertexCount = 0
  private indexCount = 0
  faceCount = 0

  private ensure(extraVertices: number): void {
    const needed = this.vertexCount + extraVertices
    let cap = this.positions.length / 3
    if (needed <= cap) return
    while (cap < needed) cap *= 2
    const grow = <T extends Float32Array | Uint8Array | Uint32Array>(
      arr: T,
      make: (n: number) => T,
      width: number,
    ): T => {
      const next = make(cap * width)
      next.set(arr)
      return next
    }
    this.positions = grow(this.positions, (n) => new Float32Array(n), 3)
    this.uvs = grow(this.uvs, (n) => new Float32Array(n), 2)
    this.data = grow(this.data, (n) => new Uint8Array(n), 2)
    this.indices = grow(this.indices, (n) => new Uint32Array(n), 2)
  }

  vertex(x: number, y: number, z: number, u: number, v: number, tile: number, light: number): void {
    this.ensure(1)
    const p = this.vertexCount * 3
    this.positions[p] = x
    this.positions[p + 1] = y
    this.positions[p + 2] = z
    const t = this.vertexCount * 2
    this.uvs[t] = u
    this.uvs[t + 1] = v
    this.data[t] = tile
    this.data[t + 1] = light
    this.vertexCount++
  }

  /** Two triangles over the last four vertices; `flip` picks the other diagonal. */
  quad(flip: boolean): void {
    const i = this.indexCount
    const b = this.vertexCount - 4
    if (flip) {
      this.indices.set([b + 1, b + 2, b + 3, b + 1, b + 3, b], i)
    } else {
      this.indices.set([b, b + 1, b + 2, b, b + 2, b + 3], i)
    }
    this.indexCount += 6
    this.faceCount++
  }

  finish(): MeshData | null {
    if (this.faceCount === 0) return null
    return {
      positions: this.positions.subarray(0, this.vertexCount * 3),
      uvs: this.uvs.subarray(0, this.vertexCount * 2),
      data: this.data.subarray(0, this.vertexCount * 2),
      indices: this.indices.subarray(0, this.indexCount),
      vertexCount: this.vertexCount,
      faceCount: this.faceCount,
    }
  }
}

export function isOpaqueId(id: number): boolean {
  return id !== 0 && (BLOCKS[id] ?? BLOCKS[0]!).opaque
}

function faceVisible(block: BlockDef, neighbour: number): boolean {
  if (neighbour === 0) return true
  const n = BLOCKS[neighbour] ?? BLOCKS[0]!
  if (n.opaque) return false
  return !(block.id === neighbour && block.cullSame)
}

export interface ChunkMesh {
  opaque: MeshData | null
  water: MeshData | null
}

/** Build opaque (incl. cutout) and water buffers for one chunk. */
export function buildChunkMesh(chunk: Chunk, world: BlockSource): ChunkMesh {
  const opaque = new Builder()
  const water = new Builder()
  const data = chunk.data
  const ox = chunk.originX
  const oz = chunk.originZ
  const maxY = Math.min(chunk.maxY, WORLD_HEIGHT)

  const gb = (x: number, y: number, z: number): number => {
    if (y < 0) return B.Bedrock // below the world: culls the bottom layer
    if (y >= WORLD_HEIGHT) return 0
    if ((x & ~15) === 0 && (z & ~15) === 0) return data[chunkIndex(x, y, z)]!
    return world.getBlock(ox + x, y, oz + z)
  }

  const ao = [0, 0, 0, 0]
  const light = [0, 0, 0, 0]

  for (let y = 0; y < maxY; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = data[chunkIndex(x, y, z)]!
        if (id === 0) continue
        const def = BLOCKS[id]!
        const builder = def.liquid ? water : opaque
        for (let f = 0; f < 6; f++) {
          const face = FACES[f]!
          const neighbour = gb(x + face.n[0], y + face.n[1], z + face.n[2])
          if (!faceVisible(def, neighbour)) continue
          const tile =
            face.n[1] > 0 ? def.tiles.top : face.n[1] < 0 ? def.tiles.bottom : def.tiles.side

          const neighbours = AO_NEIGHBOURS[f]!
          for (let c = 0; c < 4; c++) {
            const [s1, s2, diag] = neighbours[c]!
            const o1 = isOpaqueId(gb(x + s1[0], y + s1[1], z + s1[2])) ? 1 : 0
            const o2 = isOpaqueId(gb(x + s2[0], y + s2[1], z + s2[2])) ? 1 : 0
            const o3 = isOpaqueId(gb(x + diag[0], y + diag[1], z + diag[2])) ? 1 : 0
            const level = o1 && o2 ? 0 : 3 - (o1 + o2 + o3)
            ao[c] = level
            light[c] = def.glow ? 255 : Math.round(Math.min(1, face.shade * AO_CURVE[level]!) * 255)
          }

          for (let c = 0; c < 4; c++) {
            const corner = face.c[c]!
            const uv = UV[c]!
            // Water surfaces sit slightly below the block top so shores read as shores.
            const vy = def.liquid && corner[1] === 1 ? y + corner[1] - 0.12 : y + corner[1]
            builder.vertex(x + corner[0], vy, z + corner[2], uv[0], uv[1], tile, light[c]!)
          }
          builder.quad(ao[0]! + ao[2]! > ao[1]! + ao[3]!)
        }
      }
    }
  }
  return { opaque: opaque.finish(), water: water.finish() }
}
