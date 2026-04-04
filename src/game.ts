// ─── Types ───────────────────────────────────────────────────────────────────

export type GamePhase = 'boot' | 'playing' | 'dead';

export interface Hazard {
  id: number;
  x: number;
  y: number;
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
}

export interface ScorePopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
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
  // -1 = sliding left edge, +1 = sliding right edge
  dir: -1 | 1;
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
}

export interface Cloud {
  id: number;
  x: number;          // centre x
  y: number;          // centre y (stays in top strip)
  vx: number;         // horizontal drift speed (px/s)
  type: 'rain' | 'snow' | 'hail';
  // pulsing flash when it emits a hazard
  flashTimer: number;
  // width in pixels (written by renderer so spawn x is accurate)
  artW: number;
  // per-cloud independent spawn cadence
  spawnTimer: number;
  spawnInterval: number;
}

export type AudioEvent =
  | { kind: 'block'; hazardType: 'rain' | 'snow' | 'hail' }
  | { kind: 'hit' }
  | { kind: 'levelup' }
  | { kind: 'death' };

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

  // umbrella rain slides
  umbrellaSlides: UmbrellaSlide[];
  umbrellaSlideIdCounter: number;

  // score popups
  scorePopups: ScorePopup[];
  scorePopupIdCounter: number;

  // scroll / parallax
  groundOffset: number;
  bgStarOffset: number;

  // scoring
  score: number;
  scoreTimer: number;
  combo: number;
  comboTimer: number;

  // health
  hp: number;
  maxHp: number;
  hitCooldown: number;

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
  rain: ['|', '/', '\u254e', '\u254f', '\xa6'],
  snow: ['*', '\u2744', '\u2217', '\u2726', '\u204e'],
  hail: ['\u25c6', '\u25cf', '\u25a0', '\u25c9', '\u25c8'],
};

