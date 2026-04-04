import './style.css';
import {
  createInitialState,
  update,
  handleKeyDown,
  handleKeyUp,
  handlePointerMove,
  handlePointerDown,
  handlePointerUp,
  computeUmbrellaYBounds,
  COLORS,
  type GameState,
  type AudioEvent,
  type Cloud,
} from './game.ts';
import { PretextRenderer } from './pretext-renderer.ts';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const renderer = new PretextRenderer();

let dpr = window.devicePixelRatio || 1;
let W = 0;
let H = 0;

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width  = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.scale(dpr, dpr);
  if (state) {
    state.W = W;
    state.H = H;
    state.travelerX = W * 0.38;
    const travelerSize = Math.max(14, Math.min(22, W / 40));
    const baseY = Math.round(H * 0.84) - travelerSize * 2.95;
    state.travelerY = baseY;
    state.travelerBaseY = baseY;
    state.umbrellaW = Math.max(80, Math.min(220, W * 0.18));
    state.umbrellaVY = 0;
    state._umbrellaActualY = state.umbrellaY;
    buildAsciiBackground();
  }
}

const FONT_FAMILY = '"IBM Plex Mono", monospace';
function fnt(size: number, weight: 400 | 700 = 400): string {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}
function sz(base: number, minV: number, maxV: number): number {
  return Math.max(minV, Math.min(maxV, base));
}

let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext | null {
  if (!audioCtx) { try { audioCtx = new AudioContext(); } catch { return null; } }
  return audioCtx;
}
function resumeAudio(): void {
  const a = getAudio();
  if (a && a.state === 'suspended') a.resume();
}
function playTone(freq: number, type: OscillatorType, gainVal: number, duration: number, startTime?: number): void {
  const a = getAudio(); if (!a) return;
  const osc = a.createOscillator(); const gain = a.createGain();
  osc.connect(gain); gain.connect(a.destination);
  osc.type = type; osc.frequency.value = freq;
  const t = startTime ?? a.currentTime;
  gain.gain.setValueAtTime(gainVal, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.start(t); osc.stop(t + duration + 0.01);
}
function playNoise(gainVal: number, duration: number, highpass = 800): void {
  const a = getAudio(); if (!a) return;
  const buf = a.createBuffer(1, a.sampleRate * duration, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const filter = a.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = highpass;
  const gain = a.createGain();
  src.connect(filter); filter.connect(gain); gain.connect(a.destination);
  gain.gain.setValueAtTime(gainVal, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration);
  src.start(); src.stop(a.currentTime + duration + 0.01);
}
function handleAudioEvents(events: AudioEvent[]): void {
  const a = getAudio(); if (!a) return;
  for (const ev of events) {
    switch (ev.kind) {
      case 'block':
        if (ev.hazardType === 'hail') { playNoise(0.12, 0.08, 1200); playTone(220, 'square', 0.06, 0.06); }
        else if (ev.hazardType === 'snow') { playTone(880, 'sine', 0.04, 0.09); }
        else { playNoise(0.07, 0.05, 2000); }
        break;
      case 'hit': playTone(110, 'sawtooth', 0.2, 0.15); playNoise(0.25, 0.12, 400); break;
      case 'levelup': { const t = a.currentTime; playTone(330,'square',0.1,0.12,t); playTone(440,'square',0.1,0.12,t+0.12); playTone(550,'square',0.1,0.18,t+0.24); break; }
      case 'death': playTone(220,'sawtooth',0.2,0.4); playTone(110,'sawtooth',0.15,0.6); playNoise(0.3,0.5,200); break;
    }
  }
}

// ─── Stars ────────────────────────────────────────────────────────────────────
interface Star { x: number; y: number; size: number; speed: number; brightness: number }
let stars: Star[] = [];
function buildStars(w: number, h: number, count = 130): void {
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h * 0.82,
    size: Math.random() < 0.15 ? 2 : 1,
    speed: 0.3 + Math.random() * 0.7,
    brightness: 0.4 + Math.random() * 0.6,
  }));
}

// ─── ASCII background ─────────────────────────────────────────────────────────
const BG_CHARS = [
  '\u2500','\u2502','\u250c','\u2510','\u2514','\u2518','\u251c','\u2524',
  '\u2550','\u2551','\u2591','\u2592',
  '+','-','=','~','^','|','/','\\',
  '\u00b7','\u2022','\u25a1','\u2219',
  '[',']','{','}','<','>',
  'x','o','#','@','%',
];
interface BgCell { charIndex: number; phase: number; speed: number; changeTimer: number; changeInterval: number; }
let bgCells: BgCell[] = [];
let bgCols = 0; let bgRows = 0; let bgCellW = 0; let bgCellH = 0; let bgFont = '';

