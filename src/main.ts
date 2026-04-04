import './style.css';
import {
  createInitialState,
  update,
  handleKeyDown,
  handlePointerMove,
  handlePointerDown,
  handlePointerUp,
  COLORS,
  type GameState,
  type AudioEvent,
} from './game.ts';
import {
  clearCanvas,
  drawText,
  drawTextShadow,
  drawHRule,
  measureText,
  drawGlyphBox,
} from './pretext-renderer.ts';

// ─── Canvas ───────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

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
    state.travelerY = H * 0.72;
    state.umbrellaW = Math.max(80, Math.min(220, W * 0.18));
  }
}

// ─── Font helpers ─────────────────────────────────────────────────────────────

function fnt(size: number, weight: 400 | 700 = 400): string {
  return `${weight} ${size}px "IBM Plex Mono", monospace`;
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
  startTime?: number
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
// Pre-generate star positions once; reuse each frame.

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
  clearCanvas(ctx, COLORS.bg, W, H);
  if (s.phase === 'boot') {
    drawBoot(s);
  } else {
    drawGame(s);
    if (s.phase === 'dead') drawGameOver(s);
  }
}

// ─── Boot screen ─────────────────────────────────────────────────────────────

function drawBoot(s: GameState): void {
  const cx   = W / 2;
  const lh   = sz(H / 24, 20, 28);
  const size = sz(W / 60, 11, 15);
  const startY = H * 0.18;
  const indent = cx - sz(W * 0.28, 120, 230);

  // Scanlines
  drawScanlines(0.04);

  // Logo
  const logoFont = fnt(size + 5, 700);
  drawTextShadow(ctx, '[ BLASTER HACK ]', cx, startY - lh * 2.2, logoFont,
    COLORS.green, COLORS.green, 16, 'center', 'top');

  // Rule under logo
  drawHRule(ctx, indent, startY - lh * 0.7, sz(W * 0.56, 240, 460), fnt(size - 1), COLORS.dimGreen, '\u2500', 0.6);

  // Boot lines
  for (let i = 0; i < s.bootLines.length; i++) {
    const line    = s.bootLines[i];
    const isLast  = i === s.bootLines.length - 1;
    const isWarn  = line.startsWith('\u26a0');
    const isPrompt = line.startsWith('>');
    const color   = isPrompt ? COLORS.amber
                  : isWarn   ? COLORS.red
                  : isLast   ? COLORS.white
                  :             COLORS.dimGreen;
    const f = (isPrompt || isWarn) ? fnt(size, 700) : fnt(size);

    if (isPrompt && s.bootDone) {
      // Strip the trailing placeholder underscore from BOOT_LINES
      const display = line.replace(/ _$/, '');
      drawText(ctx, display, indent, startY + i * lh, f, color, 'left', 'top');
      // Blinking cursor
      if (s.promptBlink) {
        const tw = measureText(ctx, display + ' ', f).width;
        drawText(ctx, '_', indent + tw, startY + i * lh, f, COLORS.amber, 'left', 'top');
      }
    } else {
      drawText(ctx, line, indent, startY + i * lh, f, color, 'left', 'top');
    }
  }

  // Footer
  drawText(ctx, 'BLASTER HACK COMMANDLINE GAME  //  v1.0', cx, H - 18,
    fnt(size - 3), COLORS.dim, 'center', 'top', 0.4);
}

// ─── Game world ───────────────────────────────────────────────────────────────

function drawGame(s: GameState): void {
  drawStars(s);
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

  // Scanlines (subtle always-on)
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

// Ground
function drawGround(s: GameState): void {
  const groundY = s.travelerY + 45;
  const size    = sz(W / 80, 9, 12);
  const f       = fnt(size);

  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, groundY, W, H - groundY);

  // Scrolling block-char strip
  const pattern = '\u2593\u2592\u2591\xb7\u2592\u2591\u2593\u2592\u2591';
  const charW   = measureText(ctx, '\u2593', f).width;
  const totalW  = pattern.length * charW;
  let x = -(s.groundOffset % totalW);
  ctx.save();
  ctx.font = f;
  ctx.fillStyle = COLORS.groundText;
  ctx.textBaseline = 'top';
  ctx.globalAlpha = 0.55;
  while (x < W + totalW) {
    ctx.fillText(pattern, x, groundY + 2);
    x += totalW;
  }
  ctx.restore();

  // Top-of-ground green line
  ctx.fillStyle = COLORS.dimGreen;
  ctx.fillRect(0, groundY, W, 1);
}

// Wind indicator (subtle directional text on bottom-left)
function drawWindIndicator(s: GameState): void {
  if (Math.abs(s.windX) < 5) return;
  const dir   = s.windX > 0 ? '>>>' : '<<<';
  const speed = Math.abs(s.windX).toFixed(0);
  const size  = sz(W / 90, 8, 11);
  const alpha = Math.min(0.6, Math.abs(s.windX) / 80);
  const groundY = s.travelerY + 45;
  drawText(ctx, `WIND ${dir} ${speed}`, 12, groundY + 6, fnt(size), COLORS.cyan, 'left', 'top', alpha);
}

