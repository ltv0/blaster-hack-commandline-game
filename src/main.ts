import './style.css';
import {
  createInitialState,
  update,
  handleKeyDown,
  handleKeyUp,
  handlePointerMove,
  handlePointerDown,
  handlePointerUp,
  COLORS,
  type GameState,
  type AudioEvent,
  type Cloud,
} from './game.ts';
import { PretextRenderer } from './pretext-renderer.ts';

// ─── Canvas ───────────────────────────────────────────────────────────────────

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
  }
}

// ─── Font helpers ─────────────────────────────────────────────────────────────

const FONT_FAMILY = '"IBM Plex Mono", monospace';

function fnt(size: number, weight: 400 | 700 = 400): string {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}
function sz(base: number, minV: number, maxV: number): number {
  return Math.max(minV, Math.min(maxV, base));
}

// ─── Audio engine ─────────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function getAudio(): AudioContext | null {
  if (!audioCtx) {
    try { audioCtx = new AudioContext(); } catch { return null; }
  }
  return audioCtx;
}

function resumeAudio(): void {
  const a = getAudio();
  if (a && a.state === 'suspended') a.resume();
}

function playTone(
  freq: number,
  type: OscillatorType,
  gainVal: number,
  duration: number,
  startTime?: number,
): void {
  const a = getAudio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.connect(gain);
  gain.connect(a.destination);
  osc.type = type;
  osc.frequency.value = freq;
  const t = startTime ?? a.currentTime;
  gain.gain.setValueAtTime(gainVal, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.start(t);
  osc.stop(t + duration + 0.01);
}

function playNoise(gainVal: number, duration: number, highpass = 800): void {
  const a = getAudio();
  if (!a) return;
  const buf = a.createBuffer(1, a.sampleRate * duration, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = highpass;
  const gain = a.createGain();
  src.connect(filter);
  filter.connect(gain);
  gain.connect(a.destination);
  gain.gain.setValueAtTime(gainVal, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration);
  src.start();
  src.stop(a.currentTime + duration + 0.01);
}

function handleAudioEvents(events: AudioEvent[]): void {
  const a = getAudio();
  if (!a) return;
  for (const ev of events) {
    switch (ev.kind) {
      case 'block':
        if (ev.hazardType === 'hail') {
          playNoise(0.12, 0.08, 1200);
          playTone(220, 'square', 0.06, 0.06);
        } else if (ev.hazardType === 'snow') {
          playTone(880, 'sine', 0.04, 0.09);
        } else {
          playNoise(0.07, 0.05, 2000);
        }
        break;
      case 'hit':
        playTone(110, 'sawtooth', 0.2, 0.15);
        playNoise(0.25, 0.12, 400);
        break;
      case 'levelup': {
        const t = a.currentTime;
        playTone(330, 'square', 0.1, 0.12, t);
        playTone(440, 'square', 0.1, 0.12, t + 0.12);
        playTone(550, 'square', 0.1, 0.18, t + 0.24);
        break;
      }
      case 'death':
        playTone(220, 'sawtooth', 0.2, 0.4);
        playTone(110, 'sawtooth', 0.15, 0.6);
        playNoise(0.3, 0.5, 200);
        break;
    }
  }
}

// ─── Static star field ────────────────────────────────────────────────────────

interface Star { x: number; y: number; size: number; speed: number }
let stars: Star[] = [];

function buildStars(w: number, h: number, count = 80): void {
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    size: Math.random() < 0.2 ? 2 : 1,
    speed: 0.3 + Math.random() * 0.7,
  }));
}

// ─── State ────────────────────────────────────────────────────────────────────

let state: GameState;

function init(): void {
  resize();
  buildStars(W, H);
  state = createInitialState(W, H);
  bindEvents();
  requestAnimationFrame(loop);
}

// ─── Game loop ────────────────────────────────────────────────────────────────

let lastTime = 0;

