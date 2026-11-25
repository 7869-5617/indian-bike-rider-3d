import { TrafficKind } from './models';

export interface WeightedTrafficOption {
  kind: TrafficKind;
  weight: number;
  minSpeedKmh: number;
  maxSpeedKmh: number;
}

export interface DynamicTrafficProfile {
  speedFactor: number;
  distanceFactor: number;
  intensity: number;
  spawnIntervalSec: number;
  spawnRateMultiplier: number;
  maxActiveEntities: number;
  oncomingMinGap: number;
  sameDirMinGap: number;
  doubleSpawnChance: number;
  obstacleChanceOncoming: number;
  obstacleChanceSameDir: number;
  speedBoostKmh: number;
  unlockedKinds: TrafficKind[];
  oncomingPool: WeightedTrafficOption[];
  sameDirPool: WeightedTrafficOption[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Dynamically computes traffic spawn rate, highway density, and vehicle variety
 * based on the player's current speed (KM/H) and total distance traveled (meters).
 */
export function computeDynamicTrafficProfile(
  speedKmh: number,
  distanceM: number
): DynamicTrafficProfile {
  const safeSpeed = Math.max(0, Number.isFinite(speedKmh) ? speedKmh : 0);
  const safeDist = Math.max(0, Number.isFinite(distanceM) ? distanceM : 0);

  const speedFactor = clamp(safeSpeed / 260, 0, 1.1);
  const distanceFactor = clamp(safeDist / 1800, 0, 1);
  const extraDistFactor = clamp((safeDist - 1800) / 3000, 0, 0.35);

  const intensity = clamp(
    distanceFactor * 0.58 + clamp(speedFactor, 0, 1) * 0.42 + extraDistFactor * 0.15,
    0,
    1
  );

  // Spawn timer speeds up and cooldown shrinks as speed + distance rise
  const spawnIntervalSec = clamp(
    lerp(1.32, 0.42, intensity) - Math.max(0, speedFactor - 0.85) * 0.12,
    0.34,
    1.35
  );
  const spawnRateMultiplier = clamp(
    0.72 + speedFactor * 1.45 + distanceFactor * 0.65,
    0.72,
    2.9
  );

  // Active traffic cap and spacing scale smoothly while keeping escape lanes open
  const maxActiveEntities = Math.round(lerp(9, 22, intensity));
  const oncomingMinGap = lerp(54, 38, intensity);
  const sameDirMinGap = lerp(32, 22, intensity);
  const doubleSpawnChance = clamp((intensity - 0.22) * 0.65, 0, 0.48);

  const obstacleChanceOncoming = clamp(lerp(0.06, 0.13, intensity), 0.06, 0.14);
  const obstacleChanceSameDir = clamp(lerp(0.12, 0.25, intensity), 0.12, 0.26);
  const speedBoostKmh = lerp(0, 22, clamp(distanceFactor * 0.7 + speedFactor * 0.3, 0, 1));

  // Progressive vehicle variety unlocked dynamically by speed and distance
  const unlockTaxisAndSuvs = safeDist >= 150 || safeSpeed >= 95;
  const unlockBuses = safeDist >= 420 || safeSpeed >= 145;
  const unlockSportsCars = safeDist >= 750 || safeSpeed >= 185;

  const unlockedKinds: TrafficKind[] = ['car', 'auto', 'bike', 'truck'];
  if (unlockTaxisAndSuvs) {
    unlockedKinds.push('taxi', 'suv');
  }
  if (unlockBuses) {
    unlockedKinds.push('bus');
  }
  if (unlockSportsCars) {
    unlockedKinds.push('sportscar');
  }

  const oncomingPool: WeightedTrafficOption[] = [
    { kind: 'car', weight: lerp(42, 24, intensity), minSpeedKmh: 54, maxSpeedKmh: 76 },
    { kind: 'truck', weight: lerp(30, 18, intensity), minSpeedKmh: 42, maxSpeedKmh: 58 },
    { kind: 'auto', weight: lerp(28, 14, intensity), minSpeedKmh: 36, maxSpeedKmh: 48 },
  ];

  const sameDirPool: WeightedTrafficOption[] = [
    { kind: 'car', weight: lerp(44, 24, intensity), minSpeedKmh: 66, maxSpeedKmh: 92 },
    { kind: 'bike', weight: lerp(28, 18, intensity), minSpeedKmh: 62, maxSpeedKmh: 90 },
    { kind: 'auto', weight: lerp(16, 10, intensity), minSpeedKmh: 44, maxSpeedKmh: 58 },
    { kind: 'truck', weight: lerp(12, 10, intensity), minSpeedKmh: 48, maxSpeedKmh: 62 },
  ];

  if (unlockTaxisAndSuvs) {
    oncomingPool.push(
      { kind: 'taxi', weight: lerp(14, 16, intensity), minSpeedKmh: 52, maxSpeedKmh: 72 },
      { kind: 'suv', weight: lerp(14, 18, intensity), minSpeedKmh: 62, maxSpeedKmh: 86 }
    );
    sameDirPool.push(
      { kind: 'taxi', weight: lerp(14, 16, intensity), minSpeedKmh: 60, maxSpeedKmh: 82 },
      { kind: 'suv', weight: lerp(16, 18, intensity), minSpeedKmh: 74, maxSpeedKmh: 102 }
    );
  }

  if (unlockBuses) {
    oncomingPool.push({
      kind: 'bus',
      weight: lerp(10, 15, intensity),
      minSpeedKmh: 46,
      maxSpeedKmh: 64,
    });
    sameDirPool.push({
      kind: 'bus',
      weight: lerp(10, 14, intensity),
      minSpeedKmh: 52,
      maxSpeedKmh: 72,
    });
  }

  if (unlockSportsCars) {
    oncomingPool.push({
      kind: 'sportscar',
      weight: lerp(8, 14, intensity),
      minSpeedKmh: 76,
      maxSpeedKmh: 104,
    });
    sameDirPool.push({
      kind: 'sportscar',
      weight: lerp(12, 18, intensity),
      minSpeedKmh: 92,
      maxSpeedKmh: 128,
    });
  }

  return {
    speedFactor,
    distanceFactor,
    intensity,
    spawnIntervalSec,
    spawnRateMultiplier,
    maxActiveEntities,
    oncomingMinGap,
    sameDirMinGap,
    doubleSpawnChance,
    obstacleChanceOncoming,
    obstacleChanceSameDir,
    speedBoostKmh,
    unlockedKinds,
    oncomingPool,
    sameDirPool,
  };
}

export function pickWeightedTrafficVehicle(
  pool: WeightedTrafficOption[],
  speedBoostKmh: number,
  rng: () => number = Math.random
): { kind: TrafficKind; speedKmh: number } {
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * totalWeight;
  let chosen = pool[0];
  for (const option of pool) {
    roll -= option.weight;
    if (roll <= 0) {
      chosen = option;
      break;
    }
  }
  const speedKmh =
    chosen.minSpeedKmh + rng() * (chosen.maxSpeedKmh - chosen.minSpeedKmh) + speedBoostKmh;
  return { kind: chosen.kind, speedKmh };
}
