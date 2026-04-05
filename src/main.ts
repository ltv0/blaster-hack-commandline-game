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
    // Recreate / resize the particle simulation so the field grids
    // and sampling scales match the new window dimensions. This keeps
    // the cloud topology and emit-point sampling aligned with the
    // visible canvas when the window is resized larger or smaller.
    initParticleSystem();
  }
}

const FONT_FAMILY = '"IBM Plex Mono", monospace';
//const CLOUD_FONT_FAMILY = '"IBM Plex Sans", sans-serif'; for proportional
const CLOUD_FONT_FAMILY = '"IBM Plex Mono", monospace';
function fnt(size: number, weight: 400 | 700 = 400): string {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}
function cloudFnt(size: number, weight: 400 | 700 = 700): string {
  return `italic ${weight} ${size}px ${CLOUD_FONT_FAMILY}`;
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
interface BgRepulsor { x: number; y: number; radius: number; strength: number; }
interface BgOccluder { x: number; y: number; w: number; h: number; }
interface BgInterval { left: number; right: number; }
let bgCells: BgCell[] = [];
let bgCols = 0; let bgRows = 0; let bgCellW = 0; let bgCellH = 0; let bgFont = '';
let bgHoverActive = false;
let bgHoverPulse = 0;
let bgHoverX = 0;
let bgHoverY = 0;
let bgHoverTargetX = 0;
let bgHoverTargetY = 0;

function buildAsciiBackground(): void {
  const size = sz(W / 95, 20, 20);
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
  bgHoverX = W * 0.5;
  bgHoverY = H * 0.45;
  bgHoverTargetX = bgHoverX;
  bgHoverTargetY = bgHoverY;
}
function updateAsciiBackground(dt: number): void {
  const follow = Math.min(1, dt * (bgHoverActive ? 14 : 6));
  bgHoverX += (bgHoverTargetX - bgHoverX) * follow;
  bgHoverY += (bgHoverTargetY - bgHoverY) * follow;
  bgHoverPulse += dt * (bgHoverActive ? 7 : 3);
  if (bgHoverPulse > Math.PI * 2) bgHoverPulse -= Math.PI * 2;

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

// ─── Pretext-style circle obstacle for true text wrap ─────────────────────────
interface BgCircleObstacle { cx: number; cy: number; rx: number; ry: number; hPad: number; vPad: number; }

/**
 * Compute the horizontal interval blocked by an ellipse (rx, ry) at a given
 * vertical band [bandTop, bandBottom], with padding.  Returns null if the
 * band doesn't intersect the ellipse.  Adapted directly from the pretext
 * editorial-engine demo's circleIntervalForBand.
 */
function ellipseIntervalForBand(
  cx: number, cy: number,
  rx: number, ry: number,
  bandTop: number, bandBottom: number,
  hPad: number, vPad: number,
): BgInterval | null {
  const top    = bandTop    - vPad;
  const bottom = bandBottom + vPad;
  if (top >= cy + ry || bottom <= cy - ry) return null;
  // Closest y on [top, bottom] to cy
  const minDy = cy >= top && cy <= bottom ? 0 : cy < top ? top - cy : cy - bottom;
  if (minDy >= ry) return null;
  // Ellipse: (x/rx)²+(y/ry)²=1 → maxDx at minDy
  const maxDx = rx * Math.sqrt(1 - (minDy / ry) ** 2);
  return { left: cx - maxDx - hPad, right: cx + maxDx + hPad };
}

/**
 * Carve blocked intervals out of a base interval, returning the remaining
 * open slots.  Directly from the pretext editorial-engine demo.
 */
function carveTextLineSlots(base: BgInterval, blocked: BgInterval[]): BgInterval[] {
  let slots: BgInterval[] = [{ left: base.left, right: base.right }];
  for (let bi = 0; bi < blocked.length; bi++) {
    const interval = blocked[bi]!;
    const next: BgInterval[] = [];
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]!;
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot);
        continue;
      }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left });
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right });
    }
    slots = next;
  }
  return slots;
}

function mergeBlockedIntervals(intervals: BgInterval[], minX: number, maxX: number): BgInterval[] {
  if (intervals.length === 0) return [];
  const clamped = intervals
    .map((it) => ({ left: Math.max(minX, it.left), right: Math.min(maxX, it.right) }))
    .filter((it) => it.right > it.left)
    .sort((a, b) => a.left - b.left);
  if (clamped.length === 0) return [];

  const merged: BgInterval[] = [clamped[0]!];
  for (let i = 1; i < clamped.length; i++) {
    const cur = clamped[i]!;
    const last = merged[merged.length - 1]!;
    if (cur.left <= last.right) {
      last.right = Math.max(last.right, cur.right);
    } else {
      merged.push({ left: cur.left, right: cur.right });
    }
  }
  return merged;
}

/**
 * Given a glyph x position and the open slots for this row, return whether
 * the glyph is in a slot and how close it is to the nearest slot edge
 * (wrapT=1 means right at the edge, 0 means far from any edge).
 */
function glyphSlotResult(
  x: number,
  slots: BgInterval[],
  glowWidth: number,
): { inSlot: boolean; wrapT: number } {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    if (x < s.left || x > s.right) continue;
    // In slot — measure closeness to either edge
    const distLeft  = x - s.left;
    const distRight = s.right - x;
    const edgeDist  = Math.min(distLeft, distRight);
    const wrapT = Math.max(0, 1 - edgeDist / glowWidth);
    return { inSlot: true, wrapT };
  }
  return { inSlot: false, wrapT: 0 };
}