function loop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  update(state, dt);
  handleAudioEvents(state.audioEvents);
  draw(state);

  requestAnimationFrame(loop);
}

// ─── Top-level draw dispatcher ────────────────────────────────────────────────

function draw(s: GameState): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  if (s.phase === 'boot') {
    drawBoot(s);
  } else {
    drawGame(s);
    if (s.phase === 'dead') drawGameOver(s);
  }
}

// ─── Boot screen ─────────────────────────────────────────────────────────────

function drawBoot(s: GameState): void {
  const cx     = W / 2;
  const lh     = sz(H / 24, 20, 28);
  const size   = sz(W / 60, 11, 15);
  const startY = H * 0.18;
  const indent = cx - sz(W * 0.28, 120, 230);

  drawScanlines(0.04);

  // Logo
  const logoFont = fnt(size + 5, 700);
  renderer.drawText(ctx, '[ BLASTER HACK ]', logoFont, lh, cx, startY - lh * 2.2, {
    color: COLORS.green,
    shadowColor: COLORS.green,
    shadowBlur: 16,
    align: 'center',
  });

  // Rule under logo
  renderer.drawHRule(ctx, '\u2500', fnt(size - 1), lh, indent, startY - lh * 0.7,
    sz(W * 0.56, 240, 460), { color: COLORS.dimGreen, alpha: 0.6 });

  // Boot lines
  for (let i = 0; i < s.bootLines.length; i++) {
    const line      = s.bootLines[i];
    const isLast    = i === s.bootLines.length - 1;
    const isWarn    = line.startsWith('\u26a0');
    const isPrompt  = line.startsWith('>');
    const color     = isPrompt ? COLORS.amber
                    : isWarn   ? COLORS.red
                    : isLast   ? COLORS.white
                    :             COLORS.dimGreen;
    const f = (isPrompt || isWarn) ? fnt(size, 700) : fnt(size);

    if (isPrompt && s.bootDone) {
      const display = line.replace(/ _$/, '');
      renderer.drawText(ctx, display, f, lh, indent, startY + i * lh, { color });
      if (s.promptBlink) {
        const tw = renderer.measureWidth(display + ' ', f);
        renderer.drawText(ctx, '_', f, lh, indent + tw, startY + i * lh, { color: COLORS.amber });
      }
    } else {
      renderer.drawText(ctx, line, f, lh, indent, startY + i * lh, { color });
    }
  }

  // Footer
  renderer.drawText(ctx, 'BLASTER HACK COMMANDLINE GAME  //  v1.0', fnt(size - 3), lh,
    cx, H - 18, { color: COLORS.dim, align: 'center', alpha: 0.4 });
}

// ─── Game world ───────────────────────────────────────────────────────────────