function buildAsciiBackground(): void {
  const size = sz(W / 95, 30, 30);
  bgFont = fnt(size);
  bgCellW = renderer.measureWidth('M', bgFont) || 8;
  bgCellH = size * 1.3;
  bgCols = Math.ceil(W / bgCellW) + 1;
  bgRows = Math.ceil(H / bgCellH) + 1;
  const needed = bgCols * bgRows;
  if (bgCells.length !== needed) {
    bgCells = Array.from({ length: needed }, () => ({
      charIndex: Math.floor(Math.random() * BG_CHARS.length),
      phase: Math.random() * Math.PI * 2,
      speed: 0.12 + Math.random() * 0.4,
      changeTimer: Math.random() * 6,
      changeInterval: 2.5 + Math.random() * 9,
    }));
  }
}
function updateAsciiBackground(dt: number): void {
  for (let i = 0; i < bgCells.length; i++) {
    const c = bgCells[i];
    c.phase += c.speed * dt;
    if (c.phase > Math.PI * 2) c.phase -= Math.PI * 2;
    c.changeTimer -= dt;
    if (c.changeTimer <= 0) {
      c.charIndex = Math.floor(Math.random() * BG_CHARS.length);
      c.changeInterval = 2.5 + Math.random() * 9;
      c.changeTimer = c.changeInterval;
      c.speed = Math.random() < 0.1 ? 1.0 + Math.random() * 2.0 : 0.12 + Math.random() * 0.4;
    }
  }
}
function drawAsciiBackground(scrollY: number, baseAlpha: number, tintColor: string): void {
  if (bgCells.length === 0 || bgCols === 0) return;
  ctx.save();
  const scrolledY = scrollY % bgCellH;
  const groundY = H * 0.84;
  for (let row = 0; row < bgRows; row++) {
    const y = row * bgCellH - scrolledY;
    if (y > groundY + bgCellH) continue;
    for (let col = 0; col < bgCols; col++) {
      const x = col * bgCellW;
      const idx = row * bgCols + col;
      if (idx >= bgCells.length) continue;
      const cell = bgCells[idx];
      const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(cell.phase));
      const alpha = baseAlpha * pulse;
      if (alpha < 0.004) continue;
      const block = renderer.getBlock(BG_CHARS[cell.charIndex], bgFont, bgCellH);
      renderer.drawBlock(ctx, block, x, y, { color: tintColor, alpha });
    }
  }
  ctx.restore();
}

// ─── State + loop ─────────────────────────────────────────────────────────────
let state: GameState;
function init(): void {
  resize(); buildStars(W, H); buildAsciiBackground();
  state = createInitialState(W, H);
  bindEvents();
  requestAnimationFrame(loop);
}
let lastTime = 0;
function loop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  update(state, dt);
  updateUmbrellaPhysics(state, dt);
  updateAsciiBackground(dt);
  handleAudioEvents(state.audioEvents);
  draw(state);
  requestAnimationFrame(loop);
}

function updateUmbrellaPhysics(s: GameState, dt: number): void {
  if (s.phase !== 'playing') return;

  let cloudCeiling = Infinity;
  let pressureForce = 0;

  for (const cloud of s.clouds) {
    const size = Math.max(9, Math.min(14, s.W / 75));
    const lineH = Math.round(size * 1.35);

    const hudH = Math.max(10, Math.min(14, s.W / 70)) + 20;
    const startY = Math.max(hudH + 6, cloud.y);

    const lines = getCloudLines(cloud);
    const bottom = startY + lines.length * lineH;

    cloudCeiling = Math.min(cloudCeiling, bottom);

    if (s._umbrellaActualY !== undefined) {
      const dist = s._umbrellaActualY - bottom;
      const influence = 120;

      if (dist < influence) {
        const strength = 1800;
        const falloff = 1 - Math.max(0, dist) / influence;
        pressureForce += strength * falloff;
      }
    }
  }

  const umbrellaBounds = computeUmbrellaYBounds(s);
  const minY = umbrellaBounds.minY;
  const maxY = umbrellaBounds.maxY;

  const stiffness = 700;
  const damping = 14;
  const mass = 1;

  const targetY = s.umbrellaY;

  if (s._umbrellaActualY === undefined) {
    s._umbrellaActualY = s.umbrellaY;
  }

  if (!Number.isFinite(s._umbrellaActualY)) {
    s._umbrellaActualY = s.umbrellaY;
  }
  if (!Number.isFinite(s.umbrellaY)) {
    s.umbrellaY = Math.min(maxY, Math.max(minY, s.H * 0.55));
  }

  const y = s._umbrellaActualY;
  const v = s.umbrellaVY;

  const springForce = -stiffness * (y - targetY);
  const dampingForce = -damping * v;
  const totalForce = springForce + dampingForce + pressureForce;
  const accel = totalForce / mass;

  let newV = v + accel * dt;
  let newY = y + newV * dt;

  if (newY < minY) {
    const penetration = minY - newY;
    newY = minY + penetration * 0.25;
    newV *= -0.25;
  }

  if (newY > maxY) {
    const penetration = newY - maxY;
    newY = maxY - penetration * 0.25;
    newV *= -0.25;
  }

  s._umbrellaActualY = newY;
  s.umbrellaVY = newV;
  s.umbrellaY = newY;
}