function drawAsciiBackground(
  scrollY: number,
  baseAlpha: number,
  tintColor: string,
  repulsors: BgRepulsor[] = [],
  occluders: BgOccluder[] = [],
  circleObstacles: BgCircleObstacle[] = [],
): void {
  if (bgCells.length === 0 || bgCols === 0) return;
  ctx.save();
  const scrolledY = scrollY % bgCellH;
  const groundY = H * 0.84;
  const hoverRadius = Math.max(95, Math.min(230, W * 0.2));
  const hoverPush = 8.5;
  const hoverBoost = 0.42 + 0.14 * Math.sin(bgHoverPulse);
  // Glow width: how many px from a slot edge counts as "near the wrap"
  const glowWidth = bgCellW * 1.0;  // tight glow — only 1 char from the edge

  for (let row = 0; row < bgRows; row++) {
    const y = row * bgCellH - scrolledY;
    if (y > groundY + bgCellH) continue;

    const bandTop    = y;
    const bandBottom = y + bgCellH;

    // --- Collect all blocked intervals for this band ---
    const blocked: BgInterval[] = [];

    // Rect occluders (axis-aligned boxes — hard blanks, e.g. HUD)
    for (let oi = 0; oi < occluders.length; oi++) {
      const o = occluders[oi]!;
      if (bandBottom <= o.y || bandTop >= o.y + o.h) continue;
      blocked.push({ left: o.x, right: o.x + o.w });
    }

    // Circle/ellipse obstacles (pretext-style true wrap)
    for (let ci = 0; ci < circleObstacles.length; ci++) {
      const co = circleObstacles[ci]!;
      const interval = ellipseIntervalForBand(
        co.cx, co.cy, co.rx, co.ry,
        bandTop, bandBottom, co.hPad, co.vPad,
      );
      if (interval !== null) blocked.push(interval);
    }

    // Carve open slots from [0, W]
    const slots = carveTextLineSlots({ left: 0, right: W }, blocked);
    if (slots.length === 0) continue;

    for (let col = 0; col < bgCols; col++) {
      const x = col * bgCellW;
      const idx = row * bgCols + col;
      if (idx >= bgCells.length) continue;

      // True wrap: only draw if this glyph's x falls inside an open slot
      const slotResult = glyphSlotResult(x, slots, glowWidth);
      if (!slotResult.inSlot) continue;

      const cell = bgCells[idx]!;
      const pulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(cell.phase));

      // Hover push (mouse proximity)
      const dx = x - bgHoverX;
      const dy = y - bgHoverY;
      const dist = Math.hypot(dx, dy);
      const hoverT = Math.max(0, 1 - dist / hoverRadius);
      const push = hoverT * hoverPush;
      const dirX = dist > 0.0001 ? dx / dist : 0;
      const dirY = dist > 0.0001 ? dy / dist : -1;
      const warp = bgHoverActive ? 1 : 0.42;

      // Object repulsors (hazards, clouds — still push, not carve)
      let objectPushX = 0;
      let objectPushY = 0;
      let objectBoost = 0;
      for (let ri = 0; ri < repulsors.length; ri++) {
        const rep = repulsors[ri]!;
        const odx = x - rep.x;
        const ody = y - rep.y;
        const od = Math.hypot(odx, ody);
        if (od >= rep.radius) continue;
        const t = 1 - od / rep.radius;
        const mag = t * t * rep.strength;
        const oux = od > 0.0001 ? odx / od : (col % 2 === 0 ? 1 : -1);
        const ouy = od > 0.0001 ? ody / od : -1;
        objectPushX += oux * mag;
        objectPushY += ouy * mag;
        objectBoost += t;
      }

      const drawX = x + dirX * push * warp + objectPushX;
      const drawY = y + dirY * push * warp + objectPushY;

      // wrapT brightens glyphs at the silhouette edge — the "wrap glow"
      const alpha = baseAlpha * pulse
        * (1.2 + hoverT * hoverBoost)
        * (1 + Math.min(0.35, objectBoost * 0.12))
        * (1 + slotResult.wrapT * 0.55);   // edge glow: up to +55% brightness

      if (alpha < 0.004) continue;
      const block = renderer.getBlock(BG_CHARS[cell.charIndex!], bgFont, bgCellH);
      renderer.drawBlock(ctx, block, drawX, drawY, { color: tintColor, alpha });
    }
  }
  ctx.restore();
}

function buildBackgroundRepulsors(s: GameState): BgRepulsor[] {
  const out: BgRepulsor[] = [];
  // Note: umbrella and traveler are now handled by circle obstacles (true wrap),
  // not repulsors.  Only soft-push effects remain here for hazards and clouds.

  // Clouds use circle obstacles (true wrap) — no cloud repulsors here.

  const hazardCount = Math.min(28, s.hazards.length);
  for (let i = 0; i < hazardCount; i++) {
    const h = s.hazards[i];
    out.push({
      x: h.x,
      y: h.y,
      radius: h.type === 'hail' ? 30 : 24,
      strength: h.type === 'hail' ? 6.5 : 5.2,
    });
  }

  return out;
}

function buildBackgroundOccluders(s: GameState): BgOccluder[] {
  const out: BgOccluder[] = [];
  // Traveler body — keep as a tight rect occluder so the body centre stays clean.
  // The circle obstacle adds the wrap glow around it; the rect ensures nothing
  // draws inside the sprite itself.
  const travelerSize = sz(W / 40, 14, 22);
  const travelerW = travelerSize * 3.2;   // tighter than before — circle obstacle handles outer wrap
  const travelerH = travelerSize * 3.6;
  out.push({
    x: s.travelerX - travelerW * 0.5,
    y: s.travelerY - travelerSize * 0.1,
    w: travelerW,
    h: travelerH,
  });
  // Umbrella is fully handled by the circle obstacles — no rect occluder needed.
  return out;
}

/**
 * Build pretext-style ellipse obstacles for the umbrella canopy and the
 * traveler body so that the ASCII background text wraps around them using
 * true slot-carving instead of the old push/repulsor approach.
 */