function drawGame(s: GameState): void {
  drawStars(s);
  drawClouds(s);
  drawGround(s);
  drawWindIndicator(s);
  drawTraveler(s);
  drawHazards(s);
  drawParticles(s);
  drawUmbrella(s);
  drawUmbrellaSlides(s);
  drawScorePopups(s);
  drawHUD(s);
  drawLevelUpBanner(s);

  // Hit flash
  if (s.deathFlash > 0 && s.phase !== 'dead') {
    ctx.save();
    ctx.fillStyle = COLORS.red;
    ctx.globalAlpha = s.deathFlash * 0.18;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  drawScanlines(0.035);
}

// Stars / parallax bg
function drawStars(s: GameState): void {
  ctx.save();
  for (const star of stars) {
    const y = (star.y + s.bgStarOffset * star.speed) % H;
    ctx.fillStyle = COLORS.star;
    ctx.globalAlpha = 0.6 + star.size * 0.2;
    ctx.fillRect(Math.round(star.x), Math.round(y), star.size, star.size);
  }
  ctx.restore();
}

// Clouds
function getCloudLines(c: Cloud): string[] {
  if (c.type === 'rain') {
    return [
      "   .-~~~~-.   .-.",
      "  / R A I N ~~' \\",
      " (   cloud   .   )",
      "  `-.______.-'",
      "  | ' | ' | ' |",
    ];
  } else if (c.type === 'snow') {
    return [
      " .-. .~~~. .-. .-.",
      "(   ) SNOW (   )  )",
      " `-' cloud `-' `-'",
      "  `----_____----'",
      "  * . * . * . *",
    ];
  } else {
    return [
      " /\\/\\/\\  HAIL  /\\/\\",
      "|  ##  ########  |",
      "|## cloud #####  |",
      " \\__####/####__/",
      "  O . O . O . O",
    ];
  }
}

function drawClouds(s: GameState): void {
  const hudH  = sz(W / 70, 10, 14) + 18;
  const size  = sz(W / 85, 7, 12);
  const lineH = Math.round(size * 1.3);

  for (const cloud of s.clouds) {
    const f     = fnt(size, 700);
    const lines = getCloudLines(cloud);

    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, renderer.measureWidth(l, f));
    cloud.artW = maxW;

    const startX = cloud.x - maxW / 2;
    const startY = Math.max(hudH + 4, cloud.y);

    const flash         = cloud.flashTimer > 0;
    const flashStrength = cloud.flashTimer / 0.2;

    let bodyColor: string, accentColor: string, rimColor: string;
    if (cloud.type === 'rain') {
      bodyColor   = flash ? '#3a6a9a' : '#1e3a52';
      accentColor = COLORS.rain;
      rimColor    = '#2a5070';
    } else if (cloud.type === 'snow') {
      bodyColor   = flash ? '#6080a0' : '#2e4055';
      accentColor = COLORS.snow;
      rimColor    = '#4a6070';
    } else {
      bodyColor   = flash ? '#505050' : '#252525';
      accentColor = COLORS.hail;
      rimColor    = '#383838';
    }

    const glowColor = flash ? accentColor : rimColor;
    const glowBlur  = flash ? 18 : 6;
    const bodyAlpha = 0.85 + flashStrength * 0.15;

    for (let i = 0; i < lines.length - 1; i++) {
      const block = renderer.getBlock(lines[i], f, lineH);
      renderer.drawBlock(ctx, block, startX, startY + i * lineH, {
        color: bodyColor,
        shadowColor: glowColor,
        shadowBlur: glowBlur,
        alpha: bodyAlpha,
      });
    }

    const dripLine  = lines[lines.length - 1];
    const dripY     = startY + (lines.length - 1) * lineH;
    const dripPulse = flash
      ? 1.0
      : 0.55 + Math.sin(s.elapsed * 2.5 + cloud.id * 1.7) * 0.2;
    const dripBlock = renderer.getBlock(dripLine, f, lineH);
    renderer.drawBlock(ctx, dripBlock, startX, dripY, {
      color: accentColor,
      shadowColor: accentColor,
      shadowBlur: flash ? 14 : 4,
      alpha: Math.max(0.25, dripPulse),
    });

    if (flash) {
      const dropF     = fnt(size - 1);
      const dropY     = dripY + lineH;
      const dropGlyph = cloud.type === 'rain' ? '|'
                      : cloud.type === 'snow' ? '*'
                      :                         'o';
      const drops = 3;
      for (let d = 0; d < drops; d++) {
        const dx    = startX + (maxW / (drops + 1)) * (d + 1);
        const block = renderer.getBlock(dropGlyph, dropF, lineH);
        renderer.drawBlock(ctx, block, dx, dropY, {
          color: accentColor,
          align: 'center',
          alpha: flashStrength * 0.9,
        });
      }
    }
  }
}

// Ground
function travelerGroundY(s: GameState): number {
  return Math.round(s.H * 0.84);
}

