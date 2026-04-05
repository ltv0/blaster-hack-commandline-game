import type { GameState } from './game.ts';

export type PowerUpType =
  | 'cd'
  | 'rm'
  | 'zip'
  | 'unzip'
  | 'sudo'
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
  update?: (dt: number) => void;
}

export interface PowerUpRuntime {
  clearHazards: (state: GameState) => void;
  clearNearbyHazards: (state: GameState) => void;
  teleportPlayer: (state: GameState) => void;
  restoreHealth: (state: GameState) => void;
  scoreWithModifiers: (state: GameState, basePoints: number) => number;
  spawnScorePopup: (state: GameState, x: number, y: number, points: number, combo: number) => void;
}

const BASE_POWER_UP_THRESHOLD = 40;

function getDynamicPowerUpThreshold(difficultyLevel: number): number {
  return Math.floor(BASE_POWER_UP_THRESHOLD + difficultyLevel * 2);
}

const POWER_UP_PICKUP_TTL = 12;

const POWER_UP_WEIGHTS: Array<{ type: PowerUpType; weight: number }> = [
  { type: 'cd', weight: 14 },
  { type: 'rm', weight: 8 },
  { type: 'zip', weight: 14 }, // Increased weight for higher likelihood
  { type: 'unzip', weight: 8 },
  { type: 'sudo', weight: 3 },
  { type: 'shield', weight: 12 },
  { type: 'doublePoints', weight: 30 },
  { type: 'slowMotion', weight: 5 },
  { type: 'healthBoost', weight: 8 }, // Reduced weight for lower likelihood
  { type: 'hazardClear', weight: 6 },
  { type: 'findBoost', weight: 5 },
];