function buildBackgroundCircleObstacles(s: GameState): BgCircleObstacle[] {
  const out: BgCircleObstacle[] = [];

  // ── Umbrella canopy ──────────────────────────────────────────────────────
  const umbrellaSize = sz(W / 100, 7, 11);
  const umbrellaLineH = s.umbrellaArtLineH > 0 ? s.umbrellaArtLineH : Math.round(umbrellaSize * 1.15);
  const artW = s.umbrellaArtWidth > 0 ? s.umbrellaArtWidth : Math.max(120, s.umbrellaW * 1.2);
  const artStartX = Number.isFinite(s.umbrellaArtStartX) ? s.umbrellaArtStartX : s.umbrellaX - artW * 0.5;
  const artStartY = Number.isFinite(s.umbrellaArtStartY) ? s.umbrellaArtStartY : s.umbrellaY - umbrellaLineH;

  // Canopy: the umbrella arch is dome-shaped — widest at the bottom rim,
  // narrowing to a peak at the top.  Bias the ellipse centre DOWN toward
  // the rim so its upper half only blocks the narrow peak area, allowing
  // background glyphs to wrap in tight at the top of the arch.
  const UMBRELLA_CANOPY_LINES_BG = 6;
  const canopyRimY = artStartY + UMBRELLA_CANOPY_LINES_BG * umbrellaLineH; // bottom of canopy
  const canopyCx = artStartX + artW / 2;
  // Centre is 70% of the way down from artStartY to the rim — bottom-heavy
  const canopyCy = artStartY + UMBRELLA_CANOPY_LINES_BG * umbrellaLineH * 0.70;
  const canopyRx = artW / 2;
  // ry: distance from centre to the rim (below) — top clips naturally
  const canopyRy = canopyRimY - canopyCy;
  out.push({ cx: canopyCx, cy: canopyCy, rx: canopyRx, ry: canopyRy, hPad: 2, vPad: 1 });

  // Handle + foot: narrow — just covers the stick character
  const HANDLE_LINES_BG = 12;
  const handleTop = artStartY + UMBRELLA_CANOPY_LINES_BG * umbrellaLineH;
  const handleCy  = handleTop + (HANDLE_LINES_BG * umbrellaLineH) / 2;
  out.push({
    cx: canopyCx, cy: handleCy,
    rx: bgCellW * 1.1, ry: (HANDLE_LINES_BG * umbrellaLineH) / 2,
    hPad: 2, vPad: 1,
  });

  // ── Traveler ─────────────────────────────────────────────────────────────
  const travelerSize = sz(W / 40, 14, 22);
  out.push({
    cx: s.travelerX,
    cy: s.travelerY + travelerSize * 1.2,
    rx: travelerSize * 1.5,
    ry: travelerSize * 1.9,
    hPad: 2,
    vPad: 1,
  });

  // ── Clouds ───────────────────────────────────────────────────────────────
  // Use the same geometry as drawClouds: hudH+5 for startY, 4 art lines tall.
  // Bottom-biased ellipse so text wraps in close at top and hugs the base.
  const cloudFontSize  = sz(W / 75, 9, 14);
  const cloudLineH     = Math.round(cloudFontSize * 1.35);
  const cloudHudH      = sz(W / 70, 10, 14) + 20;
  const cloudStartY    = cloudHudH + 5;
  const CLOUD_ART_LINES = 4;
  const cloudArtH      = CLOUD_ART_LINES * cloudLineH;
  for (let i = 0; i < Math.min(8, s.clouds.length); i++) {
    const c = s.clouds[i]!;
    const artW     = c.artW > 0 ? c.artW : Math.max(80, Math.min(220, W * 0.18));
    const cloudTopY = Math.max(cloudStartY, c.y);
    // Centre biased 70% toward bottom so upper rows stay open longer
    const cloudCy  = cloudTopY + cloudArtH * 0.70;
    const cloudRy  = cloudArtH * 0.30;   // distance from centre to bottom rim
    out.push({ cx: c.x, cy: cloudCy, rx: artW / 2, ry: cloudRy, hPad: 2, vPad: 1 });
  }

  return out;
}

// ─── State + loop ─────────────────────────────────────────────────────────────
let state: GameState;
function init(): void {
  resize(); buildStars(W, H); buildAsciiBackground();
  initParticleSystem();
  state = createInitialState(W, H);
  bindEvents();
  requestAnimationFrame(loop);
}
let lastTime = 0;
function loop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateParticleSystem(dt);
  updateCloudEmitPoints(state);
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

    const lines = getCloudLines(cloud, s.elapsed);
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
  grad.addColorStop(0,   '#050d18');
  grad.addColorStop(0.55,'#0a1727');
  grad.addColorStop(1,   '#122438');
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

  drawAsciiBackground(0, 0.24, COLORS.brightGreen);
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
  const repulsors = buildBackgroundRepulsors(s);
  const occluders = buildBackgroundOccluders(s);
  const circleObstacles = buildBackgroundCircleObstacles(s);
  drawAsciiBackground(s.bgStarOffset * 0.3, 0.21, '#a9f7c4', repulsors, occluders, circleObstacles);
  if (SHOW_CLOUD_SOURCE_FIELD) drawSourceField();
  drawStars(s);
  drawClouds(s);
  drawGround(s);
  drawTraveler(s);
  drawHazards(s);
  drawScorePopups(s);
  drawParticles(s);
  drawHeartExplosions(s);
  drawUmbrella(s);
  drawUmbrellaSlides(s);
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
const CLOUD_CHARSET = ' .,-:;=+*#%R';
const CLOUD_CHARSETS: Record<'rain' | 'snow' | 'hail', string> = {
  rain: CLOUD_CHARSET,
  snow: ' .,-:;=+*#%S',
  hail: ' .,-:;=+*#%H',
};
const CLOUD_EMIT_BRIGHTNESS = 0.22;
const CLOUD_EMIT_SAMPLE_COLS = 18;
const CLOUD_EMIT_SAMPLE_ROWS = 8;
const CLOUD_EMIT_MAX_POINTS = 72;
function brightnessToCharsetIndex(brightness: number): number {
  const adjusted = Math.sqrt(brightness);
  return Math.min(Math.max(Math.floor(adjusted * (CLOUD_CHARSET.length - 1)), 0), CLOUD_CHARSET.length - 1);
}
const SHOW_CLOUD_SOURCE_FIELD = false;

// Particle system for cloud source field
const FIELD_OVERSAMPLE = 2;
let FIELD_COLS = 0;
let FIELD_ROWS = 0;
const PARTICLE_N = 30;
const SPRITE_R = 32;
const ATTRACTOR_N = 3;
const ATTRACTOR_R = 44;
const ATTRACTOR_FORCE = 90;
const FIELD_DECAY = 0.95;
let CANVAS_W = 0;
let CANVAS_H = 200;
let FIELD_SCALE_X = 0;
let FIELD_SCALE_Y = 0;

type ParticleType = 'rain' | 'snow' | 'hail';
interface Particle { x: number; y: number; vx: number; vy: number; phase: number; type: ParticleType }
interface Attractor { x: number; y: number; vx: number; vy: number; strength: number; }
interface FieldStamp { radiusX: number; radiusY: number; sizeX: number; sizeY: number; values: Float32Array; }