function drawGround(s: GameState): void {
  const groundY = travelerGroundY(s);
  const size    = sz(W / 80, 9, 12);
  const f       = fnt(size);
  const lineH   = Math.ceil(size * 1.35);

  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, groundY, W, H - groundY);

  const rows = [
    { pattern: '\u2593\u2592\u2591\u2593\u2592\u2591\u2593\u2592', color: COLORS.groundLine, alpha: 0.75 },
    { pattern: '\u2592\u2591\xb7\u2592\u2591\u2592\xb7\u2591',    color: COLORS.groundText,  alpha: 0.55 },
    { pattern: '\u2591\xb7 \u2591 \xb7\u2591 \xb7',               color: COLORS.groundText,  alpha: 0.30 },
    { pattern: '\xb7  \xb7   \xb7 ',                               color: COLORS.groundText,  alpha: 0.18 },
  ];

  const charW = renderer.measureWidth('\u2593', f);

  for (let row = 0; row < rows.length; row++) {
    const { pattern, color, alpha } = rows[row];
    const rowY = groundY + row * lineH + 2;
    if (rowY > H) break;

    const scroll  = row % 2 === 0 ? s.groundOffset : -s.groundOffset;
    const totalW  = pattern.length * charW;
    let x = -((scroll % totalW) + totalW) % totalW;

    while (x < W + totalW) {
      const block = renderer.getBlock(pattern, f, lineH);
      renderer.drawBlock(ctx, block, x, rowY, { color, alpha });
      x += totalW;
    }
  }

  // Top separator dash line
  const dashF   = fnt(size - 1);
  const dashW   = renderer.measureWidth('\u2500', dashF);
  const dashBlock = renderer.getBlock('\u2500', dashF, lineH);
  let dx = 0;
  while (dx < W) {
    renderer.drawBlock(ctx, dashBlock, dx, groundY, { color: COLORS.dimGreen, alpha: 0.8 });
    dx += dashW;
  }
}

// Wind indicator
function drawWindIndicator(s: GameState): void {
  if (Math.abs(s.windX) < 5) return;
  const dir   = s.windX > 0 ? '>>>' : '<<<';
  const speed = Math.abs(s.windX).toFixed(0);
  const size  = sz(W / 90, 8, 11);
  const alpha = Math.min(0.6, Math.abs(s.windX) / 80);
  const groundY = travelerGroundY(s);
  renderer.drawText(ctx, `WIND ${dir} ${speed}`, fnt(size), size * 1.3,
    12, groundY + 6, { color: COLORS.cyan, alpha });
}

// Traveler
const TRAVELER_HEADS = ['(^)', '(o)', '(^)', '(-)'];
const LEGS_IDLE  = ['/ \\', '/ \\'];
const LEGS_WALK  = ['/ \\', ' |/ ', '/ \\', ' \\| '];
const LEGS_RUN   = ['/|\\', '/ /', '|\\|', '\\ \\'];
let tFrame = 0;
let tLegFrame = 0;
let tTimer = 0;
let tLegTimer = 0;