// ─── Draw dispatcher ──────────────────────────────────────────────────────────
function draw(s: GameState): void {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   '#060c14');
  grad.addColorStop(0.55,'#091420');
  grad.addColorStop(1,   '#0d1117');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  if (s.phase === 'boot') { drawBoot(s); }
  else { drawGame(s); if (s.phase === 'dead') drawGameOver(s); }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
function drawBoot(s: GameState): void {
  const cx = W / 2;
  const lh = sz(H / 24, 20, 28);
  const size = sz(W / 60, 11, 15);
  const startY = H * 0.18;
  const indent = cx - sz(W * 0.28, 120, 230);

  drawAsciiBackground(0, 0.055, COLORS.dimGreen);
  drawScanlines(0.04);

  renderer.drawText(ctx, '[ WEATHER REPORT ]', fnt(size + 5, 700), lh, cx, startY - lh * 2.2, {
    color: COLORS.green, shadowColor: COLORS.green, shadowBlur: 20, align: 'center',
  });
  renderer.drawHRule(ctx, '\u2550', fnt(size - 1), lh, indent, startY - lh * 0.7,
    sz(W * 0.56, 240, 460), { color: COLORS.dimGreen, alpha: 0.7 });

  for (let i = 0; i < s.bootLines.length; i++) {
    const line = s.bootLines[i];
    const isWarn   = line.startsWith('\u26a0');
    const isPrompt = line.startsWith('>');
    const isLast   = i === s.bootLines.length - 1;
    const color = isPrompt ? COLORS.amber : isWarn ? COLORS.red : isLast ? COLORS.white : COLORS.dimGreen;
    const f = (isPrompt || isWarn) ? fnt(size, 700) : fnt(size);
    if (isPrompt && s.bootDone) {
      const display = line.replace(/ _$/, '');
      renderer.drawText(ctx, display, f, lh, indent, startY + i * lh, { color });
      if (s.promptBlink) {
        const tw = renderer.measureWidth(display + ' ', f);
        renderer.drawText(ctx, '\u258c', f, lh, indent + tw, startY + i * lh, { color: COLORS.amber });
      }
    } else {
      renderer.drawText(ctx, line, f, lh, indent, startY + i * lh, { color });
    }
  }
  renderer.drawText(ctx, 'BLASTER HACK COMMANDLINE GAME  //  v1.0', fnt(size - 3), lh,
    cx, H - 18, { color: COLORS.dim, align: 'center', alpha: 0.4 });
}