let particles: Particle[] = [];
let attractors: Attractor[] = [];
let brightnessField: Float32Array;
let particleTypeField: Uint8Array;
let particleFieldStamp: FieldStamp;
let attractorFieldStamp: FieldStamp;
let spriteCache = new Map<number, HTMLCanvasElement>();

// --- Particle type weights (easy to change / extend) ---
// Keys are particle type names; values are relative weights (do not need to sum to 1).
let PARTICLE_TYPE_WEIGHTS: Record<string, number> = {
  rain: 1.0,
  snow: 0.0,
  hail: 0.0,
};

// Update particle type weights as level increases
function updateParticleTypeWeights(level: number) {
  // Level 1: rain 100, snow 0, hail 0
  if (level <= 1) {
    PARTICLE_TYPE_WEIGHTS = { rain: 1.0, snow: 0.0, hail: 0.0 };
    return;
  }
  // Each level: rain -10, snow +5, hail +5 (percentages)
  let rain = 1.0 - 0.10 * (level - 1);
  let snow = 0.05 * (level - 1);
  let hail = 0.05 * (level - 1);
  // Clamp values
  rain = Math.max(0, rain);
  snow = Math.max(0, snow);
  hail = Math.max(0, hail);
  // Normalize if sum > 1
  const sum = rain + snow + hail;
  if (sum > 1) {
    rain /= sum;
    snow /= sum;
    hail /= sum;
  }
  PARTICLE_TYPE_WEIGHTS = { rain, snow, hail };
}

// build an ordinal map so each type maps to a small integer (1..N) for compact storage
const PARTICLE_TYPE_KEYS = Object.keys(PARTICLE_TYPE_WEIGHTS);
const PARTICLE_TYPE_ORDINAL: Record<string, number> = {};
for (let i = 0; i < PARTICLE_TYPE_KEYS.length; i++) PARTICLE_TYPE_ORDINAL[PARTICLE_TYPE_KEYS[i]] = i + 1;

function sampleTypeFromWeights(weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return entries[0]![0];
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= Math.max(0, w);
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}

function getSpriteCanvas(radius: number): HTMLCanvasElement {
  const cached = spriteCache.get(radius);
  if (cached !== undefined) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = radius * 2;
  canvas.height = radius * 2;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('sprite context not available');
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, radius * 2, radius * 2);
  spriteCache.set(radius, canvas);
  return canvas;
}

function spriteAlphaAt(normalizedDistance: number): number {
  if (normalizedDistance >= 1) return 0;
  const t = 1 - normalizedDistance;
  return t * t;
}

function createFieldStamp(radiusPx: number): FieldStamp {
  const fieldRadiusX = radiusPx * FIELD_SCALE_X;
  const fieldRadiusY = radiusPx * FIELD_SCALE_Y;
  const radiusX = Math.ceil(fieldRadiusX);
  const radiusY = Math.ceil(fieldRadiusY);
  const sizeX = radiusX * 2 + 1;
  const sizeY = radiusY * 2 + 1;
  const values = new Float32Array(sizeX * sizeY);
  for (let y = -radiusY; y <= radiusY; y++) {
    for (let x = -radiusX; x <= radiusX; x++) {
      const normalizedDistance = Math.sqrt((x / fieldRadiusX) ** 2 + (y / fieldRadiusY) ** 2);
      values[(y + radiusY) * sizeX + x + radiusX] = spriteAlphaAt(normalizedDistance);
    }
  }
  return { radiusX, radiusY, sizeX, sizeY, values };
}

function splatFieldStamp(centerX: number, centerY: number, stamp: FieldStamp, typeOrdinal?: number): void {
  const gridCenterX = Math.round(centerX * FIELD_SCALE_X);
  const gridCenterY = Math.round(centerY * FIELD_SCALE_Y);
  for (let y = -stamp.radiusY; y <= stamp.radiusY; y++) {
    const gridY = gridCenterY + y;
    if (gridY < 0 || gridY >= FIELD_ROWS) continue;
    const fieldRowOffset = gridY * FIELD_COLS;
    const stampRowOffset = (y + stamp.radiusY) * stamp.sizeX;
    for (let x = -stamp.radiusX; x <= stamp.radiusX; x++) {
      const gridX = gridCenterX + x;
      if (gridX < 0 || gridX >= FIELD_COLS) continue;
      const stampValue = stamp.values[stampRowOffset + x + stamp.radiusX]!;
      if (stampValue === 0) continue;
      const fieldIndex = fieldRowOffset + gridX;
      brightnessField[fieldIndex] = Math.min(1, brightnessField[fieldIndex]! + stampValue);
      if (typeOrdinal !== undefined && particleTypeField) {
        // stamp the particle type ordinal into the type field (last write wins)
        particleTypeField[fieldIndex] = typeOrdinal;
      }
    }
  }
}

function initParticleSystem(): void {
  // Size the source-field canvas to the current window width and a
  // sensible fraction of the window height so the cloud sampling region
  // grows/shrinks with the viewport. Previously this was a fixed 170px
  // which caused the cloud sampling to be clipped when the window was
  // expanded.
  CANVAS_W = W;
  // Target ~22% of window height, clamped to a reasonable min/max.
  CANVAS_H = Math.round(Math.max(120, Math.min(Math.round(H * 0.22), 420)));
  FIELD_COLS = CANVAS_W * FIELD_OVERSAMPLE;
  FIELD_ROWS = CANVAS_H * FIELD_OVERSAMPLE;
  FIELD_SCALE_X = FIELD_COLS / CANVAS_W;
  FIELD_SCALE_Y = FIELD_ROWS / CANVAS_H;
  // assign particle types using the central weights map (easy to change/extend)
  // Update weights based on current level
  // Use difficultyLevel + 1 if defined, else 1 (difficultyLevel starts at 0 for level 1)
  const level = state && typeof state.difficultyLevel === 'number' ? state.difficultyLevel + 1 : 1;
  updateParticleTypeWeights(level);
  particles = Array.from({ length: PARTICLE_N }, () => {
    const sampled = sampleTypeFromWeights(PARTICLE_TYPE_WEIGHTS) as ParticleType;
    return {
      x: Math.random() * CANVAS_W,
      y: Math.random() * CANVAS_H,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      phase: Math.random() * Math.PI * 2,
      type: sampled,
    };
  });
  attractors = Array.from({ length: ATTRACTOR_N }, (_, idx) => ({
    x: idx % 2 === 0 ? 0 : CANVAS_W,
    y: CANVAS_H * 0.15 + (idx * 0.12) * CANVAS_H,
    vx: idx % 2 === 0 ? 34 : -34,
    vy: 0,
    strength: 0.05 + Math.random() * 0.06,
  }));
  brightnessField = new Float32Array(FIELD_COLS * FIELD_ROWS);
  particleTypeField = new Uint8Array(FIELD_COLS * FIELD_ROWS);
  particleFieldStamp = createFieldStamp(SPRITE_R);
  attractorFieldStamp = createFieldStamp(ATTRACTOR_R);
}