export const COLORS = {
  bg:          '#0d1117',
  green:       '#39d353',
  dimGreen:    '#1a6b27',
  brightGreen: '#57ff73',
  amber:       '#e6a817',
  brightAmber: '#ffc940',
  cyan:        '#56d4e0',
  red:         '#f44747',
  brightRed:   '#ff6b6b',
  white:       '#c9d1d9',
  dim:         '#484f58',
  dimmer:      '#2d333b',
  rain:        '#4fc3f7',
  rainDim:     '#1a5f7a',
  snow:        '#d0eeff',
  snowDim:     '#7ab8d4',
  hail:        '#cfd8dc',
  hailDim:     '#78909c',
  umbrella:    '#e6a817',
  umbrellaRim: '#b37d00',
  traveler:    '#39d353',
  ground:      '#161b22',
  groundLine:  '#21262d',
  groundText:  '#2d333b',
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

// ─── Init ─────────────────────────────────────────────────────────────────────

export function createInitialState(W: number, H: number): GameState {
  const travelerSize = Math.max(14, Math.min(22, W / 40));
  const baseY = Math.round(H * 0.84) - travelerSize * 2.95;
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

    umbrellaSlides: [],
    umbrellaSlideIdCounter: 0,

    scorePopups: [],
    scorePopupIdCounter: 0,

    groundOffset: 0,
    bgStarOffset: 0,

    score: 0,
    scoreTimer: 0,
    combo: 0,
    comboTimer: 0,

    hp: 5,
    maxHp: 5,
    hitCooldown: 0,

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

function computeGroundY(state: GameState): number {
  return Math.round(state.H * 0.84);
}

function computeTravelerBaseY(state: GameState): number {
  const travelerSize = Math.max(14, Math.min(22, state.W / 40));
  return computeGroundY(state) - travelerSize * 2.95;
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
  state.clouds.push({
    id: state.cloudIdCounter++,
    x,
    y: cloudY,
    vx: speed,
    type,
    flashTimer: 0,
    artW: 0,
    spawnTimer: Math.random() * 0.8, // stagger so they don't all fire at once
    spawnInterval: cloudSpawnInterval(level, type),
  });
}

/** Keep 3–6 clouds on screen, scaling with difficulty. Each type is represented. */
function maintainClouds(state: GameState): void {
  const { W, difficultyLevel: level } = state;
  const target = Math.min(6, 3 + Math.floor(level / 2));

  // Count existing types
  const typeCounts = { rain: 0, snow: 0, hail: 0 };
  for (const c of state.clouds) typeCounts[c.type]++;

  while (state.clouds.length < target) {
    // Prioritise types that are missing or underrepresented
    let type: 'rain' | 'snow' | 'hail';
    if (level < 2) {
      // Early game: only rain + snow
      type = typeCounts.rain <= typeCounts.snow ? 'rain' : 'snow';
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
    // Spread new clouds across the width
    const x = Math.random() * W;
    spawnCloud(state, x, type);
    typeCounts[type]++;
  }
}

/** Spawn one hazard from a specific cloud — called per-cloud from updateClouds. */
function spawnHazardFromCloud(state: GameState, cloud: Cloud): void {
  const { difficultyLevel: level, elapsed } = state;

  // X spread within the cloud body
  const spread = Math.max(cloud.artW * 0.4, 18);
  const x = cloud.x + (Math.random() - 0.5) * spread;
  // Y just below the cloud art (cloud.y is top of art, add ~artH approximation)
  const y = cloud.y + 28 + Math.random() * 8;

  const glyphs = HAZARD_GLYPHS[cloud.type];
  const glyph  = glyphs[Math.floor(Math.random() * glyphs.length)];

  const speedBase = 90 + level * 18 + elapsed * 0.4;
  const vy = speedBase * (0.8 + Math.random() * 0.4);
  const vx = (Math.random() - 0.5) * speedBase * 0.22 + state.windX * 0.5;
  const size = cloud.type === 'hail'
    ? 0.9 + Math.random() * 0.4
    : 0.7 + Math.random() * 0.3;

  state.hazards.push({
    id: state.hazardIdCounter++,
    x, y,
    vx, vy,
    type: cloud.type,
    glyph,
    blocked: false,
    size,
  });

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
  isHit = false
): void {
  const count = isHit ? 10 : (type === 'hail' ? 7 : type === 'snow' ? 4 : 2);
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
    glyphs = ['\xb7', '\u02d9', '\''];
  }
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.9;
    const speed = isHit ? (70 + Math.random() * 110) : (25 + Math.random() * 60);
    state.particles.push({
      id: state.particleIdCounter++,
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (isHit ? 50 : 12),
      life: 1,
      maxLife: isHit ? (0.5 + Math.random() * 0.35) : (0.28 + Math.random() * 0.2),
      glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
      color,
    });
  }
}

function spawnScorePopup(
  state: GameState,
  x: number, y: number,
  points: number, combo: number
): void {
  const comboStr = combo > 1 ? ` x${combo}` : '';
  state.scorePopups.push({
    id: state.scorePopupIdCounter++,
    x, y,
    text: `+${points}${comboStr}`,
    color: combo >= 5 ? COLORS.comboGold : combo >= 3 ? COLORS.brightAmber : COLORS.cyan,
    life: 1,
  });
}

/**
 * The umbrella art rows and their approximate x-offsets (in character columns)
 * for the canopy surface. Row 0 = first line of art ("|").
 * The canopy rim is rows 1-6. We model the surface as the slope from the peak
 * (row 1 centre) down to the left/right tips (row 6 ends).
 *
 * All pixel geometry is computed from state.umbrellaArtStartX/Width/StartY/LineH
 * which the renderer writes each frame before update() is called.
 */
function spawnUmbrellaSlide(state: GameState, hitX: number, hitY: number): void {
  const { umbrellaArtStartX, umbrellaArtWidth, umbrellaArtStartY, umbrellaArtLineH } = state;

  // If renderer hasn't written art geometry yet, skip
  if (umbrellaArtWidth === 0) return;

  const artRight = umbrellaArtStartX + umbrellaArtWidth;

  // The canopy surface spans art rows 1-6 (0-indexed).
  // Peak is at row 1 (top of dome), rim/tips are at row 6.
  // Left tip of row 6 art: "'" is the first char at col 0 of that line.
  // Right tip: "'" is the last char. We approximate tips as artLeft and artRight.
  const peakY   = umbrellaArtStartY + 1 * umbrellaArtLineH; // row 1
  const rimY    = umbrellaArtStartY + 6 * umbrellaArtLineH; // row 6 (rim)

  // Pick side based on hit position relative to art centre
  const artCenterX = umbrellaArtStartX + umbrellaArtWidth / 2;
  const dir: -1 | 1 = hitX <= artCenterX ? -1 : 1;

  // Edge x = left or right tip of the canopy art
  const edgeX = dir === -1 ? umbrellaArtStartX : artRight;
  const edgeY = rimY;

  // The surface slope: as x moves from centre to edge, y moves from peakY to rimY.
  // We use this to compute starting y on the surface at hitX.
  const halfW = umbrellaArtWidth / 2;
  const xFrac = Math.min(1, Math.abs(hitX - artCenterX) / halfW);
  const surfaceY = peakY + xFrac * (rimY - peakY);

  const slideGlyphs = ['|', '\'', '\u00b7', '\u254e'];
  const glyph = slideGlyphs[Math.floor(Math.random() * slideGlyphs.length)];

  // Slide speed proportional to remaining distance to edge (steeper = faster)
  const distToEdge = Math.abs(hitX - edgeX);
  const slideSpeed = 55 + distToEdge * 1.1 + Math.random() * 25;

  state.umbrellaSlides.push({
    id: state.umbrellaSlideIdCounter++,
    x: hitX,
    y: surfaceY,
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
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function update(state: GameState, dt: number): void {
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
  state.deathFlash = Math.max(0, state.deathFlash - dt * 1.5);
  updateParticles(state, dt);
  updateScorePopups(state, dt);
  updateUmbrellaSlides(state, dt);
}

function updatePlaying(state: GameState, dt: number): void {
  state.elapsed += dt;

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
  }
  if (state.levelUpTimer > 0) state.levelUpTimer -= dt;

  // Score per second
  state.scoreTimer += dt;
  if (state.scoreTimer >= 1.0) {
    state.scoreTimer -= 1.0;
    state.score += 10 + state.difficultyLevel * 2;
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

  state.jumpTimer -= dt;
  if (state.jumpTimer <= 0 && !state.isJumping) {
    // Launch the jump
    const jumpH = state.H * (0.10 + Math.random() * 0.10); // 10–20% of screen height
    state.travelerVY = -Math.sqrt(2 * 900 * jumpH);         // v = sqrt(2gh)
    state.isJumping = true;
    state.jumpTimer = jumpIntervalMin + Math.random() * (jumpIntervalMax - jumpIntervalMin);
  }

  if (state.isJumping) {
    const gravity = 900; // px/s²
    state.travelerVY += gravity * dt;
    state.travelerY  += state.travelerVY * dt;

    if (state.travelerY >= state.travelerBaseY) {
      state.travelerY  = state.travelerBaseY;
      state.travelerVY = 0;
      state.isJumping  = false;
    }
  }
  const lerpSpeed = 20;
  const hudH = 34;
  state.umbrellaX += (state.pointerX - state.umbrellaX) * Math.min(1, lerpSpeed * dt);
  state.umbrellaY += ((state.pointerY - 24) - state.umbrellaY) * Math.min(1, lerpSpeed * dt);
  const hw = state.umbrellaW / 2;
  state.umbrellaX = Math.max(hw + 4, Math.min(state.W - hw - 4, state.umbrellaX));
  const umbrellaMaxY = state.travelerBaseY - 35;
  state.umbrellaY = Math.max(hudH + 8, Math.min(umbrellaMaxY, state.umbrellaY));

  // Clouds — maintain count, update drift, fire per-cloud
  maintainClouds(state);
  updateClouds(state, dt);

  // Update hazards
  const groundY = computeGroundY(state);
  const toRemove = new Set<number>();

  for (let i = 0; i < state.hazards.length; i++) {
    if (toRemove.has(i)) continue;
    const h = state.hazards[i];

    h.x += (h.vx + state.windX * 0.3) * dt;
    h.y += h.vy * dt;

    // Umbrella collision
    if (!h.blocked) {
      const ux0 = state.umbrellaX - state.umbrellaW / 2;
      const ux1 = state.umbrellaX + state.umbrellaW / 2;
      const uyTop = state.umbrellaY;
      const uyBot = state.umbrellaY + state.umbrellaH + 12;
      if (h.x >= ux0 && h.x <= ux1 && h.y >= uyTop && h.y <= uyBot) {
        h.blocked = true;
        // Rain slides off the canopy; hail/snow still splash
        if (h.type === 'rain') {
          // Spawn 1–2 slide drops per rain hit for a streaming feel
          const slideCount = Math.random() < 0.55 ? 2 : 1;
          for (let s = 0; s < slideCount; s++) {
            // Slightly vary hit x so multiple drops look natural
            const jitter = (Math.random() - 0.5) * 14;
            spawnUmbrellaSlide(state, h.x + jitter, h.y);
          }
          // Small minimal splash so impact is still readable
          spawnSplash(state, h.x, h.y, h.type, false);
        } else {
          spawnSplash(state, h.x, h.y, h.type, false);
        }
        state.combo++;
        state.comboTimer = 0;
        const pts = (h.type === 'hail' ? 15 : h.type === 'snow' ? 8 : 5) * Math.max(1, state.combo);
        state.score += pts;
        spawnScorePopup(state, h.x, h.y - 10, pts, state.combo);
        state.audioEvents.push({ kind: 'block', hazardType: h.type });
        toRemove.add(i);
        continue;
      }
    }

    // Traveler hit
    if (!h.blocked) {
      const dx = Math.abs(h.x - state.travelerX);
      if (dx < 22 && h.y >= state.travelerY - 8 && h.y <= state.travelerY + 38) {
        if (state.hitCooldown <= 0) {
          state.hp = Math.max(0, state.hp - 1);
          state.hitCooldown = 1.2;
          state.deathFlash = 0.5;
          state.combo = 0;
          state.comboTimer = 0;
          spawnSplash(state, h.x, h.y, h.type, true);
          state.audioEvents.push({ kind: 'hit' });
          if (state.hp <= 0) {
            state.phase = 'dead';
            state.deathFlash = 1.0;
            state.audioEvents.push({ kind: 'death' });
          }
        }
        toRemove.add(i);
        continue;
      }
    }

    // Off-screen
    if (h.y > groundY + 40 || h.x < -50 || h.x > state.W + 50) {
      toRemove.add(i);
    }
  }

  const removeArr = Array.from(toRemove).sort((a, b) => b - a);
  for (const idx of removeArr) state.hazards.splice(idx, 1);

  if (state.hitCooldown > 0) state.hitCooldown -= dt;

  updateParticles(state, dt);
  updateScorePopups(state, dt);
  updateUmbrellaSlides(state, dt);
}

function updateParticles(state: GameState, dt: number): void {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 140 * dt;
    p.life -= dt / p.maxLife;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function updateScorePopups(state: GameState, dt: number): void {
  for (let i = state.scorePopups.length - 1; i >= 0; i--) {
    const p = state.scorePopups[i];
    p.y -= 30 * dt;
    p.life -= dt * 1.6;
    if (p.life <= 0) state.scorePopups.splice(i, 1);
  }
}

function updateUmbrellaSlides(state: GameState, dt: number): void {
  const { umbrellaArtStartX, umbrellaArtWidth, umbrellaArtStartY, umbrellaArtLineH } = state;

  const artCenterX = umbrellaArtStartX + umbrellaArtWidth / 2;
  const halfW      = umbrellaArtWidth / 2;
  const peakY      = umbrellaArtStartY + 1 * umbrellaArtLineH;
  const rimY       = umbrellaArtStartY + 6 * umbrellaArtLineH;

  for (let i = state.umbrellaSlides.length - 1; i >= 0; i--) {
    const s = state.umbrellaSlides[i];
    s.life -= dt / s.maxLife;
    if (s.life <= 0) { state.umbrellaSlides.splice(i, 1); continue; }

    if (s.phase === 'slide') {
      s.x += s.dir * s.slideSpeed * dt;

      // Y tracks the actual canopy slope: linear from peakY at centre to rimY at edge
      if (halfW > 0) {
        const xFrac = Math.min(1, Math.abs(s.x - artCenterX) / halfW);
        s.y = peakY + xFrac * (rimY - peakY);
      }

      const pastEdge = s.dir === -1 ? s.x <= s.edgeX : s.x >= s.edgeX;
      if (pastEdge) {
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
  }
}

function updateClouds(state: GameState, dt: number): void {
  const { W, difficultyLevel: level } = state;
  for (let i = state.clouds.length - 1; i >= 0; i--) {
    const c = state.clouds[i];
    c.x += c.vx * dt;
    c.x += state.windX * 0.04 * dt;
    const pad = 140;
    const exitedRight = c.vx > 0 && c.x > W + pad;
    const exitedLeft = c.vx < 0 && c.x < -pad;
    if (exitedRight || exitedLeft) {
      const spawnX = exitedRight ? -pad : W + pad;
      const nextType = c.type;
      state.clouds.splice(i, 1);
      spawnCloud(state, spawnX, nextType);
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
      for (let b = 0; b < burst; b++) spawnHazardFromCloud(state, c);
    }
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
}

function restartGame(state: GameState): void {
  const { W, H } = state;
  const fresh = createInitialState(W, H);
  fresh.phase = 'playing';
  fresh.bootDone = true;
  fresh.keysHeld = state.keysHeld; // preserve live key state across restart
  fresh.keysHeld.clear();
  Object.assign(state, fresh);
}
