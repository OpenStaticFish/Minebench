import { describe, expect, test } from "bun:test";
import { CHUNK_HEIGHT, CHUNK_SIZE } from "../src/core/constants";
import { BlockId } from "../src/world/blocks";
import { buildChunkMesh, createPaddedView, type MeshArrays } from "../src/world/mesher";
import { ATLAS_COLS, ATLAS_ROWS } from "../src/world/textures";

const atlas = { cols: ATLAS_COLS, rows: ATLAS_ROWS };

function paddedFromBlocks(blocks: Array<[number, number, number, number]>): Uint8Array {
  const map = new Map<string, number>();
  for (const [x, y, z, id] of blocks) map.set(`${x},${y},${z}`, id);
  return createPaddedView(0, 0, (x, y, z) => map.get(`${x},${y},${z}`) ?? BlockId.Air);
}

function faceCount(mesh: MeshArrays): number {
  return mesh.indices.length / 6;
}

function assertWinding(mesh: MeshArrays): void {
  const positions = mesh.positions;
  const normals = mesh.normals;
  const at = (array: number[], index: number): number => array[index] as number;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = at(mesh.indices, i) * 3;
    const b = at(mesh.indices, i + 1) * 3;
    const c = at(mesh.indices, i + 2) * 3;
    const e1 = [
      at(positions, b) - at(positions, a),
      at(positions, b + 1) - at(positions, a + 1),
      at(positions, b + 2) - at(positions, a + 2),
    ];
    const e2 = [
      at(positions, c) - at(positions, a),
      at(positions, c + 1) - at(positions, a + 1),
      at(positions, c + 2) - at(positions, a + 2),
    ];
    const cross = [
      at(e1, 1) * at(e2, 2) - at(e1, 2) * at(e2, 1),
      at(e1, 2) * at(e2, 0) - at(e1, 0) * at(e2, 2),
      at(e1, 0) * at(e2, 1) - at(e1, 1) * at(e2, 0),
    ];
    const length = Math.hypot(at(cross, 0), at(cross, 1), at(cross, 2));
    const dot =
      (at(cross, 0) / length) * at(normals, a) +
      (at(cross, 1) / length) * at(normals, a + 1) +
      (at(cross, 2) / length) * at(normals, a + 2);
    expect(dot).toBeGreaterThan(0.9);
  }
}

describe("buildChunkMesh", () => {
  test("a lone block emits exactly six visible faces", () => {
    const padded = paddedFromBlocks([[5, 5, 5, BlockId.Stone]]);
    const mesh = buildChunkMesh(padded, atlas);
    expect(faceCount(mesh.opaque)).toBe(6);
    expect(mesh.opaque.positions.length / 3).toBe(24);
    expect(mesh.opaque.indices.length).toBe(36);
    expect(faceCount(mesh.water)).toBe(0);
    assertWinding(mesh.opaque);
  });

  test("adjacent blocks cull their shared faces", () => {
    const padded = paddedFromBlocks([
      [5, 5, 5, BlockId.Stone],
      [6, 5, 5, BlockId.Stone],
    ]);
    const mesh = buildChunkMesh(padded, atlas);
    expect(faceCount(mesh.opaque)).toBe(10);
  });

  test("a fully buried block produces no geometry", () => {
    const blocks: Array<[number, number, number, number]> = [];
    for (let x = 4; x <= 6; x++) {
      for (let y = 4; y <= 6; y++) {
        for (let z = 4; z <= 6; z++) blocks.push([x, y, z, BlockId.Stone]);
      }
    }
    const mesh = buildChunkMesh(paddedFromBlocks(blocks), atlas);
    // 3x3x3 cube: 9 faces of 1 unit each = 54 quads.
    expect(faceCount(mesh.opaque)).toBe(54);
  });

  test("water renders as a translucent surface without bottom faces", () => {
    const padded = paddedFromBlocks([[5, 5, 5, BlockId.Water]]);
    const mesh = buildChunkMesh(padded, atlas);
    expect(faceCount(mesh.water)).toBe(5);
    const ys = mesh.water.positions.filter((_, index) => index % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(5.88, 5);
    assertWinding(mesh.water);
  });

  test("water faces between water blocks are culled", () => {
    const padded = paddedFromBlocks([
      [5, 5, 5, BlockId.Water],
      [5, 6, 5, BlockId.Water],
    ]);
    const mesh = buildChunkMesh(padded, atlas);
    expect(faceCount(mesh.water)).toBe(9);
  });

  test("plants emit crossed billboards", () => {
    const padded = paddedFromBlocks([[5, 5, 5, BlockId.GrassTuft]]);
    const mesh = buildChunkMesh(padded, atlas);
    expect(faceCount(mesh.opaque)).toBe(4);
    expect(mesh.opaque.indices.length).toBe(24);
    expect(faceCount(mesh.water)).toBe(0);
  });

  test("vertex colours are shaded and bounded", () => {
    const padded = paddedFromBlocks([
      [5, 5, 5, BlockId.Grass],
      [6, 6, 5, BlockId.Stone],
    ]);
    const mesh = buildChunkMesh(padded, atlas);
    for (const color of mesh.opaque.colors) {
      expect(color).toBeGreaterThan(0);
      expect(color).toBeLessThanOrEqual(1);
    }
  });

  test("only emits blocks inside this chunk's own 16x16 column", () => {
    const blocks: Array<[number, number, number, number]> = [
      [-1, 5, 5, BlockId.Stone],
      [16, 5, 5, BlockId.Stone],
      [5, 5, -1, BlockId.Stone],
    ];
    const mesh = buildChunkMesh(paddedFromBlocks(blocks), atlas);
    expect(faceCount(mesh.opaque)).toBe(0);
  });

  test("stays within chunk bounds", () => {
    const padded = paddedFromBlocks([
      [0, 1, 0, BlockId.Stone],
      [CHUNK_SIZE - 1, CHUNK_HEIGHT - 1, CHUNK_SIZE - 1, BlockId.Stone],
    ]);
    const mesh = buildChunkMesh(padded, atlas);
    expect(faceCount(mesh.opaque)).toBe(12);
    const maxX = Math.max(...mesh.opaque.positions.filter((_, i) => i % 3 === 0));
    const maxZ = Math.max(...mesh.opaque.positions.filter((_, i) => i % 3 === 2));
    expect(maxX).toBeLessThanOrEqual(CHUNK_SIZE);
    expect(maxZ).toBeLessThanOrEqual(CHUNK_SIZE);
  });
});