function updateParticleSystem(dt: number): void {
  for (const attractor of attractors) {
    attractor.x += attractor.vx * dt;
    if (attractor.x < 0) { attractor.x = 0; attractor.vx *= -1; }
    if (attractor.x > CANVAS_W) { attractor.x = CANVAS_W; attractor.vx *= -1; }
    const targetY = CANVAS_H * 0.18 + Math.sin(attractor.x * 0.01 + attractor.strength * 20) * CANVAS_H * 0.02;
    attractor.y += (targetY - attractor.y) * Math.min(1, dt * 2);
  }

  for (const particle of particles) {
    // Update phase for side-to-side movement
    particle.phase += dt * 0.5;
    // Horizontal oscillation
    particle.vx = Math.sin(particle.phase) * 30;
    // Small vertical drift
    particle.vy = Math.cos(particle.phase) * 2 + (Math.random() - 0.5) * 0.5;

    let ax = 0;
    let ay = 0;
    for (const attractor of attractors) {
      const dx = attractor.x - particle.x;
      const dy = attractor.y - particle.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > 1) {
        const force = attractor.strength / dist2;
        ax += dx * force;
        ay += dy * force;
      }
    }
    particle.vx += ax * ATTRACTOR_FORCE * dt;
    particle.vy += ay * ATTRACTOR_FORCE * dt;

    const speed = Math.hypot(particle.vx, particle.vy);
    if (speed > 70) {
      const scale = 70 / speed;
      particle.vx *= scale;
      particle.vy *= scale;
    }

    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    // Wrap around
    if (particle.x < 0) particle.x = CANVAS_W;
    if (particle.x > CANVAS_W) particle.x = 0;
    if (particle.y < 0) particle.y = CANVAS_H;
    if (particle.y > CANVAS_H) particle.y = 0;
  }

  for (let i = 0; i < brightnessField.length; i++) {
    brightnessField[i]! *= FIELD_DECAY;
  }
  for (const particle of particles) {
    const ordinal = PARTICLE_TYPE_ORDINAL[particle.type] ?? 1;
    splatFieldStamp(particle.x, particle.y, particleFieldStamp, ordinal);
  }
  for (const attractor of attractors) {
    splatFieldStamp(attractor.x, attractor.y, attractorFieldStamp);
  }
}

function drawSourceField(): void {
  const barH = sz(W / 70, 10, 14) + 20;
  const sourceX = 0;
  const sourceY = barH + 5;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(sourceX - 2, sourceY - 2, CANVAS_W + 4, CANVAS_H + 4);
  ctx.fillStyle = '#000';
  ctx.fillRect(sourceX, sourceY, CANVAS_W, CANVAS_H);
  for (const particle of particles) {
    const sprite = getSpriteCanvas(SPRITE_R);
    ctx.drawImage(sprite, sourceX + particle.x - SPRITE_R, sourceY + particle.y - SPRITE_R);
  }
  for (const attractor of attractors) {
    const sprite = getSpriteCanvas(ATTRACTOR_R);
    ctx.drawImage(sprite, sourceX + attractor.x - ATTRACTOR_R, sourceY + attractor.y - ATTRACTOR_R);
  }
  ctx.restore();
}

function sampleBrightness(x: number, y: number): number {
  const gridX = Math.floor(x * FIELD_SCALE_X);
  const gridY = Math.floor(y * FIELD_SCALE_Y);
  if (gridX < 0 || gridX >= FIELD_COLS || gridY < 0 || gridY >= FIELD_ROWS) return 0;
  return brightnessField[gridY * FIELD_COLS + gridX]!;
}

function updateCloudEmitPoints(s: GameState): void {
  if (s.clouds.length === 0 || CANVAS_W <= 0 || CANVAS_H <= 0) return;

  const hudH = sz(W / 70, 10, 14) + 20;
  const cloudSize = sz(W / 75, 9, 14);
  const lineH = Math.round(cloudSize * 1.35);
  const startY = hudH + 5;
  const sampleH = lineH * 8;
  const fallbackArtW = Math.max(80, Math.min(220, W * 0.18));

  for (const cloud of s.clouds) {
    const artW = cloud.artW > 0 ? cloud.artW : fallbackArtW;
    cloud.artW = artW;

    const topFieldY = cloud.y - startY;
    const leftX = cloud.x - artW / 2;
  const emitPoints: Array<{ dx: number; dy: number; pType?: ParticleType }> = [];

    for (let row = 0; row < CLOUD_EMIT_SAMPLE_ROWS; row++) {
      const fy = topFieldY + (row + 0.5) * (sampleH / CLOUD_EMIT_SAMPLE_ROWS);
      if (fy < 0 || fy >= CANVAS_H) continue;

      for (let col = 0; col < CLOUD_EMIT_SAMPLE_COLS; col++) {
        const fx = leftX + (col + 0.5) * (artW / CLOUD_EMIT_SAMPLE_COLS);
        if (fx < 0 || fx >= CANVAS_W) continue;

        const brightness = sampleBrightness(fx, fy);
        if (brightness < CLOUD_EMIT_BRIGHTNESS) continue;

        const absX = fx;
        const absY = startY + fy;
        // sample the particle type grid at this point (if available)
        let pType: ParticleType | undefined = undefined;
        const gx = Math.floor(fx * FIELD_SCALE_X);
        const gy = Math.floor(fy * FIELD_SCALE_Y);
        if (gx >= 0 && gx < FIELD_COLS && gy >= 0 && gy < FIELD_ROWS && particleTypeField) {
          const val = particleTypeField[gy * FIELD_COLS + gx];
          for (const key of PARTICLE_TYPE_KEYS) {
            if (PARTICLE_TYPE_ORDINAL[key] === val) { pType = key as ParticleType; break; }
          }
        }
        emitPoints.push({ dx: absX - cloud.x, dy: absY - cloud.y, pType });
      }
    }

    // determine dominant visual type for this cloud from sampled emit points
    const counts = { rain: 0, snow: 0, hail: 0 };
    for (const ep of emitPoints) {
      if (ep.pType === 'rain') counts.rain++;
      else if (ep.pType === 'snow') counts.snow++;
      else if (ep.pType === 'hail') counts.hail++;
    }
    const total = counts.rain + counts.snow + counts.hail;
    if (total > 0) {
      let visual: ParticleType = 'rain';
      if (counts.snow >= counts.rain && counts.snow >= counts.hail) visual = 'snow';
      else if (counts.hail >= counts.rain && counts.hail >= counts.snow) visual = 'hail';
      cloud.visualType = visual;
    } else {
      cloud.visualType = cloud.type;
    }

    if (emitPoints.length <= CLOUD_EMIT_MAX_POINTS) {
      cloud.emitPoints = emitPoints;
      continue;
    }

    const reduced: Array<{ dx: number; dy: number }> = [];
    const step = emitPoints.length / CLOUD_EMIT_MAX_POINTS;
    for (let i = 0; i < CLOUD_EMIT_MAX_POINTS; i++) {
      reduced.push(emitPoints[Math.floor(i * step)]!);
    }
    cloud.emitPoints = reduced;
  }
}