// ─── Game world ───────────────────────────────────────────────────────────────
function drawGame(s: GameState): void {
  drawAsciiBackground(s.bgStarOffset * 0.3, 0.04, '#1a3a2a');
  drawStars(s);
  drawClouds(s);
  drawGround(s);
  drawTraveler(s);
  drawHazards(s);
  drawParticles(s);
  drawHeartExplosions(s);
  drawUmbrella(s);
  drawUmbrellaSlides(s);
  drawScorePopups(s);
  drawHUD(s);
  drawLevelUpBanner(s);
  if (s.deathFlash > 0 && s.phase !== 'dead') {
    ctx.save(); ctx.fillStyle = COLORS.red; ctx.globalAlpha = s.deathFlash * 0.35;
    ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  drawScanlines(0.03);
}

// Stars
function drawStars(s: GameState): void {
  const groundY = travelerGroundY(s);
  ctx.save();
  for (const star of stars) {
    const y = (star.y + s.bgStarOffset * star.speed) % groundY;
    const twinkle = 0.7 + 0.3 * Math.sin(s.elapsed * (1.2 + star.speed) + star.x * 0.05);
    ctx.globalAlpha = star.brightness * twinkle;
    ctx.fillStyle = star.size > 1 ? '#8899aa' : '#4a6070';
    ctx.fillRect(Math.round(star.x), Math.round(y), star.size, star.size);
  }
  ctx.restore();
}

// Clouds
function getCloudLines(c: Cloud): string[] {
  if (c.type === 'rain') return [
    "  .~~~~~~~~~~~~~~~~~~~~~~~~.",
    " (   * R A I N  C L O U D *)",
    "  `~~~~~~~~~~~~~~~~~~~~~~~~'",
    "   | ' | ' | ' | ' |",
  ];
  if (c.type === 'snow') return [
    "  .~~~~~~~~~~~~~~~~~~~~~~~~~~.",
    " (   * S N O W  C L O U D *)",
    "  `~~~~~~~~~~~~~~~~~~~~~~~~~~'",
    "   * . * . * . * . *",
  ];
  return [
    "  /\\/\\/\\/\\/\\/\\/\\/\\/\\",
    " |   ## H A I L ##             |",
    "  \\/\\/\\/\\/\\/\\/\\/\\/\\/",
    "   O . O . O . O",
  ];
}

function drawClouds(s: GameState): void {
  const hudH  = sz(W / 70, 10, 14) + 20;
  const size  = sz(W / 75, 9, 14);
  const lineH = Math.round(size * 1.35);
  for (const cloud of s.clouds) {
    const f = fnt(size, 700);
    const lines = getCloudLines(cloud);
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, renderer.measureWidth(l, f));
    cloud.artW = maxW;
    const startX = cloud.x - maxW / 2;
    const startY = Math.max(hudH + 6, cloud.y);
    const flash = cloud.flashTimer > 0;
    const flashStrength = Math.min(1, cloud.flashTimer / 0.2);
    let bodyColor: string, accentColor: string, glowColor: string;
    if (cloud.type === 'rain') {
      bodyColor = flash ? '#4a7aaa' : '#2a5070'; accentColor = COLORS.rain; glowColor = flash ? COLORS.rain : '#3a6090';
    } else if (cloud.type === 'snow') {
      bodyColor = flash ? '#7090b0' : '#3a5065'; accentColor = COLORS.snow; glowColor = flash ? COLORS.snow : '#506080';
    } else {
      bodyColor = flash ? '#686868' : '#3a3a3a'; accentColor = COLORS.hail; glowColor = flash ? COLORS.hail : '#505050';
    }
    const glowBlur = flash ? 22 : 8;
    const bodyAlpha = 0.9 + flashStrength * 0.1;
    for (let i = 0; i < lines.length - 1; i++) {
      const block = renderer.getBlock(lines[i], f, lineH);
      renderer.drawBlock(ctx, block, startX, startY + i * lineH, {
        color: bodyColor, shadowColor: glowColor, shadowBlur: glowBlur, alpha: bodyAlpha,
      });
    }
    const dripLine = lines[lines.length - 1];
    const dripY = startY + (lines.length - 1) * lineH;
    const dripPulse = flash ? 1.0 : 0.6 + Math.sin(s.elapsed * 2.8 + cloud.id * 1.7) * 0.25;
    const dripBlock = renderer.getBlock(dripLine, f, lineH);
    renderer.drawBlock(ctx, dripBlock, startX, dripY, {
      color: accentColor, shadowColor: accentColor, shadowBlur: flash ? 16 : 5,
      alpha: Math.max(0.35, dripPulse),
    });
    if (flash) {
      const dropF = fnt(size);
      const dropY = dripY + lineH;
      const dropGlyph = cloud.type === 'rain' ? '|' : cloud.type === 'snow' ? '*' : '\u25cf';
      for (let d = 0; d < 4; d++) {
        const dx = startX + (maxW / 5) * (d + 1);
        const block = renderer.getBlock(dropGlyph, dropF, lineH);
        renderer.drawBlock(ctx, block, dx, dropY, {
          color: accentColor, shadowColor: accentColor, shadowBlur: 10, align: 'center', alpha: flashStrength * 0.95,
        });
      }
    }
  }
}

// Ground
function travelerGroundY(s: GameState): number { return Math.round(s.H * 0.84); }
function drawGround(s: GameState): void {
  const groundY = travelerGroundY(s);
  const size = sz(W / 60, 9, 14);
  const f = fnt(size);
  const lineH = Math.ceil(size * 1.35);

  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, groundY, W, H - groundY);
  const grd = ctx.createLinearGradient(0, groundY, 0, groundY + lineH * 2);
  grd.addColorStop(0, 'rgba(57,211,83,0.07)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, groundY, W, lineH * 2);

  const rows = [
    { pattern: '\u2593\u2592\u2591\u2593\u2592\u2591\u2593\u2592', color: COLORS.groundLine, alpha: 0.85 },
    { pattern: '\u2592\u2591\xb7\u2592\u2591\u2592\xb7\u2591',    color: COLORS.groundText,  alpha: 0.60 },
    { pattern: '\u2591\xb7 \u2591 \xb7\u2591 \xb7',               color: COLORS.groundText,  alpha: 0.35 },
    { pattern: '\xb7  \xb7   \xb7 ',                               color: COLORS.groundText,  alpha: 0.20 },
  ];
  const charW = renderer.measureWidth('\u2593', f);
  if (charW <= 0) return;
  for (let row = 0; row < rows.length; row++) {
    const { pattern, color, alpha } = rows[row];
    const rowY = groundY + row * lineH + 2;
    if (rowY > H) break;
    const scroll = row % 2 === 0 ? s.groundOffset : -s.groundOffset;
    const totalW = pattern.length * charW;
    if (totalW <= 0) continue;
    let x = -((scroll % totalW) + totalW) % totalW;
    const block = renderer.getBlock(pattern, f, lineH);
    while (x < W + totalW) { renderer.drawBlock(ctx, block, x, rowY, { color, alpha }); x += totalW; }
  }
  // Double-rule separator
  const ruleF = fnt(size, 700);
  const ruleBlock = renderer.getBlock('\u2550', ruleF, lineH);
  const ruleW = renderer.measureWidth('\u2550', ruleF);
  if (ruleW > 0) {
    let dx = 0;
    while (dx < W) { renderer.drawBlock(ctx, ruleBlock, dx, groundY - 1, { color: COLORS.green, alpha: 0.45 }); dx += ruleW; }
  }
}