const POWER_UP_TEXT: Record<PowerUpType, string> = {
  cd: 'CD',
  rm: 'RM',
  zip: 'ZIP',
  unzip: 'UNZIP',
  sudo: 'SUDO',
  shield: '<|SHIELD',
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
    case 'zip': return 1;
    case 'sudo': return 10;
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

function chooseRandomPlan2BonusPowerUp(): PowerUpType {
  const choices: PowerUpType[] = ['cd', 'rm', 'zip', 'sudo'];
  return choices[Math.floor(Math.random() * choices.length)]!;
}

function hasPickupHitTraveler(state: GameState, pickup: PowerUpPickup): boolean {
  const travelerSize = Math.max(14, Math.min(22, state.W / 40));
  const travelerCenterX = state.travelerX;
  const travelerCenterY = state.travelerY + travelerSize * 1.15;
  const pickupRadius = Math.max(18, travelerSize * 1.1);
  const travelerRadius = Math.max(24, travelerSize * 1.25);
  const maxDist = pickupRadius + travelerRadius;

  const dx = pickup.x - travelerCenterX;
  const dy = pickup.y - travelerCenterY;
  return dx * dx + dy * dy <= maxDist * maxDist;
}

export function stripTimedPowerUps(state: GameState): void {
  const sudoTimer = state.powerUpTimers.sudo ?? 0;

  // Strip timed effects but preserve sudo/invincibility.
  state.shieldActive = false;
  state.doublePointsActive = false;
  state.slowMotionActive = false;
  state.findBoostActive = false;
  state.speedBoostActive = false;
  state.powerUpTimers = sudoTimer > 0 ? { sudo: sudoTimer } : {};

  state.powerUpTimer = 0;
  state.powerUpText = 'SYSTEM PURGE';
  state.powerUpTextTimer = Math.max(state.powerUpTextTimer, 1.1);
  state.powerUpFlashTimer = Math.max(state.powerUpFlashTimer, 0.5);
  state.activePowerUp = sudoTimer > 0 || state.invincibilityActive ? 'sudo' : null;
}

function setTimedPowerUpState(state: GameState, type: PowerUpType, active: boolean): void {
  switch (type) {
    case 'shield':
      state.shieldActive = active;
      if (!active) {
        state.shieldInvulnerabilityTimer = 0; // Reset invulnerability when shield deactivates
      }
      break;
    case 'doublePoints':
      state.doublePointsActive = active;
      break;
    case 'slowMotion':
      state.slowMotionActive = active;
      break;
    case 'findBoost':
      state.findBoostActive = active;
      break;
    case 'zip':
      state.invincibilityActive = active;
      break;
    case 'sudo':
      state.invincibilityActive = active;
      break;
    default:
      break;
  }
}

function isTimedPowerUp(type: PowerUpType): boolean {
  return (
    type === 'shield' ||
    type === 'doublePoints' ||
    type === 'slowMotion' ||
    type === 'findBoost' ||
    type === 'zip' ||
    type === 'sudo'
  );
}

export function activatePowerUp(state: GameState, type: PowerUpType, runtime: PowerUpRuntime): void {
  state.activePowerUp = type;
  state.powerUpText = powerUpLabel(type);
  state.powerUpTextTimer = Math.max(1.3, powerUpDuration(type));
  state.powerUpFlashTimer = Math.max(state.powerUpFlashTimer, 0.28);

  if (isTimedPowerUp(type)) {
    if (type === 'sudo' || type === 'zip') {
      // Reset the timer for 'sudo' and 'zip' instead of stacking
      state.powerUpTimers[type] = powerUpDuration(type);
    } else {
      const current = state.powerUpTimers[type] ?? 0;
      const next = current + powerUpDuration(type);
      state.powerUpTimers[type] = next;
    }
    setTimedPowerUpState(state, type, true);
  } else {
    switch (type) {
      case 'cd':
        runtime.teleportPlayer(state);
        break;
      case 'rm':
        runtime.clearNearbyHazards(state);
        break;
      case 'unzip':
        activatePowerUp(state, chooseRandomPlan2BonusPowerUp(), runtime);
        break;
      case 'healthBoost':
        runtime.restoreHealth(state);
        break;
      case 'hazardClear':
        runtime.clearHazards(state);
        break;
      default:
        break;
    }
  }

  state.powerUpTimer = Math.max(0, ...Object.values(state.powerUpTimers));

  state.audioEvents.push({ kind: 'powerup' });
}

export function maybeSpawnComboPowerUp(state: GameState): void {
  const currentThreshold = getDynamicPowerUpThreshold(state.difficultyLevel);
  if (state.combo < currentThreshold) return;

  const type = chooseRandomPowerUp();
  const margin = Math.max(40, Math.min(120, state.W * 0.12));
  const x = margin + Math.random() * Math.max(1, state.W - margin * 2);
  const y = state.travelerBaseY - (12 + Math.random() * 4); // Reduced offset to spawn closer to the ground

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

    if (hasPickupHitTraveler(state, pickup)) {
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
  let maxTimer = 0;
  const entries = Object.entries(state.powerUpTimers) as Array<[PowerUpType, number]>;
  for (const [type, timer] of entries) {
    const next = Math.max(0, timer - dt);
    if (next <= 0) {
      delete state.powerUpTimers[type];
      setTimedPowerUpState(state, type, false);
    } else {
      state.powerUpTimers[type] = next;
      if (next > maxTimer) maxTimer = next;
    }
  }
  state.powerUpTimer = maxTimer;
  if (maxTimer <= 0) {
    state.activePowerUp = null;
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

export function reduceSudoTimer(state: GameState, seconds: number): void {
  const amount = Math.max(0, seconds);
  if (amount <= 0) return;

  const sudoTimer = state.powerUpTimers.sudo ?? 0;
  if (sudoTimer <= 0) return;

  const next = Math.max(0, sudoTimer - amount);
  if (next <= 0) {
    delete state.powerUpTimers.sudo;
    setTimedPowerUpState(state, 'sudo', false);
    if (state.activePowerUp === 'sudo') {
      state.activePowerUp = null;
    }
  } else {
    state.powerUpTimers.sudo = next;
  }

  state.powerUpTimer = Math.max(0, ...Object.values(state.powerUpTimers));
}

export function spawnBouncingPowerUp(state: GameState, type: PowerUpType, x: number, y: number): void {
  const id = state.powerUpPickupIdCounter++;
  const baseY = y;
  const bounceInterval = 0.5 + Math.random() * 1.5; // Random interval between 0.5s and 2s
  const bounceAmplitude = 20 + Math.random() * 30; // Random bounce height
  const bounceSpeed = 2 + Math.random() * 3; // Random horizontal speed
  let direction = Math.random() < 0.5 ? -1 : 1; // Random initial direction

  const powerUp: PowerUpPickup = {
    id,
    x,
    y,
    baseY,
    type,
    age: 0,
    ttl: POWER_UP_PICKUP_TTL,
    phase: Math.random() * Math.PI * 2,
    update: (dt: number) => {
      powerUp.age += dt;
      powerUp.phase += dt * Math.PI * 2 / bounceInterval;
      powerUp.y = baseY + Math.sin(powerUp.phase) * bounceAmplitude;
      powerUp.x += direction * bounceSpeed * dt;

      // Reverse direction if it hits the screen edges
      if (powerUp.x < 0 || powerUp.x > state.W) {
        direction *= -1;
        powerUp.x = Math.max(0, Math.min(state.W, powerUp.x));
      }
    },
  };

  state.powerUpPickups.push(powerUp);
}