function drawTraveler(s: GameState): void {
  const speed     = Math.abs(s.travelerVX);
  const maxSpeed  = s.travelerMaxSpeed || 220;
  const speedFrac = speed / maxSpeed;
  const airborne  = s.isJumping;

  const headInterval = speedFrac > 0.6 ? 0.10 : speedFrac > 0.2 ? 0.15 : 0.22;
  tTimer += 0.016;
  if (tTimer > headInterval) {
    tTimer = 0;
    tFrame = (tFrame + 1) % TRAVELER_HEADS.length;
  }

  if (!airborne) {
    const legInterval = speedFrac > 0.6 ? 0.07 : speedFrac > 0.15 ? 0.12 : 0.3;
    tLegTimer += 0.016;
    if (tLegTimer > legInterval) {
      tLegTimer = 0;
      const legFrameCount = speedFrac > 0.6 ? LEGS_RUN.length : speedFrac > 0.15 ? LEGS_WALK.length : LEGS_IDLE.length;
      tLegFrame = (tLegFrame + 1) % legFrameCount;
    }
  }

  const legFrames     = speedFrac > 0.6 ? LEGS_RUN : speedFrac > 0.15 ? LEGS_WALK : LEGS_IDLE;
  const groundLegStr  = legFrames[tLegFrame % legFrames.length];
  const risingStr     = '\\o/';
  const fallingStr    = '/o\\';
  const armsJump      = s.travelerVY < 0 ? risingStr : fallingStr;
  const legsJump      = s.travelerVY < 0 ? ' ^^' : ' vv';
  const moving        = s.travelerVX;
  const armsStr       = moving < -10 ? '<|>' : moving > 10 ? '>|<' : '/|\\';

  const size = sz(W / 40, 14, 22);
  const f    = fnt(size, 700);
  const lh   = size + 2;

  const visible = s.hitCooldown > 0 ? (Math.floor(s.hitCooldown * 9) % 2 === 0) : true;
  if (!visible) return;

  const glow   = s.hitCooldown > 0 ? COLORS.brightRed : airborne ? COLORS.brightAmber : COLORS.green;
  const wobble = !airborne && speedFrac > 0.7 ? Math.sin(Date.now() / 55) * 1.5 : 0;
  const tx     = s.travelerX + wobble;

  if (airborne && s.travelerBaseY) {
    const rise       = s.travelerBaseY - s.travelerY;
    const maxRise    = s.H * 0.20;
    const t          = Math.max(0, 1 - rise / maxRise);
    const shadowAlpha = t * 0.55;
    const shadowSize = Math.max(6, size * (0.5 + t * 0.8));
    const shadowF    = fnt(shadowSize);
    const shadowGlyph = t > 0.7 ? '(_____)' : t > 0.4 ? '(___)' : t > 0.15 ? '(_)' : '.';
    const sBlock = renderer.getBlock(shadowGlyph, shadowF, shadowSize * 1.3);
    renderer.drawBlock(ctx, sBlock, tx, s.travelerBaseY + size * 2.6, {
      color: COLORS.dim,
      align: 'center',
      alpha: shadowAlpha,
    });
  }

  const headStr   = airborne ? '(O)' : TRAVELER_HEADS[tFrame];
  const headBlock = renderer.getBlock(headStr, f, lh);
  renderer.drawBlock(ctx, headBlock, tx, s.travelerY, {
    color: COLORS.traveler,
    shadowColor: glow,
    shadowBlur: airborne ? 12 : 8,
    align: 'center',
  });

  const armsBlock = renderer.getBlock(airborne ? armsJump : armsStr, f, lh);
  renderer.drawBlock(ctx, armsBlock, tx, s.travelerY + size + 2, {
    color: COLORS.traveler,
    align: 'center',
  });

  const legsBlock = renderer.getBlock(airborne ? legsJump : groundLegStr, f, lh);
  renderer.drawBlock(ctx, legsBlock, tx, s.travelerY + size * 2 + 2, {
    color: COLORS.traveler,
    align: 'center',
  });

  if (!airborne && speedFrac > 0.65) {
    const trailAlpha  = (speedFrac - 0.65) / 0.35 * 0.35;
    const trailOffset = -s.travelerVX * 0.045;
    renderer.drawBlock(ctx, headBlock, tx + trailOffset, s.travelerY, {
      color: COLORS.traveler,
      align: 'center',
      alpha: trailAlpha,
    });
  }
}

// Hazards
function drawHazards(s: GameState): void {
  const groundY = travelerGroundY(s);
  for (const h of s.hazards) {
    if (h.y > groundY) continue;
    const base  = h.type === 'hail' ? sz(W / 55, 12, 17) : sz(W / 65, 10, 14);
    const size  = Math.round(base * h.size);
    const f     = fnt(size);
    const color = h.type === 'rain' ? COLORS.rain
                : h.type === 'snow' ? COLORS.snow
                :                     COLORS.hail;
    const alpha = Math.min(1, (h.y + 30) / 30);
    const block = renderer.getBlock(h.glyph, f, size * 1.3);
    renderer.drawBlock(ctx, block, h.x, h.y, { color, align: 'center', verticalAlign: 'middle', alpha });
  }
}

