import { makeOpponentCar, overtakeAward } from './cars';
import { buildRoadSegments, getTrackInfo } from './track';
import type { FloatingText, GameConfig, GameEvent, GameEventType, GameState, GameStats, InputState, OpponentCar } from './types';

const CONFIG: GameConfig = {
  duration: 90,
  baseMaxSpeed: 268,
  nitroMaxSpeed: 340,
  acceleration: 92,
  braking: 148,
  drag: 32,
  offRoadPenalty: 116,
  collisionPenalty: 92,
  maxCrashes: 5,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * clamp(amount, 0, 1);
}

function makeInitialState(mode: GameState['mode']): GameState {
  return {
    mode,
    racePhase: 'grid',
    startCountdown: mode === 'running' ? 3.2 : 0,
    sceneTime: 0,
    elapsed: 0,
    timeLeft: CONFIG.duration,
    speed: 0,
    maxSpeed: CONFIG.baseMaxSpeed,
    maxSpeedSeen: 0,
    distance: 0,
    visualDistance: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    comboTimer: 0,
    overtakes: 0,
    crashes: 0,
    playerX: 0,
    playerTilt: 0,
    collisionFlash: 0,
    shake: 0,
    nitroEnergy: 35,
    nitroActive: false,
    slipstream: 0,
    roadSegments: buildRoadSegments(0),
    traffic: [],
    floatingTexts: [],
    currentCurve: 0,
    innerBonusTimer: 0,
    draftActive: false,
    lastAward: '',
    stats: null,
  };
}

function ratingForScore(score: number) {
  if (score >= 18000) return 'SS';
  if (score >= 13000) return 'S';
  if (score >= 8500) return 'A';
  if (score >= 4800) return 'B';
  return 'C';
}

export class GameEngine {
  private state: GameState = makeInitialState('ready');
  private seed = 0x5eed1234;
  private spawnTimer = 0.4;
  private nextCarId = 1;
  private nextTextId = 1;
  private nextEventId = 1;
  private events: GameEvent[] = [];
  private nitroReadyAnnounced = false;
  private wasDraftActive = false;
  private countdownMark = 4;

  getState() {
    return this.state;
  }

  consumeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  start() {
    this.seed = (Date.now() ^ 0xadc83b19) >>> 0;
    this.spawnTimer = 0.35;
    this.nextCarId = 1;
    this.nextTextId = 1;
    this.nextEventId = 1;
    this.events = [];
    this.nitroReadyAnnounced = false;
    this.wasDraftActive = false;
    this.countdownMark = 4;
    this.state = makeInitialState('running');
    this.state.traffic = this.makeStartingGrid();
  }

  resetToReady() {
    this.state = makeInitialState('ready');
    this.events = [];
  }

  update(dt: number, input: InputState) {
    const step = Math.min(dt, 1 / 30);
    this.state.sceneTime += step;

    if (this.state.mode === 'ready') {
      this.updateAttractMode(step);
      return;
    }

    if (this.state.mode === 'ended') {
      this.updateEffects(step);
      return;
    }

    this.updateRunning(step, input);
  }

  private updateAttractMode(dt: number) {
    this.state.visualDistance += 34 * dt;
    this.state.currentCurve = getTrackInfo(this.state.visualDistance).curve;
    this.state.roadSegments = buildRoadSegments(this.state.visualDistance);
  }

