import {
  DailyMissionDefinition,
  DailyMissionsSnapshot,
  DailyMissionState,
  GameTelemetry,
  MissionKind,
} from './types';

export const DAILY_MISSIONS_STORAGE_KEY = 'indian_bike_rider_3d_daily_missions';

const DISTANCE_MISSIONS: DailyMissionDefinition[] = [
  {
    id: 'dist-400',
    kind: 'distance',
    title: 'Highway Sprint',
    description: 'Reach 400 m in one ride',
    target: 400,
    unit: 'm',
    rewardCoins: 450,
  },
  {
    id: 'dist-650',
    kind: 'distance',
    title: 'Long Haul Rider',
    description: 'Reach 650 m in one ride',
    target: 650,
    unit: 'm',
    rewardCoins: 650,
  },
  {
    id: 'dist-900',
    kind: 'distance',
    title: 'Expressway Endurance',
    description: 'Reach 900 m in one ride',
    target: 900,
    unit: 'm',
    rewardCoins: 900,
  },
  {
    id: 'dist-1200',
    kind: 'distance',
    title: 'Grand Trunk Marathon',
    description: 'Reach 1,200 m in one ride',
    target: 1200,
    unit: 'm',
    rewardCoins: 1200,
  },
];

const NEAR_MISS_MISSIONS: DailyMissionDefinition[] = [
  {
    id: 'nm-2',
    kind: 'near_miss',
    title: 'Thread the Needle',
    description: 'Perform 2 near-misses in one ride',
    target: 2,
    unit: 'near-misses',
    rewardCoins: 500,
  },
  {
    id: 'nm-3',
    kind: 'near_miss',
    title: 'Traffic Weaver',
    description: 'Perform 3 near-misses in one ride',
    target: 3,
    unit: 'near-misses',
    rewardCoins: 700,
  },
  {
    id: 'nm-5',
    kind: 'near_miss',
    title: 'Daredevil Overtakes',
    description: 'Perform 5 near-misses in one ride',
    target: 5,
    unit: 'near-misses',
    rewardCoins: 1000,
  },
  {
    id: 'nm-7',
    kind: 'near_miss',
    title: 'Fearless Split',
    description: 'Perform 7 near-misses in one ride',
    target: 7,
    unit: 'near-misses',
    rewardCoins: 1350,
  },
];

const SPEED_SCORE_MISSIONS: DailyMissionDefinition[] = [
  {
    id: 'spd-140',
    kind: 'top_speed',
    title: 'Full Throttle',
    description: 'Hit 140 KM/H in one ride',
    target: 140,
    unit: 'km/h',
    rewardCoins: 450,
  },
  {
    id: 'spd-165',
    kind: 'top_speed',
    title: 'Redline Rush',
    description: 'Hit 165 KM/H in one ride',
    target: 165,
    unit: 'km/h',
    rewardCoins: 650,
  },
  {
    id: 'scr-750',
    kind: 'score',
    title: 'Point Hunter',
    description: 'Score 750 pts in one ride',
    target: 750,
    unit: 'pts',
    rewardCoins: 600,
  },
  {
    id: 'hsd-250',
    kind: 'high_speed_distance',
    title: 'Turbo Cruise',
    description: 'Ride 250 m above 120 KM/H in one ride',
    target: 250,
    unit: 'm',
    rewardCoins: 750,
  },
];

