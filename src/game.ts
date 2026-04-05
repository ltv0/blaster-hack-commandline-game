import type { PowerUpPickup, PowerUpRuntime, PowerUpType } from './power-ups.ts';
import {
  maybeSpawnComboPowerUp,
  updatePowerUpPickups,
  updatePowerUpTimers,
} from './power-ups.ts';

export { powerUpLabel } from './power-ups.ts';

// --- Performance caps ---
const MAX_HAZARDS = 120;
const MAX_PARTICLES = 180;
const HAZARD_POOL_MAX = MAX_HAZARDS * 3;
const PARTICLE_POOL_MAX = MAX_PARTICLES * 4;

const hazardPool: Hazard[] = [];
const particlePool: Particle[] = [];

function acquireHazard(id: number): Hazard {
  const pooled = hazardPool.pop();
  if (pooled) {
    pooled.id = id;
    pooled.blocked = false;
    return pooled;
  }
  return {
    id,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    type: 'rain',
    glyph: '|',
    blocked: false,
    size: 1,
  };
}

function releaseHazard(hazard: Hazard): void {
  if (hazardPool.length >= HAZARD_POOL_MAX) return;
  hazardPool.push(hazard);
}

function acquireParticle(id: number): Particle {
  const pooled = particlePool.pop();
  if (pooled) {
    pooled.id = id;
    pooled.fromCloudHit = undefined;
    return pooled;
  }
  return {
    id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 1,
    maxLife: 1,
    glyph: '.',
    color: COLORS.splash,
    type: 'rain',
    sizeScale: 1,
  };
}

function releaseParticle(particle: Particle): void {
  if (particlePool.length >= PARTICLE_POOL_MAX) return;
  particlePool.push(particle);
}
// ─── Types ───────────────────────────────────────────────────────────────────

export type GamePhase = 'boot' | 'playing' | 'dead';

export interface Hazard {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  type: 'rain' | 'snow' | 'hail';
  glyph: string;
  blocked: boolean;
  size: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  glyph: string;
  color: string;
  type: 'rain' | 'snow' | 'hail';
  sizeScale: number;
  // true for secondary particles spawned from cloud impacts to avoid re-trigger loops
  fromCloudHit?: boolean;
}

export interface ScorePopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export interface HeartExplosion {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  glyph: string;
  color: string;
}

/**
 * A raindrop sliding along the umbrella canopy surface.
 * Spawned when rain (not hail/snow) is blocked.
 * Slides laterally toward the nearest umbrella edge, then drips off.
 */
export interface UmbrellaSlide {
  id: number;
  x: number;        // current x position
  y: number;        // current y position
  // normalized distance from canopy center to edge (0 = center, 1 = rim)
  canopyT: number;
  // -1 = sliding left edge, 0 = sliding down the middle, +1 = sliding right edge
  dir: -1 | 0 | 1;
  // x coordinate of the edge it's heading toward
  edgeX: number;
  edgeY: number;    // y at that edge (umbrella surface height at that x)
  phase: 'slide' | 'drip';
  // slide: moves along canopy toward edge
  slideSpeed: number;
  // drip: falls freely after leaving the edge
  vy: number;
  life: number;     // 0..1, counts down
  maxLife: number;
  glyph: string;
  alpha: number;
  type: 'rain' | 'snow';
  color: string;
}

export interface Cloud {
  id: number;
  x: number;          // centre x
  y: number;          // centre y (stays in top strip)
  vx: number;         // horizontal drift speed (px/s)
  vy: number;         // vertical drift speed (px/s)
  type: 'rain' | 'snow' | 'hail';
  // pulsing flash when it emits a hazard
  flashTimer: number;
  // renderer-selected visual style for cloud glyphs
  visualType?: 'rain' | 'snow' | 'hail';
  // per-cloud independent spawn cadence
  spawnTimer: number;
  // current interval between spawns
  spawnInterval: number;
  // width in pixels (written by renderer so spawn x is accurate)
  artW: number;
  // emit points (relative to cloud center) sampled from visible cloud topology
  emitPoints: Array<{ dx: number; dy: number; pType?: 'rain' | 'snow' | 'hail' }>;
}

export type AudioEvent =
  | { kind: 'block'; hazardType: 'rain' | 'snow' | 'hail' }
  | { kind: 'hit' }
  | { kind: 'levelup' }
  | { kind: 'death' }
  | { kind: 'powerup' };

export interface GameState {
  phase: GamePhase;
  W: number;
  H: number;

  // boot
  bootLines: string[];
  bootDone: boolean;
  bootTimer: number;
  bootLineIndex: number;
  promptBlink: boolean;
  promptBlinkTimer: number;

  // traveler
  travelerX: number;
  travelerY: number;
  travelerBaseY: number;   // ground-level Y (travelerY rests here when not jumping)
  travelerVX: number;      // current horizontal velocity (px/s)
  travelerVY: number;      // vertical velocity for jumping (px/s, positive = down)
  travelerMaxSpeed: number; // top speed cap (scales with difficulty)
  keysHeld: Set<string>;   // currently pressed movement keys
  jumpTimer: number;       // countdown to next jump (s)
  jumpInterval: number;    // current interval between jumps (s)
  isJumping: boolean;

  // umbrella
  umbrellaX: number;
  umbrellaY: number;
  umbrellaVY: number;
  _umbrellaActualY?: number;
  umbrellaW: number;
  umbrellaH: number;

  // clouds — weather sources drifting at the top
  clouds: Cloud[];
  cloudIdCounter: number;

  // active falling hazards emitted by clouds
  hazards: Hazard[];
  hazardIdCounter: number;
  spawnTimer: number;
  spawnInterval: number;

  // particles
  particles: Particle[];
  particleIdCounter: number;

  // snow on ground (particles that hit ground)
  groundSnow: Array<{ x: number; y: number; life: number }>;

  // umbrella rain slides
  umbrellaSlides: UmbrellaSlide[];
  umbrellaSlideIdCounter: number;

  // score popups
  scorePopups: ScorePopup[];
  scorePopupIdCounter: number;

  // heart explosions
  heartExplosions: HeartExplosion[];
  heartExplosionIdCounter: number;

  // power-up pickups
  powerUpPickups: PowerUpPickup[];
  powerUpPickupIdCounter: number;

  // scroll / parallax
  groundOffset: number;
  bgStarOffset: number;

  // scoring
  score: number;
  scoreTimer: number;
  combo: number;
  comboTimer: number;
  bestCombo: number;

  // health
  hp: number;
  maxHp: number;
  hitCooldown: number;

  // power-up status
  activePowerUp: PowerUpType | null;
  powerUpTimer: number;
  powerUpText: string;
  powerUpTextTimer: number;
  powerUpFlashTimer: number;
  shieldActive: boolean;
  doublePointsActive: boolean;
  slowMotionActive: boolean;
  findBoostActive: boolean;

  // difficulty
  elapsed: number;
  difficultyLevel: number;

  // level-up banner
  levelUpTimer: number;
  levelUpText: string;

  // wind
  windX: number;
  windChangeTimer: number;

  // vfx
  deathFlash: number;

  // umbrella art pixel geometry (written by renderer each frame, read by slide logic)
  umbrellaArtStartX: number;
  umbrellaArtWidth: number;
  umbrellaArtStartY: number;
  umbrellaArtLineH: number;
  pointerX: number;
  pointerY: number;
  pointerDown: boolean;

