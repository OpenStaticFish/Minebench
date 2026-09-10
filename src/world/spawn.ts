import { SEA_LEVEL, CHUNK_HEIGHT } from "../core/constants";
import { World } from "./world";
import { Biome, WorldGenerator } from "./worldgen";

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  biome: Biome;
  /** Normalised horizontal direction from the spawn toward nearby water. */
  waterDir: { x: number; z: number };
  waterDistance: number;
}

interface Sample {
  x: number;
  z: number;
  height: number;
  water: boolean;
}

/**
 * Picks a spawn on a gentle, dry grass column close to (but not inside) water,
 * with a bias toward forests so trees appear in the opening view. Deterministic:
 * the same world always spawns the player at the same scenic spot.
 */
export function findScenicSpawn(generator: WorldGenerator, searchRadius = 140): SpawnPoint {
  const step = 2;
  const samples: Sample[] = [];
  const index = new Map<string, Sample>();
  for (let x = -searchRadius; x <= searchRadius; x += step) {
    for (let z = -searchRadius; z <= searchRadius; z += step) {
      const height = generator.heightAt(x, z);
      const sample: Sample = { x, z, height, water: height < SEA_LEVEL - 0.5 };
      samples.push(sample);
      index.set(`${x},${z}`, sample);
    }
  }

  let best: { sample: Sample; score: number; waterX: number; waterZ: number } | null = null;

  for (const sample of samples) {
    if (sample.water) continue;
    if (sample.height < SEA_LEVEL + 2 || sample.height > SEA_LEVEL + 22) continue;
    const biome = generator.biomeAt(sample.x, sample.z, sample.height);
    if (biome !== Biome.Forest && biome !== Biome.Plains && biome !== Biome.Snowy) continue;
    if (generator.hasTreeNear(sample.x, sample.z, 2)) continue;

    let waterCount = 0;
    let waterX = 0;
    let waterZ = 0;
    let nearestWater = Infinity;
    let neighbourMax = 0;
    let landMin = sample.height;
    let landMax = sample.height;
    for (let dx = -16; dx <= 16; dx += step) {
      for (let dz = -16; dz <= 16; dz += step) {
        const other = index.get(`${sample.x + dx},${sample.z + dz}`);
        if (!other) continue;
        const distance = Math.hypot(dx, dz);
        if (distance <= 4) {
          if (other.water) nearestWater = Math.min(nearestWater, distance);
          neighbourMax = Math.max(neighbourMax, Math.abs(other.height - sample.height));
          continue;
        }
        if (!other.water) {
          landMin = Math.min(landMin, other.height);
          landMax = Math.max(landMax, other.height);
          continue;
        }
        waterCount++;
        waterX += other.x;
        waterZ += other.z;
        nearestWater = Math.min(nearestWater, distance);
      }
    }
    if (waterCount < 3 || nearestWater < 5 || neighbourMax > 3.5) continue;
    const relief = landMax - landMin;

    const cx = waterX / waterCount;
    const cz = waterZ / waterCount;

    let score = 0;
    score += Math.min(waterCount, 16) * 0.8;
    score -= Math.abs(nearestWater - 16) * 0.5;
    score -= neighbourMax * 1.2;
    score += biome === Biome.Forest ? 4 : biome === Biome.Plains ? 2 : 0.5;
    score += generator.hasTreeNear(sample.x, sample.z, 14) ? 3 : -8;
    score += Math.min(12, relief) * 0.9;
    score += Math.min(5, Math.max(0, sample.height - SEA_LEVEL - 2)) * 0.3;
    score -= Math.hypot(sample.x, sample.z) * 0.02;

    if (!best || score > best.score) {
      best = { sample, score, waterX: cx, waterZ: cz };
    }
  }

  const chosen = best?.sample ?? { x: 0, z: 0, height: generator.heightAt(0, 0), water: false };
  const waterX = best?.waterX ?? chosen.x + 8;
  const waterZ = best?.waterZ ?? chosen.z + 8;
  let dirX = waterX - chosen.x;
  let dirZ = waterZ - chosen.z;
  const length = Math.hypot(dirX, dirZ);
  if (length < 0.001) {
    dirX = 0;
    dirZ = -1;
  } else {
    dirX /= length;
    dirZ /= length;
  }

  const yaw = Math.atan2(-dirX, -dirZ);
  const biome = generator.biomeAt(chosen.x, chosen.z, chosen.height);

  return {
    x: chosen.x + 0.5,
    y: chosen.height,
    z: chosen.z + 0.5,
    yaw,
    pitch: -0.12,
    biome,
    waterDir: { x: dirX, z: dirZ },
    waterDistance: length,
  };
}

/**
 * Resolves an exact standing Y for a spawn column against real chunk data.
 * Starts from the noise-derived terrain height (not the tree canopy) so the
 * player never spawns on top of a trunk or inside leaves.
 */
export function resolveSpawnY(world: World, x: number, z: number, fallback: number): number {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const terrainTop = Math.floor(world.generator.heightAt(bx, bz));
  const start = Math.min(CHUNK_HEIGHT - 2, Math.max(terrainTop, Math.ceil(fallback)));
  for (let y = start; y >= 1; y--) {
    if (world.isSolidAt(bx, y, bz)) return y + 1;
  }
  return Math.max(1, fallback + 1);
}
