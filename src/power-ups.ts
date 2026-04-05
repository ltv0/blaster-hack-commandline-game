import type { GameState } from './game.ts';

export type PowerUpType =
  | 'shield'
  | 'doublePoints'
  | 'slowMotion'
  | 'healthBoost'
  | 'hazardClear'
  | 'findBoost';

export interface PowerUpPickup {
  id: number;
  x: number;
  y: number;
  baseY: number;
  type: PowerUpType;
  age: number;
  ttl: number;
  phase: number;
}

export interface PowerUpRuntime {
  clearHazards: (state: GameState) => void;
  restoreHealth: (state: GameState) => void;
  scoreWithModifiers: (state: GameState, basePoints: number) => number;
  spawnScorePopup: (state: GameState, x: number, y: number, points: number, combo: number) => void;
}

const POWER_UP_THRESHOLD = 40;
const POWER_UP_PICKUP_TTL = 12;

const POWER_UP_WEIGHTS: Array<{ type: PowerUpType; weight: number }> = [
  { type: 'shield', weight: 16 },
  { type: 'doublePoints', weight: 16 },
  { type: 'slowMotion', weight: 14 },
  { type: 'healthBoost', weight: 12 },
  { type: 'hazardClear', weight: 11 },
  { type: 'findBoost', weight: 9 },
];

const POWER_UP_TEXT: Record<PowerUpType, string> = {
  shield: 'SHIELD',
  doublePoints: '*2X POINTS*',
  slowMotion: 'SNAIL...',
  healthBoost: '+HEALTH+',
  hazardClear: '!CLEAR!',
  findBoost: 'FIND',
};

export function powerUpLabel(type: PowerUpType): string {
  return POWER_UP_TEXT[type];
}

function powerUpDuration(type: PowerUpType): number {
  switch (type) {
    case 'shield': return 5;
    case 'doublePoints': return 10;
    case 'slowMotion': return 8;
    case 'findBoost': return 6;
    case 'healthBoost': return 1.3;
    case 'hazardClear': return 1.1;
    default: return 1.2;
  }
}

function chooseRandomPowerUp(): PowerUpType {
  const total = POWER_UP_WEIGHTS.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of POWER_UP_WEIGHTS) {
    roll -= item.weight;
    if (roll <= 0) return item.type;
  }
  return POWER_UP_WEIGHTS[POWER_UP_WEIGHTS.length - 1]!.type;
}

function resetTimedPowerUps(state: GameState): void {
  state.shieldActive = false;
  state.doublePointsActive = false;
  state.slowMotionActive = false;
  state.findBoostActive = false;
}

export function activatePowerUp(state: GameState, type: PowerUpType, runtime: PowerUpRuntime): void {
  resetTimedPowerUps(state);
  state.activePowerUp = type;
  state.powerUpTimer = powerUpDuration(type);
  state.powerUpText = powerUpLabel(type);
  state.powerUpTextTimer = Math.max(1.3, state.powerUpTimer);
  state.powerUpFlashTimer = Math.max(state.powerUpFlashTimer, 0.28);

  switch (type) {
    case 'shield':
      state.shieldActive = true;
      break;
    case 'doublePoints':
      state.doublePointsActive = true;
      break;
    case 'slowMotion':
      state.slowMotionActive = true;
      break;
    case 'findBoost':
      state.findBoostActive = true;
      break;
    case 'healthBoost':
      runtime.restoreHealth(state);
      break;
    case 'hazardClear':
      runtime.clearHazards(state);
      break;
  }

  state.audioEvents.push({ kind: 'powerup' });
}

export function maybeSpawnComboPowerUp(state: GameState): void {
  if (state.combo < POWER_UP_THRESHOLD) return;

  const type = chooseRandomPowerUp();
  const margin = Math.max(40, Math.min(120, state.W * 0.12));
  const x = margin + Math.random() * Math.max(1, state.W - margin * 2);
  const y = state.travelerBaseY - (8 + Math.random() * 16);

  state.powerUpPickups.push({
    id: state.powerUpPickupIdCounter++,
    x,
    y,
    baseY: y,
    type,
    age: 0,
    ttl: POWER_UP_PICKUP_TTL,
    phase: Math.random() * Math.PI * 2,
  });

  state.combo = 0;
  state.comboTimer = 0;
  state.powerUpText = powerUpLabel(type);
  state.powerUpTextTimer = 1.0;
}

export function updatePowerUpPickups(state: GameState, dt: number, runtime: PowerUpRuntime): void {
  for (let i = state.powerUpPickups.length - 1; i >= 0; i--) {
    const pickup = state.powerUpPickups[i];
    if (!pickup || typeof pickup.age !== 'number') {
      state.powerUpPickups.splice(i, 1);
      if (typeof console !== 'undefined') {
        console.warn('[WARN] Removed invalid or undefined powerUpPickup at index', i, pickup);
      }
      continue;
    }

    pickup.age += dt;
    pickup.phase += dt * 3.2;
    pickup.y = pickup.baseY + Math.sin(pickup.phase) * 8;

    if (state.findBoostActive) {
      const dx = state.travelerX - pickup.x;
      const dy = (state.travelerY + 8) - pickup.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        const pull = Math.min(280 * dt, d);
        pickup.x += (dx / d) * pull;
        pickup.y += (dy / d) * pull;
        pickup.baseY = pickup.y;
      }
    }

    if (pickup.age >= pickup.ttl) {
      state.powerUpPickups.splice(i, 1);
      continue;
    }

    const dx = Math.abs(pickup.x - state.travelerX);
    const dy = Math.abs(pickup.y - (state.travelerY + 12));
    if (dx < 40 && dy < 42) {
      state.powerUpPickups.splice(i, 1);
      activatePowerUp(state, pickup.type, runtime);

      const basePowerUpPoints = 200;
      const difficultyMultiplier = 1 + (state.difficultyLevel * 2);
      const powerUpPoints = Math.round(basePowerUpPoints * difficultyMultiplier);
      state.score += runtime.scoreWithModifiers(state, powerUpPoints);
      runtime.spawnScorePopup(state, pickup.x, pickup.y - 20, powerUpPoints, 1);
    }
  }
}

export function updatePowerUpTimers(state: GameState, dt: number): void {
  if (state.powerUpTimer > 0) {
    state.powerUpTimer = Math.max(0, state.powerUpTimer - dt);
    if (state.powerUpTimer <= 0) {
      resetTimedPowerUps(state);
      state.activePowerUp = null;
    }
  }

  if (state.powerUpTextTimer > 0) {
    state.powerUpTextTimer = Math.max(0, state.powerUpTextTimer - dt);
    if (state.powerUpTextTimer <= 0 && state.powerUpTimer <= 0) {
      state.powerUpText = '';
    }
  }

  if (state.powerUpFlashTimer > 0) {
    state.powerUpFlashTimer = Math.max(0, state.powerUpFlashTimer - dt);
  }
}