function getCloudLinesFromField(c: Cloud, elapsed: number): string[] {
  const width = 10;
  const height = 4;
  const offsetX = (c.id * 13) % (FIELD_COLS / FIELD_OVERSAMPLE - width);
  const offsetY = (c.id * 7) % (FIELD_ROWS / FIELD_OVERSAMPLE - height);
  const lines: string[] = [];
  for (let row = 0; row < height; row++) {
    let line = '';
    for (let col = 0; col < width; col++) {
      const brightness = sampleBrightness(offsetX + col, offsetY + row);
      const index = brightnessToCharsetIndex(brightness);
      line += CLOUD_CHARSET[index] || ' ';
    }
    lines.push(line);
  }
  return lines;
}

function makeCloudBody(width: number, charset: string, phase: number, filled: boolean): string {
  let result = '';
  for (let i = 0; i < width; i++) {
    const theta = (i / width) * Math.PI * 4 + phase;
    const intensity = 0.5 + 0.5 * Math.sin(theta + Math.cos(phase * 0.9));
    const index = Math.min(Math.max(Math.floor(intensity * (charset.length - 1)), 0), charset.length - 1);
    const ch = charset[index] || ' ';
    result += filled && Math.sin(theta * 3 + phase) > 0.4 ? ch : ch;
  }
  return result;
}

function makeCloudDrip(charset: string, width: number, phase: number): string {
  const dripChar = charset[Math.floor((phase * 7) % charset.length)] || '.';
  const pieces: string[] = [];
  const count = Math.min(6, Math.ceil(width / 6));
  for (let i = 0; i < count; i++) {
    const offset = Math.sin(phase + i * 1.3);
    pieces.push(offset > 0 ? dripChar : charset[Math.floor((phase + i * 0.5) % charset.length)] || ' ');
  }
  return pieces.join(' ');
}