// Traveler
const TRAVELER_FRAMES = ['(^)', '(o)', '(^)', '(-)'];
let tFrame = 0;
let tTimer = 0;

function drawTraveler(s: GameState): void {
  tTimer += 0.016;
  if (tTimer > 0.18) { tTimer = 0; tFrame = (tFrame + 1) % TRAVELER_FRAMES.length; }

  const size = sz(W / 40, 14, 22);
  const f    = fnt(size, 700);

  // Blink on hit invincibility
  const visible = s.hitCooldown > 0 ? (Math.floor(s.hitCooldown * 9) % 2 === 0) : true;
  if (!visible) return;

  const glow = s.hitCooldown > 0 ? COLORS.brightRed : COLORS.green;
  drawTextShadow(ctx, TRAVELER_FRAMES[tFrame], s.travelerX, s.travelerY,
    f, COLORS.traveler, glow, 8, 'center', 'top');
  drawText(ctx, '/|\\', s.travelerX, s.travelerY + size + 2,    f, COLORS.traveler, 'center', 'top');
  drawText(ctx, '/ \\', s.travelerX, s.travelerY + size * 2 + 2, f, COLORS.traveler, 'center', 'top');
}

// Hazards
function drawHazards(s: GameState): void {
  const groundY = s.travelerY + 45;
  for (const h of s.hazards) {
    if (h.y > groundY) continue;
    const base = h.type === 'hail' ? sz(W / 55, 12, 17) : sz(W / 65, 10, 14);
    const size = Math.round(base * h.size);
    const f    = fnt(size);
    const color = h.type === 'rain' ? COLORS.rain
                : h.type === 'snow' ? COLORS.snow
                :                     COLORS.hail;
    // Fade in from top
    const alpha = Math.min(1, (h.y + 30) / 30);
    drawText(ctx, h.glyph, h.x, h.y, f, color, 'center', 'middle', alpha);
  }
}

// Particles
function drawParticles(s: GameState): void {
  const size = sz(W / 70, 8, 12);
  const f    = fnt(size);
  for (const p of s.particles) {
    drawText(ctx, p.glyph, p.x, p.y, f, p.color, 'center', 'middle', Math.max(0, p.life));
  }
}

// Umbrella — glyph arc + handle
function drawUmbrella(s: GameState): void {
  const { umbrellaX: ux, umbrellaY: uy } = s;
  const size = sz(W / 120, 6, 9);
  const f = fnt(size, 700);
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
  const startY = uy - lineH;
  const maxLineWidth = umbrellaArt.reduce((max, line) => {
    const w = measureText(ctx, line, f).width;
    return Math.max(max, w);
  }, 0);
  const startX = ux - maxLineWidth / 2;

  // Write real art pixel geometry into state so slide logic uses accurate coords
  s.umbrellaArtStartX = startX;
  s.umbrellaArtWidth  = maxLineWidth;
  s.umbrellaArtStartY = startY;
  s.umbrellaArtLineH  = lineH;

  for (let i = 0; i < umbrellaArt.length; i++) {
    const line = umbrellaArt[i];
    const isSignature = line.includes('Yb') || line.includes('VK');
    const isHandle = line.trim() === '|' || line.trim() === 'A' || line.trim() === 'H';
    const color = isSignature
      ? COLORS.cyan
      : isHandle
        ? COLORS.umbrellaRim
        : COLORS.umbrella;
    drawTextShadow(
      ctx,
      line,
      startX,
      startY + i * lineH,
      f,
      color,
      glowColor,
      comboGlow ? 14 : 7,
      'left',
      'top'
    );
  }
}

// Umbrella rain slides — drops streaming along the canopy surface then dripping off
function drawUmbrellaSlides(s: GameState): void {
  if (s.umbrellaSlides.length === 0) return;

  const size = sz(W / 120, 6, 9);
  const f = fnt(size, 700);

  for (const slide of s.umbrellaSlides) {
    const fadeAlpha = Math.max(0, slide.life * slide.alpha);
    if (fadeAlpha <= 0) continue;

    if (slide.phase === 'slide') {
      // Sliding along canopy: use a directional glyph (/ for left-moving, \ for right)
      // dir=-1 means moving left so the streak trails rightward → use backslash
      const g = slide.dir === -1 ? '\\' : '/';
      drawText(ctx, g, slide.x, slide.y, f, COLORS.rain, 'center', 'middle', fadeAlpha);
    } else {
      // Dripping off the edge: vertical drop with a fading tail
      drawText(ctx, '|', slide.x, slide.y, f, COLORS.rain, 'center', 'middle', fadeAlpha);
      // Faint dot above as a tail
      drawText(ctx, '\u00b7', slide.x, slide.y - size * 1.4, f, COLORS.rainDim,
        'center', 'middle', fadeAlpha * 0.5);
    }
  }
}

// Score popups
function drawScorePopups(s: GameState): void {
  const size = sz(W / 65, 9, 13);
  for (const p of s.scorePopups) {
    const alpha = Math.min(1, p.life * 1.5);
    drawTextShadow(ctx, p.text, p.x, p.y, fnt(size, 700), p.color,
      p.color, 6, 'center', 'middle', alpha);
  }
}