// Traveler
const TRAVELER_HEADS = ['(^)', '(o)', '(^)', '(-)'];
const LEGS_IDLE = ['/ \\', '/ \\'];
const LEGS_WALK = ['/ \\', ' |/ ', '/ \\', ' \\| '];
const LEGS_RUN  = ['/|\\', '/ /', '|\\|', '\\ \\'];
let tFrame = 0; let tLegFrame = 0; let tTimer = 0; let tLegTimer = 0;

function drawTraveler(s: GameState): void {
  const speed = Math.abs(s.travelerVX);
  const maxSpeed = s.travelerMaxSpeed || 220;
  const speedFrac = speed / maxSpeed;
  const airborne = s.isJumping;
  tTimer += 0.016;
  const headInterval = speedFrac > 0.6 ? 0.10 : speedFrac > 0.2 ? 0.15 : 0.22;
  if (tTimer > headInterval) { tTimer = 0; tFrame = (tFrame + 1) % TRAVELER_HEADS.length; }
  if (!airborne) {
    tLegTimer += 0.016;
    const legInterval = speedFrac > 0.6 ? 0.07 : speedFrac > 0.15 ? 0.12 : 0.3;
    if (tLegTimer > legInterval) {
      tLegTimer = 0;
      const lfc = speedFrac > 0.6 ? LEGS_RUN.length : speedFrac > 0.15 ? LEGS_WALK.length : LEGS_IDLE.length;
      tLegFrame = (tLegFrame + 1) % lfc;
    }
  }
  const legFrames = speedFrac > 0.6 ? LEGS_RUN : speedFrac > 0.15 ? LEGS_WALK : LEGS_IDLE;
  const groundLegStr = legFrames[tLegFrame % legFrames.length];
  const armsJump = s.travelerVY < 0 ? '\\o/' : '/o\\';
  const legsJump = s.travelerVY < 0 ? ' ^^' : ' vv';
  const moving = s.travelerVX;
  const armsStr = moving < -10 ? '<|>' : moving > 10 ? '>|<' : '/|\\';
  const size = sz(W / 40, 14, 22);
  const f = fnt(size, 700);
  const lh = size + 2;
  const visible = s.hitCooldown > 0 ? (Math.floor(s.hitCooldown * 9) % 2 === 0) : true;
  if (!visible) return;
  const glow = s.hitCooldown > 0 ? COLORS.brightRed : airborne ? COLORS.brightAmber : COLORS.brightGreen;
  const wobble = !airborne && speedFrac > 0.7 ? Math.sin(Date.now() / 55) * 1.5 : 0;
  const tx = s.travelerX + wobble;

  if (airborne && s.travelerBaseY) {
    const rise = s.travelerBaseY - s.travelerY;
    const maxRise = s.H * 0.20;
    const t = Math.max(0, 1 - rise / maxRise);
    const shadowF = fnt(Math.max(6, size * (0.5 + t * 0.8)));
    const shadowGlyph = t > 0.7 ? '(_____)' : t > 0.4 ? '(___)' : t > 0.15 ? '(_)' : '.';
    const sBlock = renderer.getBlock(shadowGlyph, shadowF, size * 1.3);
    renderer.drawBlock(ctx, sBlock, tx, s.travelerBaseY + size * 2.6, { color: COLORS.dim, align: 'center', alpha: t * 0.5 });
  }

  const headStr = airborne ? '(O)' : TRAVELER_HEADS[tFrame];
  const headBlock = renderer.getBlock(headStr, f, lh);
  // Glow halo
  renderer.drawBlock(ctx, headBlock, tx, s.travelerY, { color: glow, shadowColor: glow, shadowBlur: airborne ? 20 : 14, align: 'center', alpha: 0.45 });
  // Solid character
  renderer.drawBlock(ctx, headBlock, tx, s.travelerY, { color: COLORS.traveler, shadowColor: glow, shadowBlur: airborne ? 8 : 5, align: 'center' });
  const armsBlock = renderer.getBlock(airborne ? armsJump : armsStr, f, lh);
  renderer.drawBlock(ctx, armsBlock, tx, s.travelerY + size + 2, { color: COLORS.traveler, align: 'center' });
  const legsBlock = renderer.getBlock(airborne ? legsJump : groundLegStr, f, lh);
  renderer.drawBlock(ctx, legsBlock, tx, s.travelerY + size * 2 + 2, { color: COLORS.traveler, align: 'center' });
  if (!airborne && speedFrac > 0.65) {
    const trailAlpha = (speedFrac - 0.65) / 0.35 * 0.28;
    renderer.drawBlock(ctx, headBlock, tx - s.travelerVX * 0.045, s.travelerY, { color: COLORS.traveler, align: 'center', alpha: trailAlpha });
  }
}

