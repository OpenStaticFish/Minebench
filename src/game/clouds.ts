import * as THREE from "three";
import { hash2 } from "./noise";

export function createClouds(): THREE.Group {
  const group = new THREE.Group();
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.86 });

  // Create several cloud clusters as groups of boxes merged into geometry
  const boxGeo = new THREE.BoxGeometry(1,1,1);

  const count = 28;
  const seed = 424242;

  for (let i=0;i<count;i++) {
    const cx = (hash2(i*2, 0, seed) - 0.5) * 900;
    const cz = (hash2(i*2+1, 0, seed+1) - 0.5) * 900;
    const cy = 68 + hash2(i, 7, seed+2) * 10;

    const cluster = new THREE.Group();
    const blocks = 5 + Math.floor(hash2(i, 13, seed+3)*10); // 5-14
    for (let b=0;b<blocks;b++) {
      const ox = Math.floor((hash2(i*10+b, 0, seed+10)-0.5)*6);
      const oy = Math.floor((hash2(i*10+b, 1, seed+11)-0.5)*1.4);
      const oz = Math.floor((hash2(i*10+b, 2, seed+12)-0.5)*6);
      const sx = 5 + hash2(i*20+b, 3, seed+20)*6;
      const sy = 2.2 + hash2(i*20+b,4,seed+21)*1.2;
      const sz = 4 + hash2(i*20+b,5,seed+22)*5;

      const mesh = new THREE.Mesh(boxGeo, cloudMat);
      mesh.position.set(ox*3.2, oy*1.2, oz*3.2);
      mesh.scale.set(sx, sy, sz);
      mesh.updateMatrix();
      cluster.add(mesh);
    }
    cluster.position.set(cx, cy, cz);
    group.add(cluster);
  }
  // drift
  group.userData = { drift: 0 };
  return group;
}

export function updateClouds(group: THREE.Group, dt: number) {
  group.position.x += dt * 1.2; // slow drift
  if (group.position.x > 400) group.position.x -= 800;
}