// Particles
function drawParticles(s: GameState): void {
  const size = sz(W / 70, 8, 12);
  const f    = fnt(size);
  for (const p of s.particles) {
    const block = renderer.getBlock(p.glyph, f, size * 1.3);
    renderer.drawBlock(ctx, block, p.x, p.y, {
      color: p.color,
      align: 'center',
      verticalAlign: 'middle',
      alpha: Math.max(0, p.life),
    });
  }
}

// Umbrella
function drawUmbrella(s: GameState): void {
  const { umbrellaX: ux, umbrellaY: uy } = s;
  const size  = sz(W / 120, 6, 9);
  const f     = fnt(size, 700);
  const lineH = Math.round(size * 1.1);

  const umbrellaArt = [
    "           ___.----' `----.___",
    "       _.-'   .-'  F  `   -   `-._",
    "    .-'    .'           \\   `-    `-.",
    "  .'              J            `.    `.",
    " /___    /                L      `  .--`.",
    "'    `-.  _.---._ |_.---._ .--\"\"\"-.'",
    "        '        '  |     `",
    "                    |",
    "                    |",
    "                    |",
    "                    |",
    "                    |",
    "                    |",
    "                    |",
    "                    A",
    "                    H",
    "                    Yb   dB",
    "                     YbmdP",
  ];

  const comboGlow = s.combo >= 3;
  const glowColor = comboGlow ? COLORS.comboGold : COLORS.amber;
  const startY    = uy - lineH;

  const maxLineWidth = umbrellaArt.reduce((max, line) => {
    return Math.max(max, renderer.measureWidth(line, f));
  }, 0);
  const startX = ux - maxLineWidth / 2;

  s.umbrellaArtStartX = startX;
  s.umbrellaArtWidth  = maxLineWidth;
  s.umbrellaArtStartY = startY;
  s.umbrellaArtLineH  = lineH;

  for (let i = 0; i < umbrellaArt.length; i++) {
    const line        = umbrellaArt[i];
    const isSignature = line.includes('Yb') || line.includes('VK');
    const isHandle    = line.trim() === '|' || line.trim() === 'A' || line.trim() === 'H';
    const color       = isSignature ? COLORS.cyan
                      : isHandle    ? COLORS.umbrellaRim
                      :               COLORS.umbrella;
    const block = renderer.getBlock(line, f, lineH);
    renderer.drawBlock(ctx, block, startX, startY + i * lineH, {
      color,
      shadowColor: glowColor,
      shadowBlur: comboGlow ? 14 : 7,
    });
  }
}

// Umbrella rain slides
function drawUmbrellaSlides(s: GameState): void {
  if (s.umbrellaSlides.length === 0) return;
  const size = sz(W / 120, 6, 9);
  const f    = fnt(size, 700);
  const lh   = size * 1.3;

  for (const slide of s.umbrellaSlides) {
    const fadeAlpha = Math.max(0, slide.life * slide.alpha);
    if (fadeAlpha <= 0) continue;

    if (slide.phase === 'slide') {
      const g     = slide.dir === -1 ? '\\' : '/';
      const block = renderer.getBlock(g, f, lh);
      renderer.drawBlock(ctx, block, slide.x, slide.y, {
        color: COLORS.rain,
        align: 'center',
        verticalAlign: 'middle',
        alpha: fadeAlpha,
      });
    } else {
      const block = renderer.getBlock('|', f, lh);
      renderer.drawBlock(ctx, block, slide.x, slide.y, {
        color: COLORS.rain,
        align: 'center',
        verticalAlign: 'middle',
        alpha: fadeAlpha,
      });
      const dotBlock = renderer.getBlock('\u00b7', f, lh);
      renderer.drawBlock(ctx, dotBlock, slide.x, slide.y - size * 1.4, {
        color: COLORS.rainDim,
        align: 'center',
        verticalAlign: 'middle',
        alpha: fadeAlpha * 0.5,
      });
    }
  }
}