// Hazards
function drawHazards(s: GameState): void {
  const groundY = travelerGroundY(s);
  for (const h of s.hazards) {
    if (h.y > groundY) continue;
    const base = h.type === 'hail' ? sz(W / 55, 12, 17) : sz(W / 65, 10, 14);
    const size = Math.round(base * h.size);
    const f = fnt(size, 700);
    const color = h.type === 'rain' ? COLORS.rain : h.type === 'snow' ? COLORS.snow : COLORS.hail;
    const shadowColor = h.type === 'rain' ? '#1a6090' : h.type === 'snow' ? '#6090b0' : '#606878';
    const alpha = Math.min(1, (h.y + 30) / 30);
    const block = renderer.getBlock(h.glyph, f, size * 1.3);
    renderer.drawBlock(ctx, block, h.x, h.y, { color, shadowColor, shadowBlur: 6, align: 'center', verticalAlign: 'middle', alpha });
  }
}

// Particles
function drawParticles(s: GameState): void {
  const size = sz(W / 70, 8, 12);
  const f = fnt(size);
  for (const p of s.particles) {
    const block = renderer.getBlock(p.glyph, f, size * 1.3);
    renderer.drawBlock(ctx, block, p.x, p.y, { color: p.color, shadowColor: p.color, shadowBlur: 4, align: 'center', verticalAlign: 'middle', alpha: Math.max(0, p.life) });
  }
}

function drawHeartExplosions(s: GameState): void {
  const size = sz(W / 70, 10, 16);
  const f = fnt(size);
  for (const h of s.heartExplosions) {
    const block = renderer.getBlock(h.glyph, f, size * 1.5);
    const alpha = Math.max(0, h.life);
    renderer.drawBlock(ctx, block, h.x, h.y, { 
      color: h.color, 
      shadowColor: h.color, 
      shadowBlur: 8, 
      align: 'center', 
      verticalAlign: 'middle', 
      alpha 
    });
  }
}

// ─── Umbrella ─────────────────────────────────────────────────────────────────
// Canopy only — no leading-space lines that skew maxLineWidth measurement.
const UMBRELLA_CANOPY = [
    "           ___.----' `----.___",
    "       _.-'   .-'  F  `   -   `-._",
    "    .-'    .'           \\   `-    `-.",
    "  .'              J            `.    `.",
    " /___    /                L      `  .--`.",
    "'    `-.  _.---._ |_.---._ .--\"\"\"-.'",

];
const UMBRELLA_HANDLE_LINES = 8;
const UMBRELLA_FOOT = ['A', 'H', '      Yb   dB', '     YbmdP'];

function drawUmbrella(s: GameState): void {
  const { umbrellaX: ux, umbrellaY: uy } = s;
  const size  = sz(W / 100, 7, 11);
  const f     = fnt(size, 700);
  const lineH = Math.round(size * 1.15);

  const comboGlow = s.combo >= 3;
  const glowColor = comboGlow ? COLORS.comboGold : COLORS.amber;
  const glowBlur  = comboGlow ? 18 : 10;

  let canopyW = 0;
  for (const line of UMBRELLA_CANOPY) canopyW = Math.max(canopyW, renderer.measureWidth(line, f));

  const startX = ux - canopyW / 2;
  const startY = uy - lineH;

  s.umbrellaArtStartX = startX;
  s.umbrellaArtWidth  = canopyW;
  s.umbrellaArtStartY = startY;
  s.umbrellaArtLineH  = lineH;

  for (let i = 0; i < UMBRELLA_CANOPY.length; i++) {
    const block = renderer.getBlock(UMBRELLA_CANOPY[i], f, lineH);
    renderer.drawBlock(ctx, block, startX, startY + i * lineH, {
      color: COLORS.umbrella, shadowColor: glowColor, shadowBlur: glowBlur,
    });
  }

  const handleStartY = startY + UMBRELLA_CANOPY.length * lineH;
  const handleBlock  = renderer.getBlock('|', f, lineH);
  for (let i = 0; i < UMBRELLA_HANDLE_LINES; i++) {
    renderer.drawBlock(ctx, handleBlock, ux, handleStartY + i * lineH, {
      color: COLORS.umbrellaRim, shadowColor: glowColor, shadowBlur: 5, align: 'center',
    });
  }

  const footStartY = handleStartY + UMBRELLA_HANDLE_LINES * lineH;
  for (let i = 0; i < UMBRELLA_FOOT.length; i++) {
    const isSignature = UMBRELLA_FOOT[i].includes('Yb') || UMBRELLA_FOOT[i].includes('dB') || UMBRELLA_FOOT[i].includes('mdP');
    const block = renderer.getBlock(UMBRELLA_FOOT[i], f, lineH);
    renderer.drawBlock(ctx, block, ux, footStartY + i * lineH, {
      color: isSignature ? COLORS.cyan : COLORS.umbrellaRim,
      shadowColor: isSignature ? COLORS.cyan : glowColor,
      shadowBlur: isSignature ? 8 : 4,
      align: 'center',
    });
  }
}