function getCloudLines(c: Cloud): string[];
function getCloudLines(c: Cloud, elapsed: number): string[];
function getCloudLines(c: Cloud, elapsed = 0): string[] {
  const width = 20 + (c.id % 3) * 3 + (c.type === 'hail' ? 4 : 0);
  const phase = elapsed * (c.type === 'rain' ? 1.2 : c.type === 'snow' ? 0.7 : 0.5) + c.id * 0.9;
  const charset = (c.visualType ? CLOUD_CHARSETS[c.visualType] : CLOUD_CHARSET) || CLOUD_CHARSET;
  const body = makeCloudBody(width, charset, phase, false);
  const fill = makeCloudBody(width, charset, phase + 0.9, true);
  const drip = makeCloudDrip(charset, width, phase + 1.7);
  return [
    `   .${body}.`,
    `  ( ${fill} )`,
    `   \`${body}\``,
    `    ${drip}`,
  ];
}
function drawClouds(s: GameState): void {
  const hudH  = sz(W / 70, 10, 14) + 20;
  const size  = sz(W / 75, 9, 14);
  const lineH = Math.round(size * 1.35);
  // Use the same visible font as the sky text so characters line up
  const f = fnt(size, 700);
  const charW = Math.max(4, renderer.measureWidth('M', f));
  const cols = Math.max(1, Math.floor(CANVAS_W / charW));
  const rows = Math.max(1, Math.floor(CANVAS_H / lineH));
  const startY = hudH + 5; // align with the source field
  const startX = 0;
  const fieldCellW = CANVAS_W / cols;
  const fieldCellH = CANVAS_H / rows;

  for (let r = 0; r < rows; r++) {
    const skyRow = ' '.repeat(cols);
  let cloudLine = '';
  let hasCloud = false;
  const pTypeArr: Array<ParticleType | undefined> = [];

    for (let c = 0; c < cols; c++) {
      const fx = Math.min(CANVAS_W - 1, (c + 0.5) * fieldCellW);
      const fy = Math.min(CANVAS_H - 1, (r + 0.5) * fieldCellH);
      const brightness = sampleBrightness(fx, fy);
      if (brightness < 0.05) {
        cloudLine += ' ';
        pTypeArr.push(undefined);
        continue;
      }
      hasCloud = true;

      // Prefer particle-type stamped in the grid to choose charset per-cell
      let pType: ParticleType | undefined = undefined;
      if (particleTypeField) {
        const gx = Math.floor(fx * FIELD_SCALE_X);
        const gy = Math.floor(fy * FIELD_SCALE_Y);
        if (gx >= 0 && gx < FIELD_COLS && gy >= 0 && gy < FIELD_ROWS) {
          const val = particleTypeField[gy * FIELD_COLS + gx];
          for (const key of PARTICLE_TYPE_KEYS) {
            if (PARTICLE_TYPE_ORDINAL[key] === val) { pType = key as ParticleType; break; }
          }
        }
      }

      const charset = (pType ? CLOUD_CHARSETS[pType] : CLOUD_CHARSET) || CLOUD_CHARSET;
      const adjusted = Math.sqrt(brightness);
      const idx = Math.min(Math.max(Math.floor(adjusted * (charset.length - 1)), 0), charset.length - 1);
      const ch = charset[idx] || ' ';
      cloudLine += ch;
      pTypeArr.push(pType);
    }

    // Draw cloud overlay runs with per-type colors. We group contiguous
    // cloud cells by particle type and draw each run separately so the
    // glyphs can be tinted per-type efficiently.
    if (hasCloud) {
      let runStart = -1;
      let runType: ParticleType | 'mixed' | undefined = undefined;
      for (let i = 0; i < cols; i++) {
        const t = pTypeArr[i];
        if (t === undefined) {
          // flush any existing run
          if (runStart !== -1) {
            const substr = cloudLine.slice(runStart, i);
            const x = startX + runStart * charW;
            const color = runType === 'snow' ? COLORS.cloudSnow : runType === 'hail' ? COLORS.cloudHail : COLORS.cloudRain;
            const glowFactor = runType === 'snow' ? 0.9 : runType === 'hail' ? 0.6 : 1.0;
            const glowBlur = Math.max(6, Math.round(size * 1.6 * glowFactor));
            const block = renderer.getBlock(substr, f, lineH);
            renderer.drawBlock(ctx, block, x, startY + r * lineH, { color, shadowColor: color, shadowBlur: glowBlur, alpha: 0.6 });
            renderer.drawBlock(ctx, block, x, startY + r * lineH, { color, alpha: 1 });
            runStart = -1; runType = undefined;
          }
          continue;
        }
        // start a new run if needed
        if (runStart === -1) {
          runStart = i;
          runType = t;
        } else if (runType !== t) {
          // flush previous run
          const substr = cloudLine.slice(runStart, i);
          const x = startX + runStart * charW;
          const color = runType === 'snow' ? COLORS.cloudSnow : runType === 'hail' ? COLORS.cloudHail : COLORS.cloudRain;
          const glowFactor = runType === 'snow' ? 0.9 : runType === 'hail' ? 0.6 : 1.0;
          const glowBlur = Math.max(6, Math.round(size * 1.6 * glowFactor));
          const block = renderer.getBlock(substr, f, lineH);
          renderer.drawBlock(ctx, block, x, startY + r * lineH, { color, shadowColor: color, shadowBlur: glowBlur, alpha: 0.6 });
          renderer.drawBlock(ctx, block, x, startY + r * lineH, { color, alpha: 1 });
          // start new
          runStart = i;
          runType = t;
        }
      }
      // flush tail run
      if (runStart !== -1) {
        const substr = cloudLine.slice(runStart, cols);
        const x = startX + runStart * charW;
        const color = runType === 'snow' ? COLORS.cloudSnow : runType === 'hail' ? COLORS.cloudHail : COLORS.cloudRain;
        const glowFactor = runType === 'snow' ? 0.9 : runType === 'hail' ? 0.6 : 1.0;
        const glowBlur = Math.max(6, Math.round(size * 1.6 * glowFactor));
        const block = renderer.getBlock(substr, f, lineH);
        renderer.drawBlock(ctx, block, x, startY + r * lineH, { color, shadowColor: color, shadowBlur: glowBlur, alpha: 0.6 });
        renderer.drawBlock(ctx, block, x, startY + r * lineH, { color, alpha: 1 });
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
  grd.addColorStop(0, 'rgba(57,255,100,0.15)'); // Increased brightness
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, groundY, W, lineH * 2);

  const rows = [
    { pattern: '|grass|ground|', color: COLORS.brightGreen, alpha: 1.0 }, // Brighter color and full alpha
    { pattern: '|ground|grass|', color: COLORS.brightGreen, alpha: 0.8 },
    { pattern: '|grass|ground|', color: COLORS.brightGreen, alpha: 0.6 },
    { pattern: '|ground|grass|', color: COLORS.brightGreen, alpha: 0.4 },
  ];
  const charW = renderer.measureWidth('|', f);
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
  const ruleBlock = renderer.getBlock('|', ruleF, lineH);
  const ruleW = renderer.measureWidth('|', ruleF);
  if (ruleW > 0) {
    let dx = 0;
    while (dx < W) { renderer.drawBlock(ctx, ruleBlock, dx, groundY - 1, { color: COLORS.brightGreen, alpha: 0.6 }); dx += ruleW; }
  }
}

// Traveler
const TRAVELER_HEADS = ['(^o^)'];
const LEGS_IDLE = ['/  \\', '/  \\'];
const LEGS_WALK = ['/  \\', ' |/ ', '/  \\', ' \\| '];
const LEGS_RUN  = ['/  \\', ' |/ ', '/  \\', ' \\| '];
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
  const armsJump = s.travelerVY < 0 ? '\\| |/' : '/| |\\';
  const legsJump = s.travelerVY < 0 ? '^ ^' : 'v v';
  const moving = s.travelerVX;
  const armsStr = moving < -10 ? '-| |>' : moving > 10 ? '<| |-' : '/| |\\';
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

  const headStr = airborne ? '(>o<)' : TRAVELER_HEADS[tFrame];
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
  for (const p of s.particles) {
    const baseSize = sz(W / 70, 8, 12);
    const snowBoost = p.type === 'snow' ? 1.6 : 1;
    const size = Math.round(baseSize * snowBoost * (p.sizeScale ?? 1));
    const f = fnt(size);
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
  const canopyHeight = Math.max(1, rimY - peakY);

  for (const slide of s.umbrellaSlides) {
    const fadeAlpha = Math.max(0, slide.life * slide.alpha);
    if (fadeAlpha <= 0) continue;

    let drawX = slide.x;
    let drawY = slide.y;

    if (slide.phase === 'slide' && hasUmbrellaGeom && halfW > 0) {
      if (slide.dir === 0) {
        drawX = artCenterX;
        drawY = slide.y;
      } else {
        const clampedX = Math.max(s.umbrellaArtStartX, Math.min(s.umbrellaArtStartX + s.umbrellaArtWidth, slide.x));
        const xFrac = Math.min(1, Math.abs(clampedX - artCenterX) / halfW);
        drawX = clampedX;
        drawY = peakY + xFrac * (rimY - peakY);
      }

      // Constrain slide-phase effects to canopy wedge at the current Y.
      drawY = Math.max(peakY, Math.min(rimY, drawY));
      const yFrac = Math.min(1, Math.max(0, (drawY - peakY) / canopyHeight));
      const maxOffset = yFrac * halfW;
      drawX = Math.max(artCenterX - maxOffset, Math.min(artCenterX + maxOffset, drawX));
    }

    // Use color/type for snow/rain
    if (slide.phase === 'slide') {
      let g;
      if (slide.type === 'snow') {
        g = slide.glyph;
      } else if (slide.dir === 0) {
        g = '|';
      } else {
        g = slide.dir === -1 ? '\\' : '/';
      }
      const block = renderer.getBlock(g, f, lh);
      renderer.drawBlock(ctx, block, drawX, drawY, {
        color: slide.color,
        shadowColor: slide.color,
        shadowBlur: 3,
        align: 'center',
        alpha: fadeAlpha,
      });
    } else {
      // Drip: vertical for rain, snowflake for snow
      if (slide.type === 'snow') {
        renderer.drawBlock(ctx, renderer.getBlock(slide.glyph, f, lh), drawX, drawY, {
          color: slide.color,
          align: 'center',
          alpha: fadeAlpha,
        });
        renderer.drawBlock(ctx, renderer.getBlock('\u00b7', f, lh), drawX, drawY - size * 1.2, {
          color: COLORS.snowSplash || '#e0f7fa',
          align: 'center',
          alpha: fadeAlpha * 0.5,
        });
      } else {
        renderer.drawBlock(ctx, renderer.getBlock('|', f, lh), drawX, drawY, {
          color: slide.color,
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
  // Center text between green lines
  const textY = bannerY - 2 + (size + 14) / 2;
  renderer.drawText(ctx, s.levelUpText, f, size + 4, W / 2, textY, { color: COLORS.brightAmber, shadowColor: COLORS.amber, shadowBlur: 16, align: 'center', alpha });
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
  renderer.drawText(ctx, lvl, f, size + 2, W - pad - lvlW, textY, { color: COLORS.red, shadowColor: COLORS.red, shadowBlur: 10 });
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
  // Extend the process killed box for more space
  const boxW = Math.min(600, W - 20);
  const boxH = 300;
  const boxX = cx - boxW / 2;
  const boxY = H / 2 - boxH / 2;
  ctx.fillStyle = 'rgba(6,12,20,0.92)'; ctx.fillRect(boxX, boxY, boxW, boxH);
  renderer.drawGlyphBox(ctx, fnt(size), lh, boxX, boxY, boxW, boxH, { color: COLORS.red, alpha: 0.8 });
  renderer.drawText(ctx, '[ PROCESS KILLED ]', fnt(size + 4, 700), lh, cx, boxY + 20, { color: COLORS.red, shadowColor: COLORS.brightRed, shadowBlur: 22, align: 'center' });
  renderer.drawHRule(ctx, '\u2550', fnt(size - 2), lh, boxX + 14, boxY + 60, boxW - 28, { color: COLORS.dimGreen, alpha: 0.6 });
  renderer.drawText(ctx, `FINAL SCORE: ${s.score}`, fnt(size, 700), lh, cx, boxY + 76, { color: COLORS.amber, shadowColor: COLORS.amber, shadowBlur: 10, align: 'center' });
  renderer.drawText(ctx, `SURVIVED: ${Math.floor(s.elapsed)}s   LEVEL REACHED: ${s.difficultyLevel + 1}`, fnt(size - 1), lh, cx, boxY + 104, { color: COLORS.dim, align: 'center' });
  let comboY = boxY + 126;
  let promptY;
  if (s.bestCombo > 1) {
    renderer.drawText(ctx, `BEST COMBO: \xd7${s.bestCombo}`, fnt(size - 1), lh, cx, comboY, { color: COLORS.cyan, align: 'center' });
    // Move prompt lower if combo is present
    promptY = comboY + lh + 30; // Increased offset for lower position
  } else {
    // Center the prompt between the green line and the SURVIVED line, but a bit lower
    const survivedY = boxY + 104;
    const greenLineY = boxY + 154;
    promptY = survivedY + (greenLineY - survivedY) * 0.7; // Move lower
  }
  renderer.drawHRule(ctx, '\u2550', fnt(size - 2), lh, boxX + 14, boxY + 154, boxW - 28, { color: COLORS.dimGreen, alpha: 0.6 });
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    renderer.drawText(ctx, '> Press R / ENTER / tap to restart', fnt(size - 1, 700), lh, cx, promptY, { color: COLORS.green, shadowColor: COLORS.green, shadowBlur: 8, align: 'center' });
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
  canvas.addEventListener('mousemove', (e) => {
    const p = canvasPos(e);
    bgHoverActive = true;
    bgHoverTargetX = p.x;
    bgHoverTargetY = p.y;
    handlePointerMove(state, p.x, p.y);
  });
  canvas.addEventListener('mouseenter', (e) => {
    const p = canvasPos(e);
    bgHoverActive = true;
    bgHoverTargetX = p.x;
    bgHoverTargetY = p.y;
  });
  canvas.addEventListener('mouseleave', () => {
    bgHoverActive = false;
    bgHoverTargetX = W * 0.5;
    bgHoverTargetY = H * 0.45;
  });
  canvas.addEventListener('mousedown', (e) => { resumeAudio(); const p = canvasPos(e); handlePointerDown(state, p.x, p.y); });
  window.addEventListener('mouseup', () => handlePointerUp(state));
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const p = canvasPos(e.touches[0]);
    bgHoverActive = true;
    bgHoverTargetX = p.x;
    bgHoverTargetY = p.y;
    handlePointerMove(state, p.x, p.y);
  }, { passive: false });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    resumeAudio();
    const p = canvasPos(e.touches[0]);
    bgHoverActive = true;
    bgHoverTargetX = p.x;
    bgHoverTargetY = p.y;
    handlePointerDown(state, p.x, p.y);
  }, { passive: false });
  window.addEventListener('touchend', () => {
    bgHoverActive = false;
    bgHoverTargetX = W * 0.5;
    bgHoverTargetY = H * 0.45;
    handlePointerUp(state);
  });
}

init();