export type GameMode = 'ready' | 'running' | 'ended';
export type RacePhase = 'grid' | 'racing';

export type ControlKey = 'left' | 'right' | 'accelerate' | 'brake' | 'nitro';

export interface InputState {
  left: boolean;
  right: boolean;
  accelerate: boolean;
  brake: boolean;
  nitro: boolean;
}

export interface RoadSegment {
  z: number;
  curve: number;
  width: number;
  color: {
    road: string;
    shoulder: string;
    lane: string;
    verge: string;
  };
  stripe: boolean;
}

export interface TrackInfo {
  curve: number;
  innerSide: -1 | 0 | 1;
  label: 'straight' | 'left' | 'right';
}

export interface OpponentCar {
  id: number;
  z: number;
  lane: number;
  width: number;
  cruiseSpeed: number;
  color: string;
  accent: string;
  passed: boolean;
}

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  age: number;
  ttl: number;
  color: string;
}

export type GameEventType =
  | 'countdown-beep'
  | 'race-start'
  | 'drafting'
  | 'draft-nitro'
  | 'nitro-ready'
  | 'nitro-start'
  | 'nitro-empty'
  | 'overtake'
  | 'close-overtake'
  | 'extreme-overtake'
  | 'crash'
  | 'finish';

export interface GameEvent {
  id: number;
  type: GameEventType;
  message?: string;
  value?: number;
}

export interface GameStats {
  score: number;
  distance: number;
  maxSpeed: number;
  overtakes: number;
  maxCombo: number;
  rating: string;
}

export interface GameConfig {
  duration: number;
  baseMaxSpeed: number;
  nitroMaxSpeed: number;
  acceleration: number;
  braking: number;
  drag: number;
  offRoadPenalty: number;
  collisionPenalty: number;
  maxCrashes: number;
}

export interface GameState {
  mode: GameMode;
  racePhase: RacePhase;
  startCountdown: number;
  sceneTime: number;
  elapsed: number;
  timeLeft: number;
  speed: number;
  maxSpeed: number;
  maxSpeedSeen: number;
  distance: number;
  visualDistance: number;
  score: number;
  combo: number;
  maxCombo: number;
  comboTimer: number;
  overtakes: number;
  crashes: number;
  playerX: number;
  playerTilt: number;
  collisionFlash: number;
  shake: number;
  nitroEnergy: number;
  nitroActive: boolean;
  slipstream: number;
  roadSegments: RoadSegment[];
  traffic: OpponentCar[];
  floatingTexts: FloatingText[];
  currentCurve: number;
  innerBonusTimer: number;
  draftActive: boolean;
  lastAward: string;
  stats: GameStats | null;
}