// Level-up banner
function drawLevelUpBanner(s: GameState): void {
  if (s.levelUpTimer <= 0) return;
  const t     = s.levelUpTimer / 2.5; // 0..1 countdown
  const alpha = t < 0.25 ? t * 4 : t > 0.75 ? (1 - t) * 4 : 1;
  const size  = sz(W / 45, 11, 17);
  const f     = fnt(size, 700);

  drawHRule(ctx, 0, H * 0.44, W, f, COLORS.dimGreen, '\u2500', alpha * 0.4);
  drawTextShadow(ctx, s.levelUpText, W / 2, H * 0.44 + 6, f,
    COLORS.brightAmber, COLORS.amber, 10, 'center', 'top', alpha);
  drawHRule(ctx, 0, H * 0.44 + size + 10, W, f, COLORS.dimGreen, '\u2500', alpha * 0.4);
}

// HUD top bar
function drawHUD(s: GameState): void {
  const size  = sz(W / 70, 10, 14);
  const fb    = fnt(size, 700);
  const f     = fnt(size);
  const pad   = 14;
  const barH  = size + 18;

  // BG
  ctx.fillStyle = '#0d1117ee';
  ctx.fillRect(0, 0, W, barH);
  ctx.fillStyle = COLORS.dimGreen;
  ctx.fillRect(0, barH, W, 1);

  // Score
  const scoreStr = `SCORE: ${String(s.score).padStart(6, '0')}`;
  drawText(ctx, scoreStr, pad, barH / 2, fb, COLORS.green, 'left', 'middle');

  // Combo
  if (s.combo >= 2) {
    const comboAlpha = Math.min(1, s.combo * 0.2 + 0.4);
    const comboColor = s.combo >= 5 ? COLORS.comboGold : COLORS.brightAmber;
    drawTextShadow(ctx, `COMBO \xd7${s.combo}`, W / 2 - 80, barH / 2, fnt(size - 1, 700),
      comboColor, comboColor, 8, 'left', 'middle', comboAlpha);
  }

  // HP hearts
  const hpStr   = '\u2665'.repeat(s.hp) + '\u2661'.repeat(s.maxHp - s.hp);
  const hpLabel = 'HP: ';
  const hpColor = s.hp <= 1 ? COLORS.red : s.hp <= 2 ? COLORS.brightAmber : COLORS.cyan;
  // Blink HP at 1 heart
  const hpAlpha = (s.hp <= 1 && Math.floor(Date.now() / 350) % 2 === 0) ? 0.4 : 1;
  drawText(ctx, hpLabel + hpStr, W / 2 + 20, barH / 2, fb, hpColor, 'center', 'middle', hpAlpha);

  // Level / time
  const lvl = `LVL:${s.difficultyLevel + 1}  ${String(Math.floor(s.elapsed)).padStart(3, '0')}s`;
  drawText(ctx, lvl, W - pad, barH / 2, f, COLORS.dim, 'right', 'middle');
}

// Scanline overlay (CRT effect)
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
  // Dim
  ctx.fillStyle = '#0d1117';
  ctx.globalAlpha = 0.82;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  const cx    = W / 2;
  const cy    = H / 2;
  const size  = sz(W / 45, 12, 18);
  const boxW  = Math.min(440, W - 40);
  const boxH  = 200;
  const boxX  = cx - boxW / 2;
  const boxY  = cy - boxH / 2;

  // Glyph box border
  drawGlyphBox(ctx, boxX, boxY, boxW, boxH, fnt(size), COLORS.red, 0.7);

  // Title
  drawTextShadow(ctx, '[ PROCESS KILLED ]', cx, boxY + 22, fnt(size + 4, 700),
    COLORS.red, COLORS.brightRed, 16, 'center', 'top');

  // Divider
  drawHRule(ctx, boxX + 10, boxY + 58, boxW - 20, fnt(size - 2), COLORS.dimGreen, '\u2500', 0.5);

  // Stats
  drawText(ctx, `FINAL SCORE: ${s.score}`,
    cx, boxY + 74, fnt(size, 700), COLORS.amber, 'center', 'top');
  drawText(ctx, `SURVIVED: ${Math.floor(s.elapsed)}s   LEVEL REACHED: ${s.difficultyLevel + 1}`,
    cx, boxY + 100, fnt(size - 1), COLORS.dim, 'center', 'top');

  if (s.combo > 1) {
    drawText(ctx, `BEST COMBO: \xd7${s.combo}`,
      cx, boxY + 122, fnt(size - 1), COLORS.cyan, 'center', 'top');
  }

  drawHRule(ctx, boxX + 10, boxY + 148, boxW - 20, fnt(size - 2), COLORS.dimGreen, '\u2500', 0.5);

  // Restart prompt
  const blink = Math.floor(Date.now() / 500) % 2 === 0;
  if (blink) {
    drawText(ctx, '> Press R / ENTER / tap to restart',
      cx, boxY + 162, fnt(size - 1), COLORS.green, 'center', 'top');
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