// Score popups
function drawScorePopups(s: GameState): void {
  const size = sz(W / 65, 9, 13);
  const f    = fnt(size, 700);
  for (const p of s.scorePopups) {
    const alpha = Math.min(1, p.life * 1.5);
    const block = renderer.getBlock(p.text, f, size * 1.3);
    renderer.drawBlock(ctx, block, p.x, p.y, {
      color: p.color,
      shadowColor: p.color,
      shadowBlur: 6,
      align: 'center',
      verticalAlign: 'middle',
      alpha,
    });
  }
}

// Level-up banner
function drawLevelUpBanner(s: GameState): void {
  if (s.levelUpTimer <= 0) return;
  const t     = s.levelUpTimer / 2.5;
  const alpha = t < 0.25 ? t * 4 : t > 0.75 ? (1 - t) * 4 : 1;
  const size  = sz(W / 45, 11, 17);
  const f     = fnt(size, 700);

  renderer.drawHRule(ctx, '\u2500', f, size + 4, 0, H * 0.44, W, {
    color: COLORS.dimGreen, alpha: alpha * 0.4,
  });
  renderer.drawText(ctx, s.levelUpText, f, size + 4, W / 2, H * 0.44 + 6, {
    color: COLORS.brightAmber,
    shadowColor: COLORS.amber,
    shadowBlur: 10,
    align: 'center',
    alpha,
  });
  renderer.drawHRule(ctx, '\u2500', f, size + 4, 0, H * 0.44 + size + 10, W, {
    color: COLORS.dimGreen, alpha: alpha * 0.4,
  });
}

// HUD top bar
function drawHUD(s: GameState): void {
  const size  = sz(W / 70, 10, 14);
  const fb    = fnt(size, 700);
  const f     = fnt(size);
  const pad   = 14;
  const barH  = size + 18;
  const lh    = size + 4;

  ctx.fillStyle = '#0d1117ee';
  ctx.fillRect(0, 0, W, barH);
  ctx.fillStyle = COLORS.dimGreen;
  ctx.fillRect(0, barH, W, 1);

  // Score
  const scoreStr = `SCORE: ${String(s.score).padStart(6, '0')}`;
  renderer.drawText(ctx, scoreStr, fb, lh, pad, barH / 2, {
    color: COLORS.green,
    align: 'left',
    verticalAlign: 'middle',
  });

  // Combo
  if (s.combo >= 2) {
    const comboAlpha = Math.min(1, s.combo * 0.2 + 0.4);
    const comboColor = s.combo >= 5 ? COLORS.comboGold : COLORS.brightAmber;
    renderer.drawText(ctx, `COMBO \xd7${s.combo}`, fnt(size - 1, 700), lh,
      W / 2 - 80, barH / 2, {
        color: comboColor,
        shadowColor: comboColor,
        shadowBlur: 8,
        verticalAlign: 'middle',
        alpha: comboAlpha,
      });
  }

  // HP
  const hpStr   = '\u2665'.repeat(s.hp) + '\u2661'.repeat(s.maxHp - s.hp);
  const hpColor = s.hp <= 1 ? COLORS.red : s.hp <= 2 ? COLORS.brightAmber : COLORS.cyan;
  const hpAlpha = (s.hp <= 1 && Math.floor(Date.now() / 350) % 2 === 0) ? 0.4 : 1;
  renderer.drawText(ctx, 'HP: ' + hpStr, fb, lh, W / 2 + 20, barH / 2, {
    color: hpColor,
    align: 'center',
    verticalAlign: 'middle',
    alpha: hpAlpha,
  });

  // Level / time
  const lvl = `LVL:${s.difficultyLevel + 1}  ${String(Math.floor(s.elapsed)).padStart(3, '0')}s`;
  renderer.drawText(ctx, lvl, f, lh, W - pad, barH / 2, {
    color: COLORS.dim,
    align: 'right',
    verticalAlign: 'middle',
  });
}