// Umbrella slides
function drawUmbrellaSlides(s: GameState): void {
  if (s.umbrellaSlides.length === 0) return;
  const size = sz(W / 120, 6, 9);
  const f = fnt(size, 700);
  const lh = size * 1.3;

  // Keep slide-phase drops visually glued to the currently rendered canopy.
  const hasUmbrellaGeom = s.umbrellaArtWidth > 0 && s.umbrellaArtLineH > 0;
  const artCenterX = s.umbrellaArtStartX + s.umbrellaArtWidth / 2;
  const halfW = s.umbrellaArtWidth / 2;
  const peakY = s.umbrellaArtStartY + s.umbrellaArtLineH;
  const rimY = s.umbrellaArtStartY + (UMBRELLA_CANOPY.length - 1) * s.umbrellaArtLineH;

  for (const slide of s.umbrellaSlides) {
    const fadeAlpha = Math.max(0, slide.life * slide.alpha);
    if (fadeAlpha <= 0) continue;

    let drawX = slide.x;
    let drawY = slide.y;

    if (slide.phase === 'slide' && hasUmbrellaGeom && halfW > 0) {
      const clampedX = Math.max(s.umbrellaArtStartX, Math.min(s.umbrellaArtStartX + s.umbrellaArtWidth, slide.x));
      const xFrac = Math.min(1, Math.abs(clampedX - artCenterX) / halfW);
      drawX = clampedX;
      drawY = peakY + xFrac * (rimY - peakY);
    }

    if (slide.phase === 'slide') {
      const g = slide.dir === -1 ? '\\' : '/';
      const block = renderer.getBlock(g, f, lh);
      renderer.drawBlock(ctx, block, drawX, drawY, {
        color: COLORS.rain,
        shadowColor: COLORS.rain,
        shadowBlur: 3,
        align: 'center',
        alpha: fadeAlpha,
      });
    } else {
      renderer.drawBlock(ctx, renderer.getBlock('|', f, lh), drawX, drawY, {
        color: COLORS.rain,
        align: 'center',
        alpha: fadeAlpha,
      });
      renderer.drawBlock(ctx, renderer.getBlock('\u00b7', f, lh), drawX, drawY - size * 1.2, {
        color: COLORS.rainDim,
        align: 'center',
        alpha: fadeAlpha * 0.5,
      });
    }
  }
}

// Score popups
function drawScorePopups(s: GameState): void {
  const size = sz(W / 65, 9, 13);
  const f = fnt(size, 700);
  for (const p of s.scorePopups) {
    const alpha = Math.min(1, p.life * 1.5);
    const block = renderer.getBlock(p.text, f, size * 1.3);
    renderer.drawBlock(ctx, block, p.x, p.y, { color: p.color, shadowColor: p.color, shadowBlur: 12, align: 'center', verticalAlign: 'middle', alpha });
  }
}

// Level-up banner
function drawLevelUpBanner(s: GameState): void {
  if (s.levelUpTimer <= 0) return;
  const t = s.levelUpTimer / 2.5;
  const alpha = t < 0.25 ? t * 4 : t > 0.75 ? (1 - t) * 4 : 1;
  const size = sz(W / 45, 11, 17);
  const f = fnt(size, 700);
  const bannerY = H * 0.44;
  ctx.save(); ctx.fillStyle = '#060c14'; ctx.globalAlpha = alpha * 0.72;
  ctx.fillRect(0, bannerY - 4, W, size + 22); ctx.restore();
  renderer.drawHRule(ctx, '\u2550', f, size + 4, 0, bannerY - 2, W, { color: COLORS.green, alpha: alpha * 0.5 });
  renderer.drawText(ctx, s.levelUpText, f, size + 4, W / 2, bannerY + 5, { color: COLORS.brightAmber, shadowColor: COLORS.amber, shadowBlur: 16, align: 'center', alpha });
  renderer.drawHRule(ctx, '\u2550', f, size + 4, 0, bannerY + size + 12, W, { color: COLORS.green, alpha: alpha * 0.5 });
}

