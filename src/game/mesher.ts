import * as THREE from "three";
import { Block, BLOCKS } from "./blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE, type World } from "./world";
import type { Chunk } from "./chunk";

// Face directions
const FACES = [
  { dir: [1,0,0],  corners: [[1,0,0],[1,0,1],[1,1,1],[1,1,0]], normal: [1,0,0] },
  { dir: [-1,0,0], corners: [[0,0,1],[0,0,0],[0,1,0],[0,1,1]], normal: [-1,0,0] },
  { dir: [0,1,0],  corners: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]], normal: [0,1,0] },
  { dir: [0,-1,0], corners: [[0,0,1],[1,0,1],[1,0,0],[0,0,0]], normal: [0,-1,0] },
  { dir: [0,0,1],  corners: [[1,0,1],[0,0,1],[0,1,1],[1,1,1]], normal: [0,0,1] },
  { dir: [0,0,-1], corners: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]], normal: [0,0,-1] },
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v>>16)&255)/255, ((v>>8)&255)/255, (v&255)/255];
}

function colorForBlock(blockId: number, faceIdx: number): [number, number, number] {
  const def = BLOCKS[blockId as Block];
  if (!def) return [1,1,1];
  // grass special: top bright, sides, bottom
  if (blockId === Block.GRASS) {
    if (faceIdx === 2) return hexToRgb(def.topColor!); // +Y
    if (faceIdx === 3) return hexToRgb(def.bottomColor!); // -Y
    // sides: mix dirt + grass stripe variation
    return hexToRgb(def.color);
  }
  if (blockId === Block.LEAVES) {
    // slight variation per face for depth
    const base = hexToRgb(def.color);
    const shade = faceIdx === 2 ? 1.05 : faceIdx === 3 ? 0.88 : 0.95;
    return [base[0]*shade, base[1]*shade, base[2]*shade];
  }
  if (blockId === Block.WATER) return hexToRgb(def.color);
  if (def.topColor && faceIdx === 2) return hexToRgb(def.topColor);
  // light shading based on normal
  const base = hexToRgb(def.color);
  // apply simple AO shading: top brighter, bottom darker
  let mul = 1;
  if (faceIdx === 2) mul = 1.0;
  else if (faceIdx === 3) mul = 0.78;
  else if (faceIdx === 0 || faceIdx === 4) mul = 0.92;
  else mul = 0.86;
  return [base[0]*mul, base[1]*mul, base[2]*mul];
}

function shouldRenderFace(selfId: number, neighborId: number): boolean {
  if (selfId === Block.AIR) return false;
  if (neighborId === Block.AIR) return true;
  // water faces: only show if neighbor is not water and not opaque? Water is transparent, render face when neighbor is air or transparent != water
  if (selfId === Block.WATER) {
    if (neighborId === Block.WATER) return false;
    // if neighbor is opaque, don't show water face (underground water hidden)
    // but for surface we want top face when air above
    return true;
  }
  // glass: similar
  if (selfId === Block.GLASS) {
    return neighborId !== Block.GLASS;
  }
  // solid blocks: don't render if neighbor is opaque same type? Actually cull if neighbor is opaque (any solid not transparent)
  const neighborOpaque = neighborId !== Block.AIR && neighborId !== Block.WATER && neighborId !== Block.GLASS;
  if (neighborOpaque) return false;
  // neighbor is transparent but self is solid => show face
  return true;
}

export function buildChunkMesh(chunk: Chunk, world: World) {
  const solidPos: number[] = [];
  const solidNorm: number[] = [];
  const solidColor: number[] = [];
  const solidIdx: number[] = [];

  const waterPos: number[] = [];
  const waterNorm: number[] = [];
  const waterColor: number[] = [];
  const waterIdx: number[] = [];

  let vCountSolid = 0;
  let vCountWater = 0;

  // helper to get neighbor block (handles chunk borders)
  function getNeighbor(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return Block.AIR;
    return world.getBlock(wx, wy, wz);
  }

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = chunk.get(x, y, z);
        if (id === Block.AIR) continue;
        const wx = chunk.cx * CHUNK_SIZE + x;
        const wz = chunk.cz * CHUNK_SIZE + z;

        const isWater = id === Block.WATER;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f]!;
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];
          const nid = getNeighbor(nx, ny, nz);

          if (!shouldRenderFace(id, nid)) continue;

          // For water: only render top and sides when neighbor is air; don't render bottom faces when underwater? Keep simple: render all visible water faces
          // but cull bottom faces under water column to reduce geometry? Already culled by neighbor water check.

          const color = colorForBlock(id, f);
          // slightly jitter color for water transparency depth? Keep uniform.

          const targetPos = isWater ? waterPos : solidPos;
          const targetNorm = isWater ? waterNorm : solidNorm;
          const targetColor = isWater ? waterColor : solidColor;
          const targetIdx = isWater ? waterIdx : solidIdx;
          let vCount = isWater ? vCountWater : vCountSolid;

          const baseIdx = vCount;
          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c]!;
            targetPos.push(x + corner[0], y + corner[1], z + corner[2]);
            targetNorm.push(face.normal[0], face.normal[1], face.normal[2]);
            // add slight vertex AO variation for solid blocks: darken bottom vertices?
            targetColor.push(color[0], color[1], color[2]);
          }
          // two triangles
          targetIdx.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);

          if (isWater) vCountWater += 4; else vCountSolid += 4;
        }
      }
    }
  }

  function makeGeom(pos: number[], norm: number[], col: number[], idx: number[]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  const solidGeom = makeGeom(solidPos, solidNorm, solidColor, solidIdx);
  const waterGeom = waterPos.length > 0 ? makeGeom(waterPos, waterNorm, waterColor, waterIdx) : null;

  return { solidGeom, waterGeom };
}
