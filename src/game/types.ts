export type GameState = 'menu' | 'showroom' | 'playing' | 'paused' | 'gameover';

export type BikeId =
  | 'street-beast'
  | 'speed-x'
  | 'ninja-pro'
  | 'phantom-rr'
  | 'ducati-fury';

export interface BikeSpec {
  id: BikeId;
  name: string;
  price: number;
  tagline: string;
  topSpeedKmh: number;
  accelerationStat: number;
  handlingStat: number;
  accelMultiplier: number;
  handlingMultiplier: number;
  accentHex: string;
}

export interface InputState {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}

export interface GameTelemetry {
  speedKmh: number;
  peakSpeedKmh: number;
  distanceM: number;
  highSpeedDistanceM: number;
  score: number;
  bestScore: number;
  coins: number;
  runCoinsEarned: number;
  difficultyLevel: number;
  nearMisses: number;
  isNewBest: boolean;
  gear: number;
}

export type MissionKind =
  | 'distance'
  | 'near_miss'
  | 'top_speed'
  | 'score'
  | 'high_speed_distance';

export interface DailyMissionDefinition {
  id: string;
  kind: MissionKind;
  title: string;
  description: string;
  target: number;
  unit: string;
  rewardCoins: number;
}

export interface DailyMissionState {
  definition: DailyMissionDefinition;
  bestProgress: number;
  completed: boolean;
  claimed: boolean;
}

export interface DailyMissionsSnapshot {
  dateKey: string;
  missions: DailyMissionState[];
}
