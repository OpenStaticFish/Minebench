/** Draw the three small field-manual diagrams. These are illustrations, not game captures. */
import { resolve } from 'node:path';

const materials = {
  grass: ['#b7c876', '#7d995b', '#98aa62'],
  moss: ['#a3b269', '#657f52', '#84965c'],
  dirt: ['#bb945d', '#947246', '#a7814e'],
  shale: ['#a7ab94', '#707b70', '#889382'],
  sand: ['#e2ca8c', '#b79f6a', '#c6b77c'],
  water: ['#8cbfba', '#599c9c', '#72ada7'],
  bark: ['#c5a56b', '#81684b', '#a17f53'],
  leaf: ['#83a369', '#4a7054', '#60855b'],
  pine: ['#718e67', '#3b604f', '#51765a'],
  sun: ['#e9b45e', '#a77b40', '#c28f47'],
  cloud: ['#fffae7', '#c4cec3', '#dbe2ce'],
};
type Mat = keyof typeof materials;
type Block = { x: number; z: number; y: number; mat: Mat };
function box(r: number, h: number, mat: Mat) {
  const s = r * 0.5,
    [top, left, right] = materials[mat];
  return `<path fill="${left}" d="M${-r} 0 0 ${s}v${h}l${-r} ${-s}z"/><path fill="${right}" d="M0 ${s} ${r} 0v${h}L0 ${s + h}z"/><path fill="${top}" d="M0 ${-s} ${r} 0 0 ${s} ${-r} 0z"/>`;
}
function tile(id: Mat) {
  const markings =
    id === 'water'
      ? `<path fill="none" stroke="#d7e4cf" stroke-width="1.6" d="m-8-1 5-2m3 5 6-3"/>`
      : `<path fill="#fff" opacity=".16" d="m-8-1 4-2 4 2-4 2zm11-1 2-1 3 1-2 1z"/><path fill="#222c21" opacity=".17" d="m-11 6 3 1.5v2l-3-1.5zm16 3 4-2v2L5 11z"/>`;
  return `<g id="${id}">${box(15, 10, id)}${markings}</g>`;
}
function pine() {
  return `<g id="spruce">${box(3, 12, 'bark')}
    <g transform="translate(0,-5)">${box(13, 6, 'pine')}</g>
    <g transform="translate(0,-12)">${box(10, 7, 'leaf')}</g>
    <g transform="translate(0,-19)">${box(6.4, 6, 'pine')}</g>
    <g transform="translate(0,-24)">${box(3.3, 5, 'leaf')}</g></g>`;
}
const defs = `<defs>${Object.keys(materials)
  .map((m) => tile(m as Mat))
  .join('')}${pine()}</defs>`;
function project(x: number, z: number, y: number) {
  return [139 + (x - z) * 15, 68 + (x + z) * 7.5 - y * 10] as const;
}
function use(id: string, x: number, y: number, scale = 1) {
  return `<use href="#${id}" transform="translate(${x} ${y}) scale(${scale})"/>`;
}
function diagram(name: 'terrain' | 'flight' | 'build') {
  const blocks: Block[] = [];
  const pineAt: Record<string, number> = {};
  let marks = '';
  const col = (x: number, z: number, mats: Mat[]) =>
    mats.forEach((mat, y) => blocks.push({ x, z, y, mat }));
  if (name === 'terrain') {
    for (let x = 0; x < 6; x++)
      for (let z = 0; z < 5; z++) {
        const stream = x === 2 + (z > 2 ? 1 : 0),
          bank = x === 3 + (z > 2 ? 1 : 0);
        col(
          x,
          z,
          stream
            ? ['shale', 'water']
            : bank
              ? ['shale', 'sand']
              : ['shale', 'dirt', x === 0 ? 'moss' : 'grass'],
        );
      }
    pineAt['0,1'] = 1.16;
    pineAt['1,0'] = 1.34;
    pineAt['0,3'] = 0.8;
    pineAt['5,1'] = 0.84;
  } else if (name === 'flight') {
    for (let x = 0; x < 5; x++)
      for (let z = 0; z < 4; z++) {
        if (x === 0 && z === 3) continue;
        col(
          x,
          z,
          x < 2
            ? ['shale', 'dirt', 'moss', 'grass']
            : x === 2
              ? ['shale', 'dirt', 'grass']
              : ['shale', 'grass'],
        );
      }
    pineAt['0,0'] = 0.92;
    pineAt['3,2'] = 0.64;
    for (const [x, y, s] of [
      [179, 34, 0.73],
      [193, 31, 0.9],
      [205, 33, 0.61],
      [71, 45, 0.56],
      [82, 42, 0.69],
    ] as const)
      marks += use('cloud', x, y, s);
    marks += `<path d="M84 114c-35-12-34-33-9-41 22-8 48 1 73-7 12-4 23-12 34-21" fill="none" stroke="#b15b32" stroke-width="2" stroke-dasharray="4 4"/><path d="m173 44 13-4-6 12-1-6z" fill="#ae532c"/>`;
  } else {
    for (let x = 0; x < 5; x++)
      for (let z = 0; z < 4; z++) {
        const high = x < 2 && z < 2;
        col(
          x,
          z,
          high
            ? ['shale', 'dirt', 'grass']
            : z === 3
              ? ['shale', 'dirt']
              : ['shale', 'dirt', 'moss'],
        );
      }
    for (const [x, z, y, mat] of [
      [3, 1, 4.7, 'grass'],
      [4, 3, 2.7, 'dirt'],
      [0.6, 2, 3.75, 'shale'],
    ] as const) {
      const [u, v] = project(x, z, y);
      marks += `<path d="M${u - 15} ${v + 10}v17m30-17v17" stroke="#9e7448" stroke-dasharray="3 3" fill="none"/>${use(mat, u, v)}`;
    }
  }
  blocks.sort((a, b) => a.x + a.z - b.x - b.z || a.x - b.x || a.y - b.y);
  let drawing = '';
  for (const [i, b] of blocks.entries()) {
    const [u, v] = project(b.x, b.z, b.y);
    drawing += use(b.mat, u, v);
    const next = blocks[i + 1],
      tree = pineAt[`${b.x},${b.z}`];
    if (tree && (!next || next.x !== b.x || next.z !== b.z))
      drawing += use('spruce', u, v - 10 * tree, tree);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 160">${defs}<path d="m54 105 74-37 96 48-69 35z" fill="#314d38" opacity=".12"/>${drawing}${marks}</svg>`;
}
for (const name of ['terrain', 'flight', 'build'] as const) {
  await Bun.write(resolve('public', 'field', `${name}.svg`), diagram(name));
}