export function getLocalDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTimeUntilDailyReset(now: Date = new Date()): string {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );
  const diffMs = Math.max(0, nextMidnight.getTime() - now.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function hashDateKey(dateKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateDailyMissionsForDate(dateKey: string): DailyMissionsSnapshot {
  const seed = hashDateKey(dateKey);
  const distDef = DISTANCE_MISSIONS[seed % DISTANCE_MISSIONS.length];
  const nmDef = NEAR_MISS_MISSIONS[(seed >>> 3) % NEAR_MISS_MISSIONS.length];
  const spdDef = SPEED_SCORE_MISSIONS[(seed >>> 6) % SPEED_SCORE_MISSIONS.length];

  return {
    dateKey,
    missions: [distDef, nmDef, spdDef].map((definition) => ({
      definition,
      bestProgress: 0,
      completed: false,
      claimed: false,
    })),
  };
}

function isValidMissionState(item: unknown): item is DailyMissionState {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as DailyMissionState;
  const def = candidate.definition;
  if (
    !def ||
    typeof def.id !== 'string' ||
    typeof def.kind !== 'string' ||
    typeof def.title !== 'string' ||
    typeof def.description !== 'string' ||
    typeof def.target !== 'number' ||
    def.target <= 0 ||
    typeof def.unit !== 'string' ||
    typeof def.rewardCoins !== 'number'
  ) {
    return false;
  }
  return (
    typeof candidate.bestProgress === 'number' &&
    typeof candidate.completed === 'boolean' &&
    typeof candidate.claimed === 'boolean'
  );
}

export function saveDailyMissions(snapshot: DailyMissionsSnapshot): void {
  try {
    localStorage.setItem(DAILY_MISSIONS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota / private browsing errors
  }
}

export function loadDailyMissions(now: Date = new Date()): DailyMissionsSnapshot {
  const todayKey = getLocalDateKey(now);
  try {
    const raw = localStorage.getItem(DAILY_MISSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyMissionsSnapshot;
      if (
        parsed &&
        parsed.dateKey === todayKey &&
        Array.isArray(parsed.missions) &&
        parsed.missions.length === 3 &&
        parsed.missions.every(isValidMissionState)
      ) {
        return parsed;
      }
    }
  } catch {
    // Fallback to generating fresh daily missions
  }

  const fresh = generateDailyMissionsForDate(todayKey);
  saveDailyMissions(fresh);
  return fresh;
}

export function getTelemetryMetricForMission(
  kind: MissionKind,
  telemetry: GameTelemetry
): number {
  switch (kind) {
    case 'distance':
      return telemetry.distanceM;
    case 'near_miss':
      return telemetry.nearMisses;
    case 'top_speed':
      return telemetry.peakSpeedKmh;
    case 'score':
      return telemetry.score;
    case 'high_speed_distance':
      return telemetry.highSpeedDistanceM;
  }
}

export function evaluateMissionsWithTelemetry(
  snapshot: DailyMissionsSnapshot,
  telemetry: GameTelemetry,
  now: Date = new Date()
): {
  next: DailyMissionsSnapshot;
  changed: boolean;
  newlyCompleted: DailyMissionState[];
} {
  const todayKey = getLocalDateKey(now);
  const baseSnapshot =
    snapshot.dateKey === todayKey ? snapshot : generateDailyMissionsForDate(todayKey);

  let changed = baseSnapshot !== snapshot;
  const newlyCompleted: DailyMissionState[] = [];

  const nextMissions = baseSnapshot.missions.map((mission) => {
    const rawMetric = getTelemetryMetricForMission(mission.definition.kind, telemetry);
    const clampedMetric = Math.min(
      mission.definition.target,
      Math.max(0, Math.floor(rawMetric))
    );
    const nextBest = Math.max(mission.bestProgress, clampedMetric);
    const isNowComplete = mission.completed || rawMetric >= mission.definition.target;

    if (nextBest !== mission.bestProgress || isNowComplete !== mission.completed) {
      changed = true;
    }

    const updated: DailyMissionState = {
      ...mission,
      bestProgress: isNowComplete ? mission.definition.target : nextBest,
      completed: isNowComplete,
    };

    if (!mission.completed && isNowComplete) {
      newlyCompleted.push(updated);
    }

    return updated;
  });

  const next: DailyMissionsSnapshot = changed
    ? { dateKey: todayKey, missions: nextMissions }
    : baseSnapshot;

  if (changed) {
    saveDailyMissions(next);
  }

  return { next, changed, newlyCompleted };
}

export function claimMissionReward(
  snapshot: DailyMissionsSnapshot,
  missionId: string
): {
  next: DailyMissionsSnapshot;
  rewardEarned: number;
} {
  let rewardEarned = 0;
  const nextMissions = snapshot.missions.map((m) => {
    if (m.definition.id === missionId && m.completed && !m.claimed) {
      rewardEarned = m.definition.rewardCoins;
      return { ...m, claimed: true };
    }
    return m;
  });

  if (rewardEarned === 0) {
    return { next: snapshot, rewardEarned: 0 };
  }

  const next: DailyMissionsSnapshot = {
    ...snapshot,
    missions: nextMissions,
  };
  saveDailyMissions(next);
  return { next, rewardEarned };
}

export function claimAllMissionRewards(snapshot: DailyMissionsSnapshot): {
  next: DailyMissionsSnapshot;
  rewardEarned: number;
} {
  let rewardEarned = 0;
  const nextMissions = snapshot.missions.map((m) => {
    if (m.completed && !m.claimed) {
      rewardEarned += m.definition.rewardCoins;
      return { ...m, claimed: true };
    }
    return m;
  });

  if (rewardEarned === 0) {
    return { next: snapshot, rewardEarned: 0 };
  }

  const next: DailyMissionsSnapshot = {
    ...snapshot,
    missions: nextMissions,
  };
  saveDailyMissions(next);
  return { next, rewardEarned };
}