  private updateRunning(dt: number, input: InputState) {
    const state = this.state;

    if (state.racePhase === 'grid') {
      this.updateStartingGrid(dt);
      this.updateEffects(dt);
      state.roadSegments = buildRoadSegments(0);
      return;
    }

    state.elapsed += dt;
    state.timeLeft = Math.max(0, CONFIG.duration - state.elapsed);

    const track = getTrackInfo(state.distance);
    state.currentCurve = track.curve;
    state.maxSpeed = state.nitroActive ? CONFIG.nitroMaxSpeed : CONFIG.baseMaxSpeed;

    this.updateNitro(dt, input);
    this.updatePlayer(dt, input, track.innerSide);
    this.updateTraffic(dt);
    this.updateSlipstream(dt);
    this.updateScoring(dt, track.innerSide);
    this.updateEffects(dt);
    this.updateMilestones();

    state.maxSpeedSeen = Math.max(state.maxSpeedSeen, state.speed);
    const metersThisFrame = (state.speed * 1000) / 3600 * dt;
    state.distance += metersThisFrame;
    state.visualDistance = state.distance;
    state.roadSegments = buildRoadSegments(state.visualDistance);

    if (state.combo > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.lastAward = '';
      }
    }

    if (state.timeLeft <= 0) {
      this.endGame();
    }
  }

  private updateNitro(dt: number, input: InputState) {
    const state = this.state;
    const wasActive = state.nitroActive;
    state.nitroActive = input.nitro && state.nitroEnergy > 0 && state.speed > 35;
    state.maxSpeed = state.nitroActive ? CONFIG.nitroMaxSpeed : CONFIG.baseMaxSpeed;

    if (state.nitroActive && !wasActive) {
      this.queueEvent('nitro-start');
    }

    if (state.nitroActive) {
      state.nitroEnergy = Math.max(0, state.nitroEnergy - 31 * dt);
      state.speed += CONFIG.acceleration * 0.65 * dt;

      if (state.nitroEnergy <= 0) {
        state.nitroActive = false;
        this.queueEvent('nitro-empty');
      }
    }
  }

  private updatePlayer(dt: number, input: InputState, innerSide: -1 | 0 | 1) {
    const state = this.state;
    const steering = Number(input.right) - Number(input.left);
    const speedRatio = clamp(state.speed / CONFIG.baseMaxSpeed, 0, 1.35);
    const offRoad = Math.abs(state.playerX) > 0.98;

    if (input.accelerate || state.nitroActive) {
      state.speed += CONFIG.acceleration * (state.nitroActive ? 1.15 : 1) * dt;
    } else {
      state.speed -= CONFIG.drag * dt;
    }

    if (input.brake) {
      state.speed -= CONFIG.braking * dt;
    }

    if (offRoad) {
      state.speed -= CONFIG.offRoadPenalty * dt;
      state.shake = Math.max(state.shake, 0.24);
    }

    if (
      innerSide !== 0 &&
      Math.sign(state.playerX) === innerSide &&
      Math.abs(state.playerX) > 0.34 &&
      Math.abs(state.playerX) < 0.9 &&
      state.speed > 108
    ) {
      state.speed += 13 * dt;
      state.innerBonusTimer = 0.22;
      state.score += 20 * dt;
    }

    const curveDrift = -state.currentCurve * speedRatio * 0.26;
    state.playerX = clamp(state.playerX + (steering * (0.86 + speedRatio * 0.64) + curveDrift) * dt, -1.34, 1.34);
    state.playerTilt = lerp(state.playerTilt, steering * 1.1 - state.currentCurve * 0.42, dt * 8.5);
    state.speed = clamp(state.speed, 0, state.maxSpeed);
  }

  private updateTraffic(dt: number) {
    const state = this.state;
    this.spawnTimer -= dt;

    if (this.spawnTimer <= 0 && state.traffic.length < 9) {
      state.traffic.push(makeOpponentCar(this.nextCarId, () => this.random()));
      this.nextCarId += 1;
      const speedFactor = clamp(state.speed / CONFIG.baseMaxSpeed, 0, 1);
      this.spawnTimer = 0.8 + this.random() * 1.1 - speedFactor * 0.26;
    }

    const remaining: OpponentCar[] = [];

    for (const car of state.traffic) {
      const relativeSpeed = state.speed * 1.65 - car.cruiseSpeed * 0.75;
      car.z -= relativeSpeed * dt;
      car.lane = clamp(car.lane + Math.sin(state.sceneTime * 0.8 + car.id) * 0.012 * dt, -0.72, 0.72);

      const lateralGap = Math.abs(state.playerX - car.lane);
      const collisionWindow = car.z > 205 && car.z < 384;
      const collisionThreshold = 0.19 + car.width * 0.085;

      if (collisionWindow && lateralGap < collisionThreshold) {
        this.handleCollision(car);
        continue;
      }

      if (!car.passed && car.z < 155) {
        this.handleOvertake(car, lateralGap);
        car.passed = true;
      }

      if (car.z > -180 && car.z < 3600) {
        remaining.push(car);
      }
    }

    state.traffic = remaining;
  }

  private updateSlipstream(dt: number) {
    const state = this.state;
    let draftActive = false;

    for (const car of state.traffic) {
      const inDraftDistance = car.z > 420 && car.z < 1000;
      const centered = Math.abs(state.playerX - car.lane) < 0.17;

      if (inDraftDistance && centered && state.speed > 90) {
        draftActive = true;
        break;
      }
    }

    state.draftActive = draftActive;

    if (draftActive) {
      state.slipstream = Math.min(100, state.slipstream + 36 * dt);
      state.speed = Math.min(state.maxSpeed, state.speed + 6.5 * dt);
      if (!this.wasDraftActive) {
        this.queueEvent('drafting');
      }
    } else {
      state.slipstream = Math.max(0, state.slipstream - 22 * dt);
    }

    this.wasDraftActive = draftActive;

    if (state.slipstream >= 100) {
      state.slipstream = 0;
      state.nitroEnergy = Math.min(100, state.nitroEnergy + 34);
      this.addFloatingText('Draft -> Nitro', 0, 0.45, '#69f4ff');
      this.queueEvent('draft-nitro');
    }
  }

  private updateScoring(dt: number, innerSide: -1 | 0 | 1) {
    const state = this.state;
    const speedScore = state.speed > 185 ? (state.speed - 165) * 0.18 * dt : 0;
    const distanceScore = state.speed * 0.105 * dt;
    state.score += distanceScore + speedScore;

    if (state.nitroActive) {
      state.score += 13 * dt;
    }

    if (innerSide !== 0 && state.innerBonusTimer > 0) {
      state.score += 9 * dt;
    }
  }

  private updateStartingGrid(dt: number) {
    const state = this.state;
    state.speed = 0;
    state.maxSpeedSeen = 0;
    state.distance = 0;
    state.visualDistance = 0;
    state.startCountdown = Math.max(0, state.startCountdown - dt);
    state.playerTilt = lerp(state.playerTilt, 0, dt * 8);

    for (const car of state.traffic) {
      car.lane = clamp(car.lane + Math.sin(state.sceneTime * 5 + car.id) * 0.002, -0.72, 0.72);
    }

    const mark = Math.ceil(state.startCountdown);
    if (mark > 0 && mark < this.countdownMark) {
      this.countdownMark = mark;
      this.queueEvent('countdown-beep', mark);
    }

    if (state.startCountdown <= 0) {
      state.racePhase = 'racing';
      state.speed = 44;
      state.startCountdown = 0;
      this.spawnTimer = 2.1;
      this.queueEvent('race-start');
      this.addFloatingText('GO', 0, 0.48, '#ffef5c');
    }
  }

  private updateEffects(dt: number) {
    const state = this.state;
    state.collisionFlash = Math.max(0, state.collisionFlash - dt * 2.7);
    state.shake = Math.max(0, state.shake - dt * 2.8);
    state.innerBonusTimer = Math.max(0, state.innerBonusTimer - dt);
    state.floatingTexts = state.floatingTexts
      .map((text) => ({
        ...text,
        age: text.age + dt,
        y: text.y - dt * 0.12,
      }))
      .filter((text) => text.age < text.ttl);
  }

  private handleOvertake(car: OpponentCar, lateralGap: number) {
    const state = this.state;
    const award = overtakeAward(lateralGap);
    const comboMultiplier = 1 + Math.min(state.combo, 12) * 0.15;
    const points = Math.round(award.points * comboMultiplier);

    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.comboTimer = 3.1;
    state.overtakes += 1;
    state.score += points;
    state.lastAward = award.label;
    state.nitroEnergy = Math.min(100, state.nitroEnergy + (award.points >= 800 ? 8 : 3));

    this.addFloatingText(`+${points}`, car.lane, 0.62, award.color);

    if (award.points >= 800) {
      this.queueEvent('extreme-overtake', points);
    } else if (award.points >= 300) {
      this.queueEvent('close-overtake', points);
    } else {
      this.queueEvent('overtake', points);
    }
  }

  private handleCollision(_car: OpponentCar) {
    const state = this.state;
    state.speed = Math.max(38, state.speed - CONFIG.collisionPenalty);
    state.score = Math.max(0, state.score - 250);
    state.combo = 0;
    state.comboTimer = 0;
    state.crashes += 1;
    state.collisionFlash = 0.55;
    state.shake = 1;
    state.lastAward = 'Crash';

    this.addFloatingText('CRASH', state.playerX, 0.68, '#ff6868');
    this.queueEvent('crash');

    if (state.crashes >= CONFIG.maxCrashes) {
      this.endGame();
    }
  }

  private endGame() {
    if (this.state.mode === 'ended') {
      return;
    }

    this.state.mode = 'ended';
    this.state.nitroActive = false;
    this.state.speed = 0;
    this.state.stats = this.makeStats();
    this.queueEvent('finish', this.state.stats.score);
  }

  private updateMilestones() {
    const state = this.state;
    if (state.nitroEnergy >= 100 && !this.nitroReadyAnnounced) {
      this.queueEvent('nitro-ready');
      this.nitroReadyAnnounced = true;
    }

    if (state.nitroEnergy < 92) {
      this.nitroReadyAnnounced = false;
    }
  }

  private makeStats(): GameStats {
    const score = Math.round(this.state.score);

    return {
      score,
      distance: Math.round(this.state.distance),
      maxSpeed: Math.round(this.state.maxSpeedSeen),
      overtakes: this.state.overtakes,
      maxCombo: this.state.maxCombo,
      rating: ratingForScore(score),
    };
  }

  private addFloatingText(text: string, laneX: number, y: number, color: string) {
    const item: FloatingText = {
      id: this.nextTextId,
      text,
      x: clamp(laneX, -0.95, 0.95),
      y,
      age: 0,
      ttl: 1.1,
      color,
    };

    this.nextTextId += 1;
    this.state.floatingTexts.push(item);
  }

  private makeStartingGrid(): OpponentCar[] {
    const grid = [
      { lane: -0.48, z: 540, color: '#14a6d9', accent: '#d9fbff', speed: 138 },
      { lane: 0.48, z: 610, color: '#f7b731', accent: '#fff5c2', speed: 132 },
      { lane: -0.18, z: 780, color: '#7c5cff', accent: '#e4ddff', speed: 146 },
      { lane: 0.24, z: 930, color: '#06d6a0', accent: '#e9fff6', speed: 142 },
      { lane: -0.66, z: 1120, color: '#ff8c42', accent: '#fff0cf', speed: 136 },
      { lane: 0.66, z: 1260, color: '#ef476f', accent: '#ffe1ef', speed: 140 },
    ];

    return grid.map((car) => {
      const opponent: OpponentCar = {
        id: this.nextCarId,
        z: car.z,
        lane: car.lane,
        width: 0.98,
        cruiseSpeed: car.speed,
        color: car.color,
        accent: car.accent,
        passed: false,
      };

      this.nextCarId += 1;
      return opponent;
    });
  }

  private queueEvent(type: GameEventType, value?: number) {
    this.events.push({
      id: this.nextEventId,
      type,
      value,
    });
    this.nextEventId += 1;
  }

  private random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }
}