// HUD
function drawHUD(s: GameState): void {
  const size = sz(W / 70, 10, 14);
  const fb   = fnt(size, 700);
  const f    = fnt(size);
  const pad  = 14;
  const barH = size + 20;
  const textY = Math.round((barH - size) / 2);

  ctx.fillStyle = 'rgba(6,12,20,0.9)';
  ctx.fillRect(0, 0, W, barH);
  ctx.fillStyle = COLORS.green;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(0, barH, W, 1);
  ctx.globalAlpha = 1;

  renderer.drawText(ctx, `SCORE: ${String(s.score).padStart(6, '0')}`, fb, size + 2, pad, textY, {
    color: COLORS.green, shadowColor: COLORS.green, shadowBlur: 8,
  });

  if (s.combo >= 2) {
    const comboColor = s.combo >= 5 ? COLORS.comboGold : COLORS.brightAmber;
    const comboText = `COMBO \xd7${s.combo}`;
    const comboW = renderer.measureWidth(comboText, fnt(size - 1, 700));
    renderer.drawText(ctx, comboText, fnt(size - 1, 700), size + 2, W / 2 - comboW / 2 - 55, textY, {
      color: comboColor, shadowColor: comboColor, shadowBlur: 10, alpha: Math.min(1, s.combo * 0.2 + 0.4),
    });
  }

  const hpStr   = '\u2665'.repeat(s.hp) + '\u2661'.repeat(s.maxHp - s.hp);
  const hpFull  = 'HP: ' + hpStr;
  const hpColor = s.hp <= 1 ? COLORS.red : s.hp <= 2 ? COLORS.brightAmber : COLORS.cyan;
  const hpAlpha = (s.hp <= 1 && Math.floor(Date.now() / 350) % 2 === 0) ? 0.35 : 1;
  const hpW     = renderer.measureWidth(hpFull, fb);
  renderer.drawText(ctx, hpFull, fb, size + 2, W / 2 - hpW / 2 + 55, textY, {
    color: hpColor, shadowColor: hpColor, shadowBlur: s.hp <= 2 ? 8 : 0, alpha: hpAlpha,
  });

  const lvl  = `LVL:${s.difficultyLevel + 1}  ${String(Math.floor(s.elapsed)).padStart(3, '0')}s`;
  const lvlW = renderer.measureWidth(lvl, f);
  renderer.drawText(ctx, lvl, f, size + 2, W - pad - lvlW, textY, { color: COLORS.dim });
}

function drawScanlines(alpha: number): void {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#000000';
  for (let y = 0; y < H; y += 12) ctx.fillRect(0, y, W, 1);
  ctx.restore();
}

// Game over
function drawGameOver(s: GameState): void {
  ctx.fillStyle = '#060c14'; ctx.globalAlpha = 0.88; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  const cx   = W / 2;
  const size = sz(W / 45, 12, 18);
  const lh   = size + 6;
  const boxW = Math.min(460, W - 40);
  const boxH = 210;
  const boxX = cx - boxW / 2;
  const boxY = H / 2 - boxH / 2;
  ctx.fillStyle = 'rgba(6,12,20,0.92)'; ctx.fillRect(boxX, boxY, boxW, boxH);
  renderer.drawGlyphBox(ctx, fnt(size), lh, boxX, boxY, boxW, boxH, { color: COLORS.red, alpha: 0.8 });
  renderer.drawText(ctx, '[ PROCESS KILLED ]', fnt(size + 4, 700), lh, cx, boxY + 20, { color: COLORS.red, shadowColor: COLORS.brightRed, shadowBlur: 22, align: 'center' });
  renderer.drawHRule(ctx, '\u2550', fnt(size - 2), lh, boxX + 14, boxY + 60, boxW - 28, { color: COLORS.dimGreen, alpha: 0.6 });
  renderer.drawText(ctx, `FINAL SCORE: ${s.score}`, fnt(size, 700), lh, cx, boxY + 76, { color: COLORS.amber, shadowColor: COLORS.amber, shadowBlur: 10, align: 'center' });
  renderer.drawText(ctx, `SURVIVED: ${Math.floor(s.elapsed)}s   LEVEL REACHED: ${s.difficultyLevel + 1}`, fnt(size - 1), lh, cx, boxY + 104, { color: COLORS.dim, align: 'center' });
  if (s.combo > 1) renderer.drawText(ctx, `BEST COMBO: \xd7${s.combo}`, fnt(size - 1), lh, cx, boxY + 126, { color: COLORS.cyan, align: 'center' });
  renderer.drawHRule(ctx, '\u2550', fnt(size - 2), lh, boxX + 14, boxY + 154, boxW - 28, { color: COLORS.dimGreen, alpha: 0.6 });
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    renderer.drawText(ctx, '> Press R / ENTER / tap to restart', fnt(size - 1, 700), lh, cx, boxY + 168, { color: COLORS.green, shadowColor: COLORS.green, shadowBlur: 8, align: 'center' });
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────
function canvasPos(e: MouseEvent | Touch): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function bindEvents(): void {
  window.addEventListener('resize', () => { ctx.setTransform(1,0,0,1,0,0); resize(); buildStars(W, H); buildAsciiBackground(); });
  window.addEventListener('keydown', (e) => { resumeAudio(); handleKeyDown(state, e.key); });
  window.addEventListener('keyup', (e) => { handleKeyUp(state, e.key); });
  canvas.addEventListener('mousemove', (e) => { handlePointerMove(state, canvasPos(e).x, canvasPos(e).y); });
  canvas.addEventListener('mousedown', (e) => { resumeAudio(); const p = canvasPos(e); handlePointerDown(state, p.x, p.y); });
  window.addEventListener('mouseup', () => handlePointerUp(state));
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handlePointerMove(state, canvasPos(e.touches[0]).x, canvasPos(e.touches[0]).y); }, { passive: false });
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); resumeAudio(); const p = canvasPos(e.touches[0]); handlePointerDown(state, p.x, p.y); }, { passive: false });
  window.addEventListener('touchend', () => handlePointerUp(state));
}

init();
