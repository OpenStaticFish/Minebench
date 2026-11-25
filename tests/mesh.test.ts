import { expect, test } from 'bun:test';
import { meshChunk } from '../src/mesh';
import { Block, CHUNK, HEIGHT } from '../src/world';

test('an edit on the other side of the seam reveals exactly one new quad', () => {
  const empty = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  const west = empty.slice(), east = empty.slice();
  const source = { chunk: (x: number, z: number) =>
    z === 0 && x === -1 ? west : z === 0 && x === 0 ? east : empty };
  const row = (10 * CHUNK + 8) * CHUNK;
  west[row + 15] = east[row] = Block.Stone;
  const before = meshChunk(source, -1, 0);
  expect(before.getIndex()!.count).toBe(5 * 6);
  east[row] = Block.Air;
  const after = meshChunk(source, -1, 0);
  expect(after.getIndex()!.count).toBe(6 * 6);
  before.dispose();
  after.dispose();
});