// Scanline overlay (CRT effect) — stays as direct ctx calls (no text, just pixel rows)
function drawScanlines(alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000000';
  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }
  ctx.restore();
}

// ─── Game over overlay ────────────────────────────────────────────────────────

function drawGameOver(s: GameState): void {
  ctx.fillStyle = '#0d1117';
  ctx.globalAlpha = 0.82;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  const cx    = W / 2;
  const cy    = H / 2;
  const size  = sz(W / 45, 12, 18);
  const lh    = size + 4;
  const boxW  = Math.min(440, W - 40);
  const boxH  = 200;
  const boxX  = cx - boxW / 2;
  const boxY  = cy - boxH / 2;

  renderer.drawGlyphBox(ctx, fnt(size), lh, boxX, boxY, boxW, boxH, {
    color: COLORS.red, alpha: 0.7,
  });

  renderer.drawText(ctx, '[ PROCESS KILLED ]', fnt(size + 4, 700), lh,
    cx, boxY + 22, {
      color: COLORS.red,
      shadowColor: COLORS.brightRed,
      shadowBlur: 16,
      align: 'center',
    });

  renderer.drawHRule(ctx, '\u2500', fnt(size - 2), lh, boxX + 10, boxY + 58,
    boxW - 20, { color: COLORS.dimGreen, alpha: 0.5 });

  renderer.drawText(ctx, `FINAL SCORE: ${s.score}`, fnt(size, 700), lh,
    cx, boxY + 74, { color: COLORS.amber, align: 'center' });

  renderer.drawText(ctx,
    `SURVIVED: ${Math.floor(s.elapsed)}s   LEVEL REACHED: ${s.difficultyLevel + 1}`,
    fnt(size - 1), lh, cx, boxY + 100, { color: COLORS.dim, align: 'center' });

  if (s.combo > 1) {
    renderer.drawText(ctx, `BEST COMBO: \xd7${s.combo}`, fnt(size - 1), lh,
      cx, boxY + 122, { color: COLORS.cyan, align: 'center' });
  }

  renderer.drawHRule(ctx, '\u2500', fnt(size - 2), lh, boxX + 10, boxY + 148,
    boxW - 20, { color: COLORS.dimGreen, alpha: 0.5 });

  const blink = Math.floor(Date.now() / 500) % 2 === 0;
  if (blink) {
    renderer.drawText(ctx, '> Press R / ENTER / tap to restart', fnt(size - 1), lh,
      cx, boxY + 162, { color: COLORS.green, align: 'center' });
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

function canvasPos(e: MouseEvent | Touch): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function bindEvents(): void {
  window.addEventListener('resize', () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    resize();
    buildStars(W, H);
  });

  window.addEventListener('keydown', (e) => {
    resumeAudio();
    handleKeyDown(state, e.key);
  });

  window.addEventListener('keyup', (e) => {
    handleKeyUp(state, e.key);
  });

  canvas.addEventListener('mousemove', (e) => {
    handlePointerMove(state, canvasPos(e).x, canvasPos(e).y);
  });

  canvas.addEventListener('mousedown', (e) => {
    resumeAudio();
    const p = canvasPos(e);
    handlePointerDown(state, p.x, p.y);
  });

  window.addEventListener('mouseup', () => handlePointerUp(state));

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    handlePointerMove(state, canvasPos(e.touches[0]).x, canvasPos(e.touches[0]).y);
  }, { passive: false });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    resumeAudio();
    const p = canvasPos(e.touches[0]);
    handlePointerDown(state, p.x, p.y);
  }, { passive: false });

  window.addEventListener('touchend', () => handlePointerUp(state));
}

// ─── Go ───────────────────────────────────────────────────────────────────────

init();
