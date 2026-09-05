import * as THREE from "three";
import { Block, hash } from "./terrain";

export function makeMaterials() {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  const palette = [
    "#81a751",
    "#947051",
    "#969e95",
    "#dcc992",
    "#806044",
    "#51834b",
    "#529d9a",
    "#e3ece3",
    "#b99865",
    "#947051",
  ];
  palette.forEach((base, tile) => {
    ctx.fillStyle = base;
    ctx.fillRect(tile * 16, 0, 16, 16);
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 16; y++) {
        const value = hash(x + tile * 19, y, 101);
        ctx.fillStyle =
          value > 0.5
            ? `rgba(255,255,230,${(value - 0.5) * 0.18})`
            : `rgba(25,40,28,${(0.5 - value) * 0.21})`;
        ctx.fillRect(tile * 16 + x, y, 1, 1);
        if (tile === 4 && (x % 5 === 0 || (x % 5 === 1 && value > 0.7))) {
          ctx.fillStyle = "#634e3b";
          ctx.fillRect(tile * 16 + x, y, 1, 1);
        }
        if (tile === 8 && y % 5 === 0) {
          ctx.fillStyle = "#94744f";
          ctx.fillRect(tile * 16 + x, y, 1, 1);
        }
        if (tile === 9 && y < 3 + Math.floor(hash(x, 0) * 3)) {
          ctx.fillStyle = y < 2 ? "#81a751" : "#718d47";
          ctx.fillRect(tile * 16 + x, y, 1, 1);
        }
      }
  });
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestMipmapLinearFilter;
  atlas.colorSpace = THREE.SRGBColorSpace;
  const land = new THREE.MeshLambertMaterial({
    map: atlas,
    vertexColors: true,
  });
  const water = new THREE.MeshPhongMaterial({
    color: 0x258d8c,
    transparent: true,
    opacity: 0.82,
    shininess: 95,
    specular: 0xcbe7c3,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return { land, water };
}
export function tileFor(block: Block, ny: number): number {
  if (block === Block.Grass) return ny > 0 ? 0 : ny < 0 ? 1 : 9;
  return block === Block.Planks ? 8 : block - 1;
}