  // audio triggers (consumed each frame by audio layer)
  audioEvents: AudioEvent[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Vertical glyphs for rain
export const CAT_GLYPH = 'C\nA\nT';
export const DOG_GLYPH = 'D\nO\nG';

export const BOOT_LINES = [
  'BLASTER HACK OS v2.4.1',
  'Initializing weather subsystem...     OK',
  'Loading hazard profiles [rain][snow][hail]',
  'Calibrating umbrella servo............OK',
  'Scanning for travelers...  FOUND (1)',
  '\u26a0  WARNING: Severe weather incoming.',
  '> Press ENTER or SPACE to deploy _',
];

export const HAZARD_GLYPHS: Record<string, string[]> = {
  rain: ['|', '/', '\u254e', '\u254f', '\xa6', CAT_GLYPH, DOG_GLYPH],
  snow: ['*', '\u2744', '\u2217', '\u2726', '\u204e'],
  hail: ['\u25c6', '\u25cf', '\u25a0', '\u25c9', '\u25c8'],
};

export const COLORS = {
  bg:          '#0d1117',
  green:       '#6cf280',
  dimGreen:    '#3f9d57',
  brightGreen: '#8cff9f',
  amber:       '#ffc24a',
  brightAmber: '#ffd97a',
  cyan:        '#8ae9f3',
  red:         '#f44747',
  brightRed:   '#ff6b6b',
  white:       '#eef5fb',
  dim:         '#9aa8b5',
  dimmer:      '#67737f',
  rain:        '#4fc3f7',
  rainDim:     '#1a5f7a',
  snow:        '#e0f4ffff',
  snowDim:     '#7ab8d4',
  hail:        '#cfd8dc',
  hailDim:     '#78909c',
  umbrella:    '#e6a817',
  umbrellaRim: '#b37d00',
  traveler:    '#39d353',
  ground:      '#161b22',
  groundLine:  '#21262d',
  groundText:  '#5e6a76',
  splash:      '#4fc3f7',
  hailSplash:  '#b0bec5',
  snowSplash:  '#e0f7fa',
  star:        '#21262d',
  comboGold:   '#ffd700',
  cloudRain:   '#2a4a6b',
  cloudSnow:   '#3a4a5a',
  cloudHail:   '#2d3540',
  cloudFlash:  '#56d4e0',
};

const GROUND_Y_RATIO = 0.91;
const MAX_HEART_EXPLOSIONS = 120;
const SCORE_POPUP_OVERLOAD_THRESHOLD = 24;
const MAX_SCORE_POPUPS = 40;
const SCORE_POPUP_MERGE_DISTANCE = 44;
const SCORE_POPUP_CLUSTER_X = 80;
const SCORE_POPUP_CLUSTER_Y = 40;
const SCORE_POPUP_STACK_STEP_Y = 14;
const SCORE_POPUP_STACK_OFFSETS = [0, -12, 12, -20, 20, -28, 28];
const SCORE_POPUP_MIN_DISTANCE_X = 54;
const SCORE_POPUP_MIN_DISTANCE_Y = 18;

// ─── Init ─────────────────────────────────────────────────────────────────────

export function createInitialState(W: number, H: number): GameState {
  const travelerSize = Math.max(14, Math.min(22, W / 40));
  const baseY = Math.round(H * GROUND_Y_RATIO) - travelerSize * 2.95;
  return {
    phase: 'boot',
    W, H,

    bootLines: [],
    bootDone: false,
    bootTimer: 0,
    bootLineIndex: 0,
    promptBlink: true,
    promptBlinkTimer: 0,

    travelerX: W * 0.38,
    travelerY: baseY,
    travelerBaseY: baseY,
    travelerVX: 0,
    travelerVY: 0,
    travelerMaxSpeed: 220,
    keysHeld: new Set(),
    jumpTimer: 2.5 + Math.random() * 1.5,
    jumpInterval: 3.0,
    isJumping: false,

    umbrellaX: W * 0.38,
    umbrellaY: H * 0.55,
    umbrellaVY: 0,
    umbrellaW: computeUmbrellaW(W),
    umbrellaH: 14,

    clouds: [],
    cloudIdCounter: 0,

    hazards: [],
    hazardIdCounter: 0,
    spawnTimer: -0.8,
    spawnInterval: 1.6,

    particles: [],
    particleIdCounter: 0,

    groundSnow: [],

    umbrellaSlides: [],
    umbrellaSlideIdCounter: 0,

    scorePopups: [],
    scorePopupIdCounter: 0,

    heartExplosions: [],
    heartExplosionIdCounter: 0,

    powerUpPickups: [],
    powerUpPickupIdCounter: 0,

    groundOffset: 0,
    bgStarOffset: 0,

    score: 0,
    scoreTimer: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,

    hp: 5,
    maxHp: 5,
    hitCooldown: 0,

    activePowerUp: null,
    powerUpTimer: 0,
    powerUpText: '',
    powerUpTextTimer: 0,
    powerUpFlashTimer: 0,
    shieldActive: false,
    doublePointsActive: false,
    slowMotionActive: false,
    findBoostActive: false,

    elapsed: 0,
    difficultyLevel: 0,

    levelUpTimer: 0,
    levelUpText: '',

    windX: 0,
    windChangeTimer: 5,

    deathFlash: 0,

    pointerX: W / 2,
    pointerY: H / 2,
    pointerDown: false,

    umbrellaArtStartX: 0,
    umbrellaArtWidth: 0,
    umbrellaArtStartY: 0,
    umbrellaArtLineH: 0,

    audioEvents: [],
  };
}

function computeUmbrellaW(W: number): number {
  return Math.max(80, Math.min(220, W * 0.18));
}

function computeUmbrellaLineH(W: number): number {
  return Math.round(Math.max(7, Math.min(11, W / 100)) * 1.15);
}

function computeGroundY(state: GameState): number {
  return Math.round(state.H * GROUND_Y_RATIO);
}

function computeTravelerBaseY(state: GameState): number {
  const travelerSize = Math.max(14, Math.min(22, state.W / 40));
  return computeGroundY(state) - travelerSize * 2.95;
}

const UMBRELLA_CANOPY_LINES = 6;
const UMBRELLA_HANDLE_LINES = 8;
const UMBRELLA_FOOT_LINES = 4;

function computeCloudLineH(W: number): number {
  return Math.round(Math.max(9, Math.min(14, W / 75)) * 1.35);
}

function computeCloudBottom(state: Pick<GameState, 'W' | 'clouds'>, cloud: Cloud): number {
  const hudH = Math.max(10, Math.min(14, state.W / 70)) + 20;
  const lineH = computeCloudLineH(state.W);
  const startY = Math.max(hudH + 6, cloud.y);
  return startY + 8 * lineH;
}

export function computeUmbrellaYBounds(state: Pick<GameState, 'W' | 'H' | 'clouds'>): { minY: number; maxY: number } {
  const umbrellaLineH = computeUmbrellaLineH(state.W);
  const totalUmbrellaLines = UMBRELLA_CANOPY_LINES + UMBRELLA_HANDLE_LINES + UMBRELLA_FOOT_LINES;

  let cloudCeiling = Infinity;
  for (const cloud of state.clouds) {
    cloudCeiling = Math.min(cloudCeiling, computeCloudBottom(state, cloud));
  }

  if (!Number.isFinite(cloudCeiling)) {
    cloudCeiling = Math.max(0, state.H * 0.12);
  }

  const groundY = Math.round(state.H * GROUND_Y_RATIO);
  return {
    // umbrellaY maps to one line below the rendered top (startY = umbrellaY - lineH)
    minY: Math.max(0, cloudCeiling + umbrellaLineH),
    // bottom of the rendered umbrella sits (totalLines - 1) lines below umbrellaY
    maxY: groundY - umbrellaLineH * (totalUmbrellaLines - 1),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Cloud helpers ────────────────────────────────────────────────────────────

function cloudSpawnInterval(level: number, type: 'rain' | 'snow' | 'hail'): number {
  // Rain fires fastest, hail slowest but hits harder
  const base = type === 'rain' ? 0.55 : type === 'snow' ? 0.75 : 1.1;
  return Math.max(0.18, base - level * 0.04);
}

function spawnCloud(state: GameState, x: number, type: 'rain' | 'snow' | 'hail'): void {
  const { H, difficultyLevel: level } = state;
  const cloudY   = H * 0.07 + Math.random() * H * 0.07;
  // Clouds drift at different speeds by type: rain drifts faster, hail sluggish
  const baseSpeed = type === 'rain' ? 22 : type === 'snow' ? 14 : 10;
  const speed     = (baseSpeed + Math.random() * 12) * (Math.random() < 0.5 ? 1 : -1);
  const vy        = (Math.random() - 0.5) * 8; // small vertical drift
  state.clouds.push({
    id: state.cloudIdCounter++,
    x,
    y: cloudY,
    vx: speed,
    vy,
    type,
    flashTimer: 0,
    visualType: type,
    spawnTimer: Math.random() * 0.8, // stagger so they don't all fire at once
    spawnInterval: cloudSpawnInterval(level, type),
    artW: 0,
    emitPoints: [],
  });
}

/** Keep 3–6 clouds on screen, scaling with difficulty. Each type is represented. */
function maintainClouds(state: GameState): void {
  const { W, difficultyLevel: level } = state;
  const MAX_CLOUDS = 8; // Hard cap on clouds
  const target = Math.min(MAX_CLOUDS, 3 + Math.floor(level / 2));

  // --- Profiling ---
  const maintainStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let cloudsAdded = 0;

  // Count existing types
  const typeCounts = { rain: 0, snow: 0, hail: 0 };
  for (const c of state.clouds) typeCounts[c.type]++;

  while (state.clouds.length < target && state.clouds.length < MAX_CLOUDS) {
    let type: 'rain' | 'snow' | 'hail';
    if (level < 1) {
      type = 'rain';
    } else if (level === 1) {
      // Only rain clouds at level 1
      type = 'rain';
    } else {
      // Pick the least-represented type
      if (typeCounts.hail === 0 && level >= 2) {
        type = 'hail';
      } else if (typeCounts.rain <= typeCounts.snow && typeCounts.rain <= typeCounts.hail) {
        type = 'rain';
      } else if (typeCounts.snow <= typeCounts.hail) {
        type = 'snow';
      } else {
        type = 'hail';
      }
    }
    const x = Math.random() * W;
    spawnCloud(state, x, type);
    typeCounts[type]++;
    cloudsAdded++;
  }

  // Remove excess clouds if above cap
  if (state.clouds.length > MAX_CLOUDS) {
    state.clouds.splice(0, state.clouds.length - MAX_CLOUDS);
  }

  const maintainEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (typeof window !== 'undefined' && (window as any).__DEBUG_GAME__ && (cloudsAdded > 0 || (maintainEnd - maintainStart) > 2)) {
    console.log(`[PROFILE] maintainClouds: cloudsAdded=${cloudsAdded}, time=${(maintainEnd - maintainStart).toFixed(2)}ms, totalClouds=${state.clouds.length}`);
  }
}

/** Spawn one hazard from a specific cloud — called per-cloud from updateClouds. */
function spawnHazardFromCloud(state: GameState, cloud: Cloud): void {
  if (!Array.isArray(state.hazards) || !Number.isInteger(state.hazards.length) || state.hazards.length < 0 || state.hazards.length > MAX_HAZARDS * 4) {
    state.hazards = [];
  } else if (state.hazards.length >= MAX_HAZARDS) {
    const overflow = state.hazards.length - (MAX_HAZARDS - 1);
    for (let i = 0; i < overflow; i++) {
      releaseHazard(state.hazards[i]!);
    }
    state.hazards.splice(0, overflow);
  }

  const { difficultyLevel: level, elapsed } = state;
  const emitPoints = Array.isArray(cloud.emitPoints) ? cloud.emitPoints : [];
  if (emitPoints.length === 0) return;

  const p = emitPoints[Math.floor(Math.random() * emitPoints.length)];
  if (!p || !Number.isFinite(p.dx) || !Number.isFinite(p.dy)) return;

  const x = cloud.x + p.dx;
  const y = cloud.y + p.dy;
  const hazardType = p.pType ?? cloud.type;
  let glyph: string;
  if (hazardType === 'rain') {
    // Keep rain glyph selection stable at higher levels without weighted overflows.
    const catDogChance = Math.min(0.9, Math.max(0, 0.2 * (level - 1)));
    const useAnimalGlyph = level >= 2 && Math.random() < catDogChance;
    glyph = useAnimalGlyph
      ? (Math.random() < 0.5 ? CAT_GLYPH : DOG_GLYPH)
      : (Math.random() < 0.5 ? '|' : '/');
  } else {
    const glyphs = HAZARD_GLYPHS[hazardType];
    if (!glyphs || glyphs.length === 0) return;
    glyph = glyphs[Math.floor(Math.random() * glyphs.length)]!;
  }

  const speedBase = 90 + level * 18 + elapsed * 0.4;
  const vy = speedBase * (0.8 + Math.random() * 0.4);
  const vx = (Math.random() - 0.5) * speedBase * 0.22 + state.windX * 0.5;
  const size = hazardType === 'hail'
    ? 0.9 + Math.random() * 0.4
    : 0.7 + Math.random() * 0.3;

  const hazard = acquireHazard(state.hazardIdCounter++);
  hazard.x = x;
  hazard.y = y;
  hazard.prevX = x;
  hazard.prevY = y;
  hazard.vx = vx;
  hazard.vy = vy;
  hazard.type = hazardType;
  hazard.glyph = glyph;
  hazard.blocked = false;
  hazard.size = size;

  state.hazards.push(hazard);

  if (state.hazards.length > MAX_HAZARDS) {
    const overflow = state.hazards.length - MAX_HAZARDS;
    for (let i = 0; i < overflow; i++) {
      releaseHazard(state.hazards[i]!);
    }
    state.hazards.splice(0, overflow);
  }

  cloud.flashTimer = 0.2;
}

/** Legacy single-hazard spawn used by the batch timer — now just picks a random cloud. */
function spawnHazard(state: GameState): void {
  if (state.clouds.length === 0) return;
  const cloud = state.clouds[Math.floor(Math.random() * state.clouds.length)];
  spawnHazardFromCloud(state, cloud);
}


function spawnSplash(
  state: GameState,
  x: number, y: number,
  type: 'rain' | 'snow' | 'hail',
  isHit = false,
  sizeScale = 1,
  glyphOverride?: string
): void {
  const count = isHit ? 7 : (type === 'hail' ? 7 : type === 'snow' ? 4 : 2);
  let color: string;
  let glyphs: string[];
  if (type === 'hail') {
    color = isHit ? COLORS.brightRed : COLORS.hailSplash;
    glyphs = ['\xb7', '*', '\xb0'];
  } else if (type === 'snow') {
    color = isHit ? COLORS.brightRed : COLORS.snowSplash;
    glyphs = ['\xb7', '\u02d9', '*'];
  } else {
    color = isHit ? COLORS.brightRed : COLORS.splash;
    // Accept a glyph argument for splash (for CAT/DOG)
    if (glyphOverride === CAT_GLYPH) {
      glyphs = ['C', 'A', 'T'];
    } else if (glyphOverride === DOG_GLYPH) {
      glyphs = ['D', 'O', 'G'];
    } else {
      glyphs = ['\xb7', '\u02d9', '\''];
    }
  }
  for (let i = 0; i < count; i++) {
    if (state.particles.length >= MAX_PARTICLES) {
      const oldest = state.particles.shift();
      if (oldest) releaseParticle(oldest);
    }
    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.9;
    const speed = isHit ? (70 + Math.random() * 110) : (25 + Math.random() * 60);
    const particle = acquireParticle(state.particleIdCounter++);
    particle.x = x;
    particle.y = y;
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed - (isHit ? 50 : 12);
    particle.life = 1;
    particle.maxLife = isHit ? (0.5 + Math.random() * 0.35) : (0.28 + Math.random() * 0.2);
    particle.glyph = glyphs[Math.floor(Math.random() * glyphs.length)]!;
    particle.color = color;
    particle.type = type;
    particle.sizeScale = sizeScale;
    particle.fromCloudHit = undefined;
    state.particles.push(particle);
  }
}

function pointHitsAnyCloud(state: GameState, x: number, y: number): boolean {
  if (state.clouds.length === 0) return false;

  const hudH = Math.max(10, Math.min(14, state.W / 70)) + 20;
  const lineH = computeCloudLineH(state.W);
  const fallbackArtW = Math.max(80, Math.min(220, state.W * 0.18));

  for (const cloud of state.clouds) {
    const artW = cloud.artW > 0 ? cloud.artW : fallbackArtW;
    const left = cloud.x - artW / 2;
    const right = cloud.x + artW / 2;
    const top = Math.max(hudH + 6, cloud.y);
    const bottom = top + 8 * lineH;
    if (x >= left && x <= right && y >= top && y <= bottom) return true;
  }

  return false;
}

function spawnCloudHitBurst(
  state: GameState,
  x: number,
  y: number,
  type: 'rain' | 'snow' | 'hail',
): void {
  const count = type === 'hail' ? 5 : type === 'snow' ? 4 : 3;
  const color = type === 'hail' ? COLORS.hailSplash : type === 'snow' ? COLORS.snowSplash : COLORS.splash;
  const glyphs = type === 'hail'
    ? ['\u00b7', '*', '\u25e6']
    : type === 'snow'
      ? ['\u00b7', '\u02d9', '*']
      : ['\u00b7', '\'', '/'];

  for (let i = 0; i < count; i++) {
    if (state.particles.length >= MAX_PARTICLES) {
      const oldest = state.particles.shift();
      if (oldest) releaseParticle(oldest);
    }
    const angle = Math.PI * (0.25 + Math.random() * 0.5); // mostly downward fan
    const speed = 35 + Math.random() * 55;
    const particle = acquireParticle(state.particleIdCounter++);
    particle.x = x;
    particle.y = y;
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed;
    particle.life = 1;
    particle.maxLife = 0.18 + Math.random() * 0.15;
    particle.glyph = glyphs[Math.floor(Math.random() * glyphs.length)]!;
    particle.color = color;
    particle.type = type;
    particle.sizeScale = 0.85;
    particle.fromCloudHit = true;
    state.particles.push(particle);
  }
}

function hazardIntersectsUmbrella(
  state: GameState,
  prevX: number,
  prevY: number,
  x: number,
  y: number,
): boolean {
  if (pointHitsUmbrella(state, x, y) || pointHitsUmbrella(state, prevX, prevY)) return true;

  const dx = x - prevX;
  const dy = y - prevY;
  const dist = Math.hypot(dx, dy);
  const sampleStep = Math.max(3, computeUmbrellaLineH(state.W) * 0.28);
  const steps = Math.max(2, Math.ceil(dist / sampleStep));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sx = prevX + dx * t;
    const sy = prevY + dy * t;
    if (pointHitsUmbrella(state, sx, sy)) return true;
  }
  return false;
}

function computeUmbrellaImpactPoint(
  state: GameState,
  prevX: number,
  prevY: number,
  x: number,
  y: number,
): { x: number; y: number } {
  const dx = x - prevX;
  const dy = y - prevY;
  const dist = Math.hypot(dx, dy);
  const sampleStep = Math.max(2, computeUmbrellaLineH(state.W) * 0.2);
  const steps = Math.max(3, Math.ceil(dist / sampleStep));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sx = prevX + dx * t;
    const sy = prevY + dy * t;
    if (pointHitsUmbrella(state, sx, sy)) return { x: sx, y: sy };
  }
  return { x, y };
}

function umbrellaHitGeometry(state: GameState): {
  cx: number;
  halfW: number;
  canopyTop: number;
  canopyBottom: number;
  handleBottom: number;
  sidePad: number;
  handlePad: number;
} {
  const lineH = state.umbrellaArtLineH > 0 ? state.umbrellaArtLineH : computeUmbrellaLineH(state.W);
  const width = state.umbrellaArtWidth > 0 ? state.umbrellaArtWidth : state.umbrellaW;
  const startX = Number.isFinite(state.umbrellaArtStartX) ? state.umbrellaArtStartX : state.umbrellaX - width / 2;
  const startY = Number.isFinite(state.umbrellaArtStartY) ? state.umbrellaArtStartY : state.umbrellaY - lineH;

  const cx = startX + width * 0.5;
  const halfW = Math.max(18, width * 0.5);
  const canopyTop = startY + lineH * 0.35;
  const canopyBottom = startY + UMBRELLA_CANOPY_LINES * lineH;
  const handleBottom = canopyBottom + UMBRELLA_HANDLE_LINES * lineH;
  const sidePad = Math.max(2, Math.min(8, state.W * 0.006));
  const handlePad = Math.max(3, lineH * 0.26);

  return { cx, halfW, canopyTop, canopyBottom, handleBottom, sidePad, handlePad };
}

function pointHitsUmbrella(state: GameState, x: number, y: number): boolean {
  const g = umbrellaHitGeometry(state);

  if (y >= g.canopyTop && y <= g.canopyBottom) {
    const t = (y - g.canopyTop) / Math.max(1, g.canopyBottom - g.canopyTop);
    // Tapered canopy: narrow near peak, full width at rim.
    const widthT = 0.22 + 0.78 * t;
    const halfAtY = g.halfW * widthT + g.sidePad;
    if (Math.abs(x - g.cx) <= halfAtY) return true;
  }

  if (y > g.canopyBottom && y <= g.handleBottom) {
    if (Math.abs(x - g.cx) <= g.handlePad) return true;
  }

  return false;
}

function spawnScorePopup(
  state: GameState,
  x: number, y: number,
  points: number, combo: number
): void {
  const popupColor = combo >= 5 ? COLORS.comboGold : combo >= 3 ? COLORS.brightAmber : COLORS.cyan;
  const popupText = combo > 1 ? `+${points} x${combo}` : `+${points}`;
  const shouldMerge = state.scorePopups.length >= SCORE_POPUP_OVERLOAD_THRESHOLD;

  if (shouldMerge) {
    let nearestIdx = -1;
    let nearestD2 = Number.POSITIVE_INFINITY;
    const maxMergeD2 = SCORE_POPUP_MERGE_DISTANCE * SCORE_POPUP_MERGE_DISTANCE;

    for (let i = 0; i < state.scorePopups.length; i++) {
      const p = state.scorePopups[i]!;
      if (p.life <= 0.2) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < maxMergeD2 && d2 < nearestD2) {
        nearestD2 = d2;
        nearestIdx = i;
      }
    }

    if (nearestIdx >= 0) {
      const existing = state.scorePopups[nearestIdx]!;
      const match = /^\+(\d+)(?: x(\d+))?$/.exec(existing.text);
      const existingPoints = match ? Number(match[1]) : 0;
      const existingCombo = match && match[2] ? Number(match[2]) : 1;
      const mergedPoints = existingPoints + points;
      const mergedCombo = Math.max(existingCombo, combo);

      existing.text = mergedCombo > 1 ? `+${mergedPoints} x${mergedCombo}` : `+${mergedPoints}`;
      existing.color = mergedCombo >= 5 ? COLORS.comboGold : mergedCombo >= 3 ? COLORS.brightAmber : COLORS.cyan;
      existing.life = Math.max(existing.life, 0.95);
      existing.x = (existing.x + x) * 0.5;
      existing.y = Math.min(existing.y, y - 8);
      return;
    }
  }

  let nearbyCount = 0;
  for (let i = 0; i < state.scorePopups.length; i++) {
    const p = state.scorePopups[i]!;
    if (p.life <= 0.2) continue;
    if (Math.abs(p.x - x) <= SCORE_POPUP_CLUSTER_X && Math.abs(p.y - y) <= SCORE_POPUP_CLUSTER_Y) {
      nearbyCount++;
    }
  }

  const stackOffset = SCORE_POPUP_STACK_OFFSETS[nearbyCount % SCORE_POPUP_STACK_OFFSETS.length] ?? 0;
  const layer = Math.floor(nearbyCount / SCORE_POPUP_STACK_OFFSETS.length);
  const spawnX = Math.max(14, Math.min(state.W - 14, x + stackOffset));
  const spawnY = Math.max(26, y - layer * SCORE_POPUP_STACK_STEP_Y);

  if (state.scorePopups.length >= MAX_SCORE_POPUPS) {
    let weakestIdx = 0;
    let weakestLife = Number.POSITIVE_INFINITY;
    for (let i = 0; i < state.scorePopups.length; i++) {
      const p = state.scorePopups[i]!;
      if (p.life < weakestLife) {
        weakestLife = p.life;
        weakestIdx = i;
      }
    }
    const reused = state.scorePopups[weakestIdx]!;
    reused.x = spawnX;
    reused.y = spawnY;
    reused.text = popupText;
    reused.color = popupColor;
    reused.life = 1;
    return;
  }

  state.scorePopups.push({
    id: state.scorePopupIdCounter++,
    x: spawnX,
    y: spawnY,
    text: popupText,
    color: popupColor,
    life: 1,
  });
}

function spawnHeartExplosion(state: GameState, centerX: number, centerY: number, fatalHit = false): void {
  const glyphs = ['♥', '✦', '★', '✢', '●'];
  const count = fatalHit ? 22 : 9;
  const available = Math.max(0, MAX_HEART_EXPLOSIONS - state.heartExplosions.length);
  const burstCount = Math.min(count, available);
  if (burstCount <= 0) return;

  const spreadX = fatalHit ? state.W * 0.9 : 120;
  const spreadY = fatalHit ? state.H * 0.36 : 90;
  const speedBase = fatalHit ? 120 : 85;
  const speedJitter = fatalHit ? 200 : 95;
  
  for (let i = 0; i < burstCount; i++) {
    const spawnX = Math.max(0, Math.min(state.W, centerX + (Math.random() - 0.5) * spreadX));
    const spawnY = Math.max(0, Math.min(state.H * 0.4, centerY + (Math.random() - 0.5) * spreadY));
    
    const angle = Math.random() * Math.PI * 2;
    const speed = speedBase + Math.random() * speedJitter;
    
    state.heartExplosions.push({
      id: state.heartExplosionIdCounter++,
      x: spawnX,
      y: spawnY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 100,
      life: 1,
      maxLife: fatalHit ? (1.0 + Math.random() * 0.5) : (0.55 + Math.random() * 0.35),
      glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
      color: COLORS.brightRed,
    });
  }
}

function clearHazards(state: GameState): void {
  for (let i = 0; i < state.hazards.length; i++) {
    releaseHazard(state.hazards[i]!);
  }
  state.hazards.length = 0;
  // Validate/repair hazards after length assignment
  if (!Array.isArray(state.hazards) || typeof state.hazards.length !== 'number' || state.hazards.length < 0 || !Number.isFinite(state.hazards.length) || !Number.isSafeInteger(state.hazards.length)) {
    if (typeof console !== 'undefined') {
      console.error('[ERROR] state.hazards was invalid after clearHazards, forcibly resetting to []', { hazards: state.hazards, state });
      console.trace('[TRACE] Corruption detected after clearHazards');
    }
    state.hazards = [];
  }
}

function clearScreen(state: GameState): void {
  for (let i = 0; i < state.hazards.length; i++) {
    releaseHazard(state.hazards[i]!);
  }
  state.hazards.length = 0;
  // Validate/repair hazards after length assignment
  if (!Array.isArray(state.hazards) || typeof state.hazards.length !== 'number' || state.hazards.length < 0 || !Number.isFinite(state.hazards.length) || !Number.isSafeInteger(state.hazards.length)) {
    if (typeof console !== 'undefined') {
      console.error('[ERROR] state.hazards was invalid after clearScreen, forcibly resetting to []', { hazards: state.hazards, state });
      console.trace('[TRACE] Corruption detected after clearScreen');
    }
    state.hazards = [];
  }
  state.powerUpPickups.length = 0;
}

function restoreHealth(state: GameState): void {
  const boost = Math.ceil(state.maxHp * 0.5);
  state.hp = Math.min(state.maxHp, state.hp + boost);
}

function scoreWithModifiers(state: GameState, basePoints: number): number {
  return state.doublePointsActive ? basePoints * 2 : basePoints;
}

const powerUpRuntime: PowerUpRuntime = {
  clearHazards,
  restoreHealth,
  scoreWithModifiers,
  spawnScorePopup,
};

/**
 * The umbrella art rows and their approximate x-offsets (in character columns)
 * for the canopy surface. Row 0 = first line of art ("|").
 * The canopy rim is rows 1-6. We model the surface as the slope from the peak
 * (row 1 centre) down to the left/right tips (row 6 ends).
 *
 * All pixel geometry is computed from state.umbrellaArtStartX/Width/StartY/LineH
 * which the renderer writes each frame before update() is called.
 */
function spawnUmbrellaSlide(state: GameState, hitX: number, hitY: number, type: 'rain' | 'snow' = 'rain'): void {
  const { umbrellaArtStartX, umbrellaArtWidth, umbrellaArtStartY, umbrellaArtLineH } = state;

  // If renderer hasn't written art geometry yet, skip
  if (umbrellaArtWidth === 0) return;

  const artRight = umbrellaArtStartX + umbrellaArtWidth;

  // The canopy surface spans art rows 1-6 (0-indexed).
  // Peak is at row 1 (top of dome), rim/tips are at row 6.
  // Left tip of row 6 art: "'" is the first char at col 0 of that line.
  // Right tip: "'" is the last char. We approximate tips as artLeft and artRight.
  const peakY   = umbrellaArtStartY + 1 * umbrellaArtLineH; // row 1
  const rimY    = umbrellaArtStartY + (UMBRELLA_CANOPY_LINES - 1) * umbrellaArtLineH; // canopy last row (rim)

  // Pick side based on hit position relative to art centre, with a chance to
  // route straight down the middle for a more natural umbrella drip.
  const artCenterX = umbrellaArtStartX + umbrellaArtWidth / 2;
  const halfW = umbrellaArtWidth / 2;
  const xFrac = Math.min(1, Math.abs(hitX - artCenterX) / halfW);
  const centerChance = Math.max(0.12, 0.32 - xFrac * 0.18);
  const dir: -1 | 0 | 1 = Math.random() < centerChance ? 0 : (hitX <= artCenterX ? -1 : 1);

  // Edge x = left or right tip of the canopy art
  const edgeX = dir === 0 ? artCenterX : (dir === -1 ? umbrellaArtStartX : artRight);
  const edgeY = rimY;

  // The surface slope: as x moves from centre to edge, y moves from peakY to rimY.
  // We use this to compute starting y on the surface at hitX.
  const surfaceY = peakY + xFrac * (rimY - peakY);

  let slideGlyphs: string[], color: string;
  if (type === 'snow') {
    slideGlyphs = ['*', '\u2744', '\u2217', '\u2726', '\u204e', '\u00b7'];
    color = COLORS.snowSplash || '#e0f7fa';
  } else {
    slideGlyphs = ['|', '\'', '\u00b7', '\u254e'];
    color = COLORS.rain;
  }
  const glyph = slideGlyphs[Math.floor(Math.random() * slideGlyphs.length)];

  // Slide speed proportional to remaining distance to edge (steeper = faster)
  const distToEdge = Math.abs(hitX - edgeX);
  const slideSpeed = 55 + distToEdge * 1.1 + Math.random() * 25;

  state.umbrellaSlides.push({
    id: state.umbrellaSlideIdCounter++,
    x: dir === 0 ? artCenterX : hitX,
    y: surfaceY,
    canopyT: dir === 0 ? Math.max(0, Math.min(1, (surfaceY - peakY) / (rimY - peakY))) : xFrac,
    dir,
    edgeX,
    edgeY,
    phase: 'slide',
    slideSpeed,
    vy: 0,
    life: 1,
    maxLife: 0.5 + Math.random() * 0.3,
    glyph,
    alpha: 0.9 + Math.random() * 0.1,
    type,
    color,
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function update(state: GameState, dt: number): void {
    // Global hazards array validation/repair at start of update
    if (!Array.isArray(state.hazards) || typeof state.hazards.length !== 'number' || state.hazards.length < 0 || !Number.isFinite(state.hazards.length) || !Number.isSafeInteger(state.hazards.length)) {
      if (typeof console !== 'undefined') {
        console.error('[ERROR] state.hazards was invalid at start of update, forcibly resetting to []', { hazards: state.hazards, state });
        console.trace('[TRACE] Corruption detected at start of update');
      }
      state.hazards = [];
    }
  state.audioEvents = [];
  if (state.phase === 'boot') { updateBoot(state, dt); return; }
  if (state.phase === 'dead') { updateDead(state, dt); return; }
  updatePlaying(state, dt);
}

function updateBoot(state: GameState, dt: number): void {
  state.bootTimer += dt;
  const lineInterval = 0.22;
  const targetIndex = Math.min(
    Math.floor(state.bootTimer / lineInterval),
    BOOT_LINES.length
  );
  while (state.bootLineIndex < targetIndex) {
    state.bootLines.push(BOOT_LINES[state.bootLineIndex]);
    state.bootLineIndex++;
  }
  if (state.bootLineIndex >= BOOT_LINES.length) {
    state.bootDone = true;
    state.promptBlinkTimer += dt;
    if (state.promptBlinkTimer > 0.48) {
      state.promptBlinkTimer = 0;
      state.promptBlink = !state.promptBlink;
    }
  }
}

function updateDead(state: GameState, dt: number): void {
  state.deathFlash = Math.max(0, state.deathFlash - dt);
  updateParticles(state, dt);
  updateScorePopups(state, dt);
  updateUmbrellaSlides(state, dt);
}

function updatePlaying(state: GameState, dt: number): void {
    // Global hazards array validation/repair at start of frame
    if (!Array.isArray(state.hazards) || typeof state.hazards.length !== 'number' || state.hazards.length < 0 || !Number.isFinite(state.hazards.length) || !Number.isSafeInteger(state.hazards.length)) {
      if (typeof console !== 'undefined') {
        console.error('[ERROR] state.hazards was invalid at start of updatePlaying, forcibly resetting to []', { hazards: state.hazards, state });
        console.trace('[TRACE] Corruption detected at start of updatePlaying');
      }
      state.hazards = [];
    }
  state.elapsed += dt;
  updatePowerUpTimers(state, dt);

  // Keep traveler's standing position pinned to the top of static ground.
  state.travelerBaseY = computeTravelerBaseY(state);
  if (!state.isJumping) {
    state.travelerY = state.travelerBaseY;
    state.travelerVY = 0;
  }

  // Difficulty ramp every 15s
  const newLevel = Math.floor(state.elapsed / 15);
  if (newLevel > state.difficultyLevel) {
    state.difficultyLevel = newLevel;
    state.spawnInterval = Math.max(0.22, 1.6 - newLevel * 0.13);
    state.levelUpTimer = 2.5;
    state.levelUpText = `// LEVEL ${newLevel + 1} STORM INTENSIFYING //`;
    state.audioEvents.push({ kind: 'levelup' });
    // Rebuild the particle field and update cloud visuals for the new level
    // Clear and respawn clouds to match new level data
    state.clouds = [];
    state.cloudIdCounter = 0;
    maintainClouds(state);
    if (typeof window !== 'undefined') {
      if (typeof (window as any).initParticleSystem === 'function') {
        (window as any).initParticleSystem(state);
      }
      if (typeof (window as any).updateCloudEmitPoints === 'function') {
        (window as any).updateCloudEmitPoints(state);
      }
    }
  }
  if (state.levelUpTimer > 0) state.levelUpTimer -= dt;

  // Score per second
  state.scoreTimer += dt;
  if (state.scoreTimer >= 1.0) {
    state.scoreTimer -= 1.0;
    state.score += scoreWithModifiers(state, 10 + state.difficultyLevel * 2);
  }

  // Combo decay
  if (state.combo > 0) {
    state.comboTimer += dt;
    if (state.comboTimer > 3.5) { state.combo = 0; state.comboTimer = 0; }
  }

  // Wind
  state.windChangeTimer -= dt;
  if (state.windChangeTimer <= 0) {
    state.windX = (Math.random() - 0.5) * 60 * (1 + state.difficultyLevel * 0.15);
    state.windChangeTimer = 4 + Math.random() * 7;
  }

  // Parallax
  state.groundOffset = (state.groundOffset + 55 * dt) % 120;
  state.bgStarOffset = (state.bgStarOffset + 10 * dt) % Math.max(1, state.H);

  // Traveler automatic left-right movement — ramps with both level and elapsed time
  const levelSpeed = 120 + state.difficultyLevel * 24;
  const timeSpeedBoost = Math.min(140, state.elapsed * 2.2);
  const maxSpeed = Math.min(420, levelSpeed + timeSpeedBoost);
  state.travelerMaxSpeed = maxSpeed;
  if (state.travelerVX === 0) state.travelerVX = maxSpeed; // start moving on game begin

  const margin = 20;
  state.travelerX += state.travelerVX * dt;
  if (state.travelerX >= state.W - margin) {
    state.travelerX = state.W - margin;
    state.travelerVX = -maxSpeed;
  } else if (state.travelerX <= margin) {
    state.travelerX = margin;
    state.travelerVX = maxSpeed;
  }
  // Keep speed magnitude current even mid-traverse (difficulty ramp)
  state.travelerVX = Math.sign(state.travelerVX) * maxSpeed;

  // Traveler jumping — fires at random intervals that shrink with difficulty
  // Interval range: starts ~2–4s, tightens to ~0.6–1.4s at high levels
  const jumpIntervalMin = Math.max(0.5,  2.0 - state.difficultyLevel * 0.18);
  const jumpIntervalMax = Math.max(1.2,  4.2 - state.difficultyLevel * 0.28);
  const gravity = 900; // px/s²

  state.jumpTimer -= dt;
  if (state.jumpTimer <= 0 && !state.isJumping) {
    // Raise jump ceiling over time while keeping early jumps readable.
    const jumpMinRatio = 0.10;
    const jumpMaxRatio = Math.min(0.75, 0.20 + state.difficultyLevel * 0.015 + state.elapsed * 0.0008);
    const jumpH = state.H * (jumpMinRatio + Math.random() * (jumpMaxRatio - jumpMinRatio));
    state.travelerVY = -Math.sqrt(2 * gravity * jumpH); // v = sqrt(2gh)
    state.isJumping = true;
    state.jumpTimer = jumpIntervalMin + Math.random() * (jumpIntervalMax - jumpIntervalMin);
  }

  if (state.isJumping) {
    state.travelerVY += gravity * dt;
    state.travelerY  += state.travelerVY * dt;

    if (state.travelerY >= state.travelerBaseY) {
      state.travelerY  = state.travelerBaseY;
      state.travelerVY = 0;
      state.isJumping  = false;
    }
  }
  const lerpSpeed = 20;
  const umbrellaLineH = computeUmbrellaLineH(state.W);
  const handleAnchorOffset = umbrellaLineH * (UMBRELLA_CANOPY_LINES - 1 + UMBRELLA_HANDLE_LINES);
  state.umbrellaX += (state.pointerX - state.umbrellaX) * Math.min(1, lerpSpeed * dt);
  state.umbrellaY += ((state.pointerY - handleAnchorOffset) - state.umbrellaY) * Math.min(1, lerpSpeed * dt);
  const hw = state.umbrellaW / 2;
  state.umbrellaX = Math.max(hw + 4, Math.min(state.W - hw - 4, state.umbrellaX));
  const umbrellaBounds = computeUmbrellaYBounds(state);
  state.umbrellaY = Math.max(umbrellaBounds.minY, Math.min(umbrellaBounds.maxY, state.umbrellaY));
  
  // Clouds — maintain count, update drift, fire per-cloud
  maintainClouds(state);
  updateClouds(state, dt);

  // Update hazards
  const groundY = computeGroundY(state);
  const hazardSpeedFactor = state.slowMotionActive ? 0.5 : 1;
  let hazardWriteIndex = 0;
  for (let i = 0; i < state.hazards.length; i++) {
    const h = state.hazards[i]!;
    let removeHazard = false;

    h.prevX = h.x;
    h.prevY = h.y;

    h.x += (h.vx + state.windX * 0.3) * dt * hazardSpeedFactor;
    h.y += h.vy * dt * hazardSpeedFactor;

    // Umbrella collision - no score/combo on direct hit, particles handle scoring
    if (!h.blocked) {
      if (hazardIntersectsUmbrella(state, h.prevX, h.prevY, h.x, h.y)) {
        h.blocked = true;
        const impact = computeUmbrellaImpactPoint(state, h.prevX, h.prevY, h.x, h.y);

        // Always spawn splash particles regardless of hazard type
        const umbrellaImpactScale = h.type === 'snow' ? 1.7 : h.type === 'hail' ? 1.3 : 1.35;
        spawnSplash(state, impact.x, impact.y, h.type, false, umbrellaImpactScale, h.glyph);

        // Additional logic for rain slides
        if (h.type === 'rain') {
          const slideCount = Math.random() < 0.55 ? 2 : 1;
          for (let s = 0; s < slideCount; s++) {
            const jitter = (Math.random() - 0.5) * 14;
            const { umbrellaArtStartX, umbrellaArtWidth, umbrellaArtStartY, umbrellaArtLineH } = state;
            const artCenterX = umbrellaArtStartX + umbrellaArtWidth / 2;
            const halfW = umbrellaArtWidth / 2;
            const peakY = umbrellaArtStartY + 1 * umbrellaArtLineH;
            const rimY = umbrellaArtStartY + (UMBRELLA_CANOPY_LINES - 1) * umbrellaArtLineH;
            const hitX = impact.x + jitter;
            const xFrac = Math.min(1, Math.abs(hitX - artCenterX) / halfW);
            const surfaceY = peakY + xFrac * (rimY - peakY);
            spawnUmbrellaSlide(state, hitX, surfaceY, h.type);
          }
        }

        // No score/combo increment here - particles handle scoring when they hit umbrella
        state.audioEvents.push({ kind: 'block', hazardType: h.type });
        removeHazard = true;
      }
    }

    // Traveler hit
    if (!removeHazard && !h.blocked) {
      const dx = Math.abs(h.x - state.travelerX);
      if (dx < 22 && h.y >= state.travelerY - 8 && h.y <= state.travelerY + 38) {
        if (!state.shieldActive && state.hitCooldown <= 0) {
          let damage = 1;
          if (h.type === 'hail') damage = 2;
          const willDie = state.hp - damage <= 0;
          state.hp = Math.max(0, state.hp - damage);
          state.hitCooldown = 1.2;
          state.deathFlash = 1.2;
          state.combo = 0;
          state.comboTimer = 0;
          spawnSplash(state, h.x, h.y, h.type, true, 1, h.glyph);
          spawnHeartExplosion(state, h.x, h.y - 12, willDie);
          state.audioEvents.push({ kind: 'hit' });
          if (state.hp <= 0) {
            state.phase = 'dead';
            state.deathFlash = 1.0;
            state.audioEvents.push({ kind: 'death' });
          }
        }
        removeHazard = true;
      }
    }

    // Ground collision — spawn splash before removing (no score)
    if (!removeHazard && h.y > groundY) {
      // Only spawn if not already blocked (umbrella hit)
      if (!h.blocked) {
        // Missing hazards does not break combo; combo decay is timer-based.
        spawnSplash(state, h.x, h.y, h.type, false, 1, h.glyph);
      }
      removeHazard = true;
    }

    if (!removeHazard) {
      state.hazards[hazardWriteIndex++] = h;
    } else {
      releaseHazard(h);
    }
  }
  // Clamp hazardWriteIndex to a valid integer before assigning
  let safeHazardWriteIndex = Number.isFinite(hazardWriteIndex) && hazardWriteIndex >= 0 ? Math.floor(hazardWriteIndex) : 0;
  if (safeHazardWriteIndex !== hazardWriteIndex) {
    if (typeof console !== 'undefined') {
      console.error('[ERROR] Clamped invalid hazardWriteIndex in updatePlaying', { hazardWriteIndex, safeHazardWriteIndex, hazards: state.hazards, state });
    }
  }
  state.hazards.length = safeHazardWriteIndex;
  // Repair hazards array if its length is invalid before pushing
  if (!Array.isArray(state.hazards) || typeof state.hazards.length !== 'number' || state.hazards.length < 0 || !Number.isFinite(state.hazards.length)) {
    if (typeof console !== 'undefined') {
      console.error('[ERROR] state.hazards was invalid before push, forcibly resetting to []', { hazards: state.hazards, state });
    }
    state.hazards = [];
  }

  if (state.hitCooldown > 0) state.hitCooldown -= dt;
  if (state.deathFlash > 0) state.deathFlash -= dt;

  updateParticles(state, dt);
  updateGroundSnow(state, dt);
  updatePowerUpPickups(state, dt, powerUpRuntime);
  maybeSpawnComboPowerUp(state);
  updateScorePopups(state, dt);
  updateUmbrellaSlides(state, dt);
  updateHeartExplosions(state, dt);
}

function updateParticles(state: GameState, dt: number): void {
  const groundY = computeGroundY(state);
  let particleWriteIndex = 0;
  for (let i = 0; i < state.particles.length; i++) {
    const p = state.particles[i]!;
    let removeParticle = false;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 140 * dt;
    p.life -= dt / p.maxLife;
    
    // Check if particle hit the umbrella
    if (pointHitsUmbrella(state, p.x, p.y)) {
      // Particle hit the umbrella - increment score/combo
      state.combo++;
      state.comboTimer = 0;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      const basePts = (p.type === 'hail' ? 15 : p.type === 'snow' ? 8 : 5) * Math.max(1, state.combo);
      const pts = scoreWithModifiers(state, basePts);
      state.score += pts;
      const popupX = p.x + (Math.random() - 0.5) * 36;
      const popupY = Math.max(24, state.umbrellaY - 34);
      spawnScorePopup(state, popupX, popupY, pts, state.combo);
      state.audioEvents.push({ kind: 'block', hazardType: p.type });
      // Remove particle on hit
      removeParticle = true;
    }

    // Upward-moving splash particles can strike cloud bodies and create a small burst.
    if (!removeParticle && !p.fromCloudHit && p.vy < 0 && pointHitsAnyCloud(state, p.x, p.y)) {
      spawnCloudHitBurst(state, p.x, p.y, p.type);
      removeParticle = true;
    }

    // Check if snow particle hit the ground
    if (!removeParticle && p.type === 'snow' && p.y >= groundY) {
      state.groundSnow.push({ x: p.x, y: groundY, life: 4 + Math.random() * 3 }); // persist 4-7 seconds
      removeParticle = true;
    }

    if (!removeParticle && p.life <= 0) {
      removeParticle = true;
    }

    if (!removeParticle) {
      state.particles[particleWriteIndex++] = p;
    } else {
      releaseParticle(p);
    }
  }
  state.particles.length = particleWriteIndex;
}

function updateGroundSnow(state: GameState, dt: number): void {
  let writeIndex = 0;
  for (let i = 0; i < state.groundSnow.length; i++) {
    const snow = state.groundSnow[i]!;
    snow.life -= dt;
    if (snow.life > 0) {
      state.groundSnow[writeIndex++] = snow;
    }
  }
  state.groundSnow.length = writeIndex;
}

function updateHeartExplosions(state: GameState, dt: number): void {
  let writeIndex = 0;
  for (let i = 0; i < state.heartExplosions.length; i++) {
    const h = state.heartExplosions[i]!;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.vy += 200 * dt; // gravity
    h.life -= dt / h.maxLife;

    if (h.life > 0) {
      state.heartExplosions[writeIndex++] = h;
    }
  }
  state.heartExplosions.length = writeIndex;
}

function updateScorePopups(state: GameState, dt: number): void {
  let writeIndex = 0;
  for (let i = 0; i < state.scorePopups.length; i++) {
    const p = state.scorePopups[i]!;
    const riseSpeed = 26 + (1 - p.life) * 18;
    p.y -= riseSpeed * dt;
    p.life -= dt * 1.6;
    if (p.life > 0) {
      state.scorePopups[writeIndex++] = p;
    }
  }
  state.scorePopups.length = writeIndex;

  // Keep nearby popup labels readable by gently separating overlapping entries.
  for (let i = 0; i < writeIndex; i++) {
    const a = state.scorePopups[i]!;
    for (let j = i + 1; j < writeIndex; j++) {
      const b = state.scorePopups[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const overlapX = SCORE_POPUP_MIN_DISTANCE_X - Math.abs(dx);
      const overlapY = SCORE_POPUP_MIN_DISTANCE_Y - Math.abs(dy);
      if (overlapX <= 0 || overlapY <= 0) continue;

      const pushX = overlapX * 0.5;
      const pushY = overlapY * 0.5;
      const dirX = dx >= 0 ? 1 : -1;
      const dirY = dy >= 0 ? 1 : -1;

      a.x -= dirX * pushX;
      b.x += dirX * pushX;
      // Bias the separation upward so labels naturally stack.
      a.y -= Math.max(1, pushY * 0.55);
      b.y += dirY * Math.max(1, pushY * 0.45);
    }

    a.x = Math.max(10, Math.min(state.W - 10, a.x));
    a.y = Math.max(18, a.y);
  }
}

function updateUmbrellaSlides(state: GameState, dt: number): void {
  const { umbrellaArtStartX, umbrellaArtWidth, umbrellaArtStartY, umbrellaArtLineH } = state;

  const artCenterX = umbrellaArtStartX + umbrellaArtWidth / 2;
  const halfW      = umbrellaArtWidth / 2;
  const peakY      = umbrellaArtStartY + 1 * umbrellaArtLineH;
  const rimY       = umbrellaArtStartY + (UMBRELLA_CANOPY_LINES - 1) * umbrellaArtLineH;

  let writeIndex = 0;
  for (let i = 0; i < state.umbrellaSlides.length; i++) {
    const s = state.umbrellaSlides[i]!;
    s.life -= dt / s.maxLife;
    if (s.life <= 0) continue;

    if (s.phase === 'slide') {
      if (halfW > 0) {
        // Move in canopy-local space so drops remain attached as umbrella moves.
        if (s.dir === 0) {
          s.y = Math.min(rimY, s.y + s.slideSpeed * dt * 0.75);
          s.canopyT = Math.min(1, Math.max(0, (s.y - peakY) / (rimY - peakY)));
          s.x = artCenterX;
        } else {
          s.canopyT = Math.min(1, s.canopyT + (s.slideSpeed * dt) / halfW);
          s.x = artCenterX + s.dir * s.canopyT * halfW;
          s.y = peakY + s.canopyT * (rimY - peakY);
        }
      }

      const pastEdge = s.canopyT >= 1;
      if (pastEdge) {
        s.edgeX = s.dir === 0 ? artCenterX : (s.dir === -1 ? umbrellaArtStartX : umbrellaArtStartX + umbrellaArtWidth);
        s.edgeY = rimY;
        s.x = s.edgeX;
        s.y = s.edgeY;
        s.phase = 'drip';
        s.vy = 80 + Math.random() * 50;
        s.life = Math.max(s.life, 0.6);
        s.maxLife = Math.max(s.maxLife, 0.35);
      }
    } else {
      // Drip: fall freely with gravity, tiny outward drift
      s.vy += 260 * dt;
      s.y  += s.vy * dt;
      s.x  += s.dir * 10 * dt;
    }

    state.umbrellaSlides[writeIndex++] = s;
  }
  state.umbrellaSlides.length = writeIndex;
}

function updateClouds(state: GameState, dt: number): void {
  const { W, H, difficultyLevel: level } = state;
  const minCloudY = H * 0.05;
  const maxCloudY = H * 0.15;
  const updateStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let totalBursts = 0;
  let totalHazardsSpawned = 0;
  const respawns: Array<{ spawnX: number; type: Cloud['type'] }> = [];
  let writeIndex = 0;

  for (let i = 0; i < state.clouds.length; i++) {
    const c = state.clouds[i]!;
    c.x += c.vx * dt;
    c.x += state.windX * 0.04 * dt;
    c.y += c.vy * dt;
    c.y = Math.max(minCloudY, Math.min(maxCloudY, c.y));
    const pad = 140;
    const exitedRight = c.vx > 0 && c.x > W + pad;
    const exitedLeft = c.vx < 0 && c.x < -pad;
    if (exitedRight || exitedLeft) {
      const spawnX = exitedRight ? -pad : W + pad;
      respawns.push({ spawnX, type: c.type });
      continue;
    }
    if (c.flashTimer > 0) c.flashTimer = Math.max(0, c.flashTimer - dt);

    // Per-cloud independent spawn — each cloud fires on its own cadence
    c.spawnTimer += dt;
    // Update interval in case difficulty changed
    c.spawnInterval = cloudSpawnInterval(level, c.type);
    if (c.spawnTimer >= c.spawnInterval) {
      c.spawnTimer -= c.spawnInterval;
      // Burst: rain fires 1-2 drops, snow 1, hail 1 (but hail is bigger)
      const burst = c.type === 'rain' && level >= 3 ? 2 : 1;
      totalBursts++;
      for (let b = 0; b < burst; b++) {
        spawnHazardFromCloud(state, c);
        totalHazardsSpawned++;
      }
    }

    state.clouds[writeIndex++] = c;
  }

  state.clouds.length = writeIndex;
  for (let i = 0; i < respawns.length; i++) {
    const respawn = respawns[i]!;
    spawnCloud(state, respawn.spawnX, respawn.type);
  }
  const updateEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (typeof window !== 'undefined' && (window as any).__DEBUG_GAME__ && ((updateEnd - updateStart) > 2 || totalBursts > 0)) {
    console.log(`[PROFILE] updateClouds: clouds=${state.clouds.length}, bursts=${totalBursts}, hazardsSpawned=${totalHazardsSpawned}, time=${(updateEnd - updateStart).toFixed(2)}ms`);
  }
}

// ─── Input handlers ───────────────────────────────────────────────────────────

export function handleKeyDown(state: GameState, key: string): void {
  if (state.phase === 'boot' && state.bootDone) {
    if (key === 'Enter' || key === ' ') startGame(state);
  }
  if (state.phase === 'dead') {
    if (key === 'r' || key === 'R' || key === 'Enter' || key === ' ') restartGame(state);
  }
  // Track movement keys during play
  if (state.phase === 'playing') {
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'a' || key === 'A' || key === 'd' || key === 'D') {
      state.keysHeld.add(key);
    }
  }
}

export function handleKeyUp(state: GameState, key: string): void {
  state.keysHeld.delete(key);
}

export function handlePointerMove(state: GameState, x: number, y: number): void {
  // Click-drag behavior: only update target while pointer is held down.
  if (!state.pointerDown) return;
  state.pointerX = x;
  state.pointerY = y;
}

export function handlePointerDown(state: GameState, x: number, y: number): void {
  state.pointerDown = true;
  state.pointerX = x;
  state.pointerY = y;
  if (state.phase === 'boot' && state.bootDone) startGame(state);
  if (state.phase === 'dead') restartGame(state);
}

export function handlePointerUp(state: GameState): void {
  state.pointerDown = false;
}

function startGame(state: GameState): void {
  state.phase = 'playing';
  state.umbrellaVY = 0;
  state._umbrellaActualY = state.umbrellaY;
  if (typeof window !== 'undefined' && typeof (window as any).initParticleSystem === 'function') {
    (window as any).initParticleSystem(state);
  }
}

function restartGame(state: GameState): void {
  const { W, H } = state;
  const fresh = createInitialState(W, H);
  fresh.phase = 'playing';
  fresh.bootDone = true;
  fresh.keysHeld = state.keysHeld; // preserve live key state across restart
  fresh.keysHeld.clear();
  Object.assign(state, fresh);
  state.umbrellaVY = 0;
  state._umbrellaActualY = state.umbrellaY;
  if (typeof window !== 'undefined' && typeof (window as any).initParticleSystem === 'function') {
    (window as any).initParticleSystem(state);
  }
  if (typeof window !== 'undefined' && typeof (window as any).updateCloudEmitPoints === 'function') {
    (window as any).updateCloudEmitPoints(state);
  }
}
