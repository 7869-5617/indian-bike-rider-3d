export type GameState = 'menu' | 'showroom' | 'playing' | 'paused' | 'gameover';

export type WeatherMode = 'sunny' | 'rain' | 'fog';

export type BikeId = 'ninja-zx6r' | 'ducati-sf-v4';

export interface BikeSpec {
  id: BikeId;
  name: string;
  category: string;
  modelUrl: string;
  price: number;
  tagline: string;
  topSpeedKmh: number;
  accelerationStat: number;
  handlingStat: number;
  accelMultiplier: number;
  handlingMultiplier: number;
  hasNitro: boolean;
  accentHex: string;
}

export interface InputState {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  wheelie: boolean;
  nitro: boolean;
}

export interface GameTelemetry {
  speedKmh: number;
  peakSpeedKmh: number;
  maxBikeSpeedKmh: number;
  distanceM: number;
  highSpeedDistanceM: number;
  score: number;
  stuntScore: number;
  bestScore: number;
  coins: number;
  runCoinsEarned: number;
  coinsCollectedInRun: number;
  difficultyLevel: number;
  nearMisses: number;
  flipsInRun: number;
  wheelieActive: boolean;
  isAirborne: boolean;
  nitroLevel: number;
  nitroActive: boolean;
  hasNitro: boolean;
  stuntCallout: string | null;
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
