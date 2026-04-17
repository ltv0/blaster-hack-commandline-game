import './style.css'
import {
  createInitialState,
  update,
  handleKeyDown,
  handleKeyUp,
  handlePointerMove,
  handlePointerDown,
  handlePointerUp,
  computeUmbrellaYBounds,
  powerUpLabel,
  COLORS,
  type GameState,
  type AudioEvent,
  type Cloud,
} from './game.ts'
import {
  CLOUD_CHARSET,
  CLOUD_CHARSETS,
  TRAVELER_HEADS,
  TRAVELER_JUMP_HEAD,
  TRAVELER_LEGS_IDLE,
  TRAVELER_LEGS_WALK,
  TRAVELER_LEGS_RUN,
  TRAVELER_ARMS_ASCENDING,
  TRAVELER_ARMS_DESCENDING,
  TRAVELER_LEGS_ASCENDING,
  TRAVELER_LEGS_DESCENDING,
  TRAVELER_ARMS_LEFT,
  TRAVELER_ARMS_RIGHT,
  TRAVELER_ARMS_IDLE,
  UMBRELLA_CANOPY,
  UMBRELLA_HANDLE_LINES,
  UMBRELLA_FOOT,
} from './assets.ts'
import { bindEvents } from './rendering/input.ts'
import { buildStars, rebuildStars, drawStars, buildAsciiBackground, updateAsciiBackground, drawAsciiBackground, loadSkyText, getBackgroundHoverPosition, isBackgroundHoverActive, getBackgroundCellWidth, type BgOccluder, type BgRepulsor, type BgCircleObstacle, type BgInterval } from './rendering/background.ts'
import { resumeAudio, handleAudioEvents } from './rendering/audio.ts'
import { canvas, ctx, renderer, W, H, fnt, sz, setViewportSize } from './rendering/canvas.ts'

let dpr = window.devicePixelRatio || 1
const GROUND_Y_RATIO = 0.91
const CLOUD_ART_LINES = 4
let frameBgGradient: CanvasGradient | null = null
let frameBgGradientHeight = -1

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  const newW = window.innerWidth;
  const newH = window.innerHeight;
  setViewportSize(newW, newH);
  canvas.width = Math.round(newW * dpr);
  canvas.height = Math.round(newH * dpr);
  canvas.style.width  = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.scale(dpr, dpr);
  if (state) {
    state.W = W;
    state.H = H;
    state.travelerX = W * 0.38;
    const travelerSize = Math.max(14, Math.min(22, W / 40));
    const baseY = Math.round(H * GROUND_Y_RATIO) - travelerSize * 2.95;
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
    initParticleSystem(state);
  }
}


// ─── Stars ────────────────────────────────────────────────────────────────────
const CLOUD_FIELD_CARVE_BRIGHTNESS = 0.05;
const CLOUD_FIELD_WARP_BRIGHTNESS = 0.02;
const CLOUD_FIELD_CARVE_PAD = 0.9;
const CLOUD_FIELD_WARP_PUSH = 7.5;
const CLOUD_FIELD_WARP_MAX = 12;

function sampleCloudFieldWarpPush(screenX: number, screenY: number): { dx: number; dy: number; boost: number } {
  if (CANVAS_W <= 0 || CANVAS_H <= 0 || FIELD_COLS <= 0 || FIELD_ROWS <= 0 || !brightnessField || brightnessField.length === 0) {
    return { dx: 0, dy: 0, boost: 0 };
  }

  const hudH = sz(W / 70, 10, 14) + 20;
  const sourceY = hudH + 5;
  const localY = screenY - sourceY;
  if (localY < 0 || localY >= CANVAS_H) return { dx: 0, dy: 0, boost: 0 };

  const localX = Math.max(0, Math.min(CANVAS_W - 1, screenX));
  const center = sampleBrightness(localX, localY);
  if (center < CLOUD_FIELD_WARP_BRIGHTNESS) return { dx: 0, dy: 0, boost: 0 };

  const delta = Math.max(2, Math.floor(getBackgroundCellWidth() * 0.6));
  const left = sampleBrightness(Math.max(0, localX - delta), localY);
  const right = sampleBrightness(Math.min(CANVAS_W - 1, localX + delta), localY);
  const up = sampleBrightness(localX, Math.max(0, localY - delta));
  const down = sampleBrightness(localX, Math.min(CANVAS_H - 1, localY + delta));

  const gradX = right - left;
  const gradY = down - up;
  const gradLen = Math.hypot(gradX, gradY);

  if (gradLen < 0.0001) return { dx: 0, dy: 0, boost: center * 0.25 };

  // Gradient points inward toward denser cloud; invert to push glyphs outward.
  const nx = -gradX / gradLen;
  const ny = -gradY / gradLen;
  const insideBoost = Math.min(1, center / CLOUD_FIELD_CARVE_BRIGHTNESS);
  const push = Math.min(CLOUD_FIELD_WARP_MAX, CLOUD_FIELD_WARP_PUSH * (0.35 + insideBoost * 0.9));

  return {
    dx: nx * push,
    dy: ny * push * 0.7,
    boost: insideBoost,
  };
}

function getCloudFieldBlockedIntervalsForBand(bandTop: number, bandBottom: number): BgInterval[] {
  if (CANVAS_W <= 0 || CANVAS_H <= 0 || FIELD_COLS <= 0 || FIELD_ROWS <= 0 || !brightnessField || brightnessField.length === 0) {
    return [];
  }

  const hudH = sz(W / 70, 10, 14) + 20;
  const sourceY = hudH + 5;
  const localY = (bandTop + bandBottom) * 0.5 - sourceY;
  if (localY < 0 || localY >= CANVAS_H) return [];

  const step = Math.max(2, Math.floor(getBackgroundCellWidth()));
  const pad = Math.max(1, Math.floor(getBackgroundCellWidth() * CLOUD_FIELD_CARVE_PAD));
  const out: BgInterval[] = [];
  let runStart = -1;

  for (let x = 0; x <= W; x += step) {
    const localX = Math.max(0, Math.min(CANVAS_W - 1, x));
    const occupied = sampleBrightness(localX, localY) >= CLOUD_FIELD_CARVE_BRIGHTNESS;

    if (occupied && runStart < 0) {
      runStart = x;
      continue;
    }

    if (!occupied && runStart >= 0) {
      out.push({ left: Math.max(0, runStart - pad), right: Math.min(W, x + step * 0.5 + pad) });
      runStart = -1;
    }
  }

  if (runStart >= 0) {
    out.push({ left: Math.max(0, runStart - pad), right: W });
  }

  return out;
}

function buildBackgroundRepulsors(s: GameState): BgRepulsor[] {
  const out: BgRepulsor[] = [];
  const travelerSize = sz(W / 40, 14, 22);
  const travelerW = travelerSize * 1.7;
  const travelerH = travelerSize * 2.25;
  out.push({
    x: s.travelerX,
    y: s.travelerY + travelerSize * 0.45,
    radius: Math.max(travelerW, travelerH) * 1.5,
    strength: 25,
    minY: s.travelerY + travelerSize * 0.25,
  });

  // Note: umbrella is still handled by circle obstacles (true wrap).
  // Traveler body now uses a pretext-style repulsor instead of a rectangle occluder.

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
  // No traveler rect occluder here; traveler body repulsion is handled
  // by the pretext-style repulsor in buildBackgroundRepulsors.
  // Umbrella is still handled by circle obstacles (true wrap).
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
  const canopyCy = artStartY + UMBRELLA_CANOPY_LINES_BG * umbrellaLineH * 0.60;
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
    rx: getBackgroundCellWidth() * 1.1, ry: (HANDLE_LINES_BG * umbrellaLineH) / 2,
    hPad: 2, vPad: 1,
  });

  // ── Traveler ─────────────────────────────────────────────────────────────
  const travelerSize = sz(W / 40, 14, 22);
    // Head — bottom-biased so text can wrap above
    const headTopY = s.travelerY;
    const headHeight = travelerSize * 1.2;

    const headCy = headTopY + headHeight * 0.65;   // shift DOWN (key change)
    const headRy = headHeight * 0.35;              // only block lower portion

    out.push({
    cx: s.travelerX,
    cy: headCy,
    rx: travelerSize * 0.7,
    ry: headRy,
    hPad: 0,
    vPad: 0,
    });

    out.push({
    cx: s.travelerX,
    cy: s.travelerY + travelerSize * 0.25,
    rx: travelerSize * 0.4,
    ry: travelerSize * 0.25,
    hPad: 0,
    vPad: 0,
    });
  out.push({
    cx: s.travelerX,
    cy: s.travelerY + travelerSize * 1.45,
    rx: travelerSize * 0.92,
    ry: travelerSize * 1.28,
    hPad: 0,
    vPad: 0,
  });

  // Clouds are carved directly from the source field in drawAsciiBackground.
  return out;
}

// ─── State + loop ─────────────────────────────────────────────────────────────
let state: GameState;
let emitPointsAccumulator = 0;
function init(): void {
  resize();
  buildStars(W, H);
  buildAsciiBackground();
  void loadSkyText();
  state = createInitialState(W, H);
  initParticleSystem(state);
  bindEvents(state, () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    resize()
    buildStars(W, H)
    buildAsciiBackground()
    initParticleSystem(state)
  })
  requestAnimationFrame(loop)
}
let lastTime = 0;
function loop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateParticleSystem(dt);
  emitPointsAccumulator += dt;
  if (emitPointsAccumulator >= EMIT_POINTS_UPDATE_INTERVAL) {
    updateCloudEmitPoints(state);
    emitPointsAccumulator = emitPointsAccumulator % EMIT_POINTS_UPDATE_INTERVAL;
  }
  update(state, dt);
  updateUmbrellaPhysics(state, dt);
  updateAsciiBackground(dt);
  handleAudioEvents(state.audioEvents);
  draw(state);
  requestAnimationFrame(loop);
}

function updateUmbrellaPhysics(s: GameState, dt: number): void {
  if (s.phase !== 'playing') return;

  let pressureForce = 0;
  const size = Math.max(9, Math.min(14, s.W / 75)) * WEATHER_FONT_SCALE;
  const lineH = Math.round(size * 1.35);
  const hudH = Number.isFinite(s.hudBarHeight) ? s.hudBarHeight : (Math.max(10, Math.min(14, s.W / 70)) + 20);
  const startYFloor = hudH + 5;
  const cloudArtHeight = CLOUD_ART_LINES * lineH;
  const isPortrait = s.H > s.W;

  for (const cloud of s.clouds) {
    const startY = Math.max(startYFloor, cloud.y);
    const bottom = startY + cloudArtHeight;

    if (s._umbrellaActualY !== undefined) {
      const dist = s._umbrellaActualY - bottom;
      const influence = isPortrait ? 150 : 120;

      if (dist < influence) {
        const strength = isPortrait ? 2200 : 1800;
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
  if (!frameBgGradient || frameBgGradientHeight !== H) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   '#050d18');
    grad.addColorStop(0.55,'#0a1727');
    grad.addColorStop(1,   '#122438');
    frameBgGradient = grad;
    frameBgGradientHeight = H;
  }
  ctx.fillStyle = frameBgGradient;
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
  const panelW = Math.min(640, W - 48);
  const panelX = cx - panelW / 2;
  const panelY = startY - lh * 2.8;
  const headerH = lh * 1.4;
  const maxVisibleLines = 5;
  const visibleLineCount = Math.max(1, Math.min(s.bootLines.length, maxVisibleLines));
  const panelH = headerH + lh * (visibleLineCount + 0.8);

  drawAsciiBackground(0, 0.24, COLORS.brightGreen, [], [], [], false);
  drawScanlines(0.04);

  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 10, 0.82)';
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = 'rgba(108, 242, 128, 0.34)';
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);
  ctx.fillStyle = 'rgba(108, 242, 128, 0.10)';
  ctx.fillRect(panelX, panelY, panelW, headerH);
  ctx.restore();

  renderer.drawText(ctx, 'TERMINAL // WEATHER REPORT', fnt(size + 3, 700), lh * 1.4, panelX + 18, panelY + lh * 0.55, {
    color: COLORS.green, shadowColor: COLORS.green, shadowBlur: 12,
  });

  const lines = s.bootLines.slice(-visibleLineCount);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isWarn   = line.startsWith('\u26a0');
    const isPrompt = line.startsWith('>');
    const isLast   = i === lines.length - 1;
    const color = isPrompt ? COLORS.amber : isWarn ? COLORS.red : isLast ? COLORS.white : COLORS.dimGreen;
    const f = (isPrompt || isWarn) ? fnt(size, 700) : fnt(size);
    const yPos = panelY + headerH + lh * (0.6 + i);
    if (isPrompt && s.bootDone) {
      const display = line.replace(/ _$/, '');
      renderer.drawText(ctx, display, f, lh, panelX + 18, yPos, { color });
      if (s.promptBlink) {
        const tw = renderer.measureWidth(display + ' ', f);
        renderer.drawText(ctx, '\u258c', f, lh, panelX + 18 + tw, yPos, { color: COLORS.amber });
      }
    } else {
      renderer.drawText(ctx, line, f, lh, panelX + 18, yPos, { color });
    }
  }
  renderer.drawText(ctx, 'BLASTER HACK COMMANDLINE GAME  //  v1.0', fnt(size - 3), lh,
    cx, H - 18, { color: COLORS.dim, align: 'center', alpha: 0.4 });
}

// ─── Sky text background ──────────────────────────────────────────────────────

let skyGrid: string[] = [];
let skyGridCols = 0;
let skyGridRows = 0;

// Calculate glyph offset based on proximity to objects (cursor, umbrella, traveler, clouds)
function calculateGlyphOffset(glyphX: number, glyphY: number, s: GameState): { dx: number; dy: number } {
  let totalDx = 0;
  let totalDy = 0;
  const repulsionStrength = 12;
  const repulsionFalloff = 120; // Distance over which repulsion decays

  // Collect object ellipses as (cx, cy, rx, ry)
  const objects: Array<{ cx: number; cy: number; rx: number; ry: number }> = [];

  // Cursor (bgHover when active) — treat as circle
  if (isBackgroundHoverActive()) {
    const cursorRadius = 40;
    const hover = getBackgroundHoverPosition();
    objects.push({ cx: hover.x, cy: hover.y, rx: cursorRadius, ry: cursorRadius });
  }

  // ── Umbrella: match buildBackgroundCircleObstacles exactly ──
  const umbrellaSize = sz(W / 100, 7, 11);
  const umbrellaLineH = s.umbrellaArtLineH > 0 ? s.umbrellaArtLineH : Math.round(umbrellaSize * 1.15);
  const artW = s.umbrellaArtWidth > 0 ? s.umbrellaArtWidth : Math.max(120, s.umbrellaW * 1.2);
  const artStartX = Number.isFinite(s.umbrellaArtStartX) ? s.umbrellaArtStartX : s.umbrellaX - artW * 0.5;
  const artStartY = Number.isFinite(s.umbrellaArtStartY) ? s.umbrellaArtStartY : s.umbrellaY - umbrellaLineH;

  // Canopy ellipse
  const UMBRELLA_CANOPY_LINES_BG = 6;
  const canopyRimY = artStartY + UMBRELLA_CANOPY_LINES_BG * umbrellaLineH;
  const canopyCx = artStartX + artW / 2;
  const canopyCy = artStartY + UMBRELLA_CANOPY_LINES_BG * umbrellaLineH * 0.70;
  const canopyRx = artW / 2;
  const canopyRy = canopyRimY - canopyCy;
  objects.push({ cx: canopyCx, cy: canopyCy, rx: canopyRx, ry: canopyRy });

  // Handle ellipse
  const HANDLE_LINES_BG = 12;
  const handleTop = artStartY + UMBRELLA_CANOPY_LINES_BG * umbrellaLineH;
  const handleCy = handleTop + (HANDLE_LINES_BG * umbrellaLineH) / 2;
  objects.push({
    cx: canopyCx, cy: handleCy,
    rx: getBackgroundCellWidth() * 1.1, ry: (HANDLE_LINES_BG * umbrellaLineH) / 2,
  });

  // ── Traveler ──
  const travelerSize = sz(W / 40, 14, 22);
  objects.push({
    cx: s.travelerX,
    cy: s.travelerY + travelerSize * 0.32,
    rx: travelerSize * 0.74,
    ry: travelerSize * 0.66,
  });
  objects.push({
    cx: s.travelerX,
    cy: s.travelerY + travelerSize * 1.45,
    rx: travelerSize * 1.0,
    ry: travelerSize * 1.36,
  });

  // ── Clouds: match buildBackgroundCircleObstacles exactly ──
  const cloudFontSize = sz(W / 75, 9, 14);
  const cloudLineH = Math.round(cloudFontSize * 1.35);
  const cloudHudH = sz(W / 70, 10, 14) + 20;
  const cloudStartY = cloudHudH + 5;
  const CLOUD_ART_LINES = 4;
  const cloudArtH = CLOUD_ART_LINES * cloudLineH;
  for (let i = 0; i < Math.min(8, s.clouds.length); i++) {
    const c = s.clouds[i]!;
    const artWCloud = c.artW > 0 ? c.artW : Math.max(80, Math.min(220, W * 0.18));
    const cloudTopY = Math.max(cloudStartY, c.y);
    const cloudCy = cloudTopY + cloudArtH * 0.70;
    const cloudRy = cloudArtH * 0.30;
    objects.push({ cx: c.x, cy: cloudCy, rx: artWCloud / 2, ry: cloudRy });
  }

  // Calculate repulsion from each ellipse using same logic as ellipseIntervalForBand
  for (const obj of objects) {
    const dx = glyphX - obj.cx;
    const dy = glyphY - obj.cy;

    // For ellipse (x/rx)² + (y/ry)² = 1, compute distance to edge
    // Normalized coordinates
    const nx = Math.abs(dx) / obj.rx;
    const ny = Math.abs(dy) / obj.ry;

    // If inside or very close to ellipse, apply repulsion
    if (nx < 1.0 && ny < 1.0) {
      // Inside ellipse — strong repulsion
      const t = Math.max(nx, ny); // parametric distance (0 at center, 1 at edge)
      const force = (1 - t) * repulsionStrength;
      const angle = Math.atan2(dy, dx);
      totalDx += Math.cos(angle) * force;
      totalDy += Math.sin(angle) * force;
    } else {
      // Outside but within falloff distance — weak repulsion
      const dist = Math.hypot(dx, dy);
      if (dist < repulsionFalloff) {
        const force = Math.max(0, (repulsionFalloff - dist) / repulsionFalloff) * repulsionStrength * 0.3;
        const angle = Math.atan2(dy, dx);
        totalDx += Math.cos(angle) * force;
        totalDy += Math.sin(angle) * force;
      }
    }
  }

  return { dx: totalDx, dy: totalDy };
}

// ─── Game world ───────────────────────────────────────────────────────────────
function drawGame(s: GameState): void {
  // ASCII background now displays Lorem Ipsum text directly (no separate sky text layer needed)
  const repulsors = buildBackgroundRepulsors(s);
  const occluders = buildBackgroundOccluders(s);
  const circleObstacles = buildBackgroundCircleObstacles(s);
  drawStars(s);
  drawAsciiBackground(
    s.bgStarOffset * 0.3,
    0.15,
    '#8bc98b',
    repulsors,
    occluders,
    circleObstacles,
    true,
    true,
    getCloudFieldBlockedIntervalsForBand,
    sampleCloudFieldWarpPush,
  );
  if (SHOW_CLOUD_SOURCE_FIELD) drawSourceField();
  drawClouds(s);
  drawGround(s);
  drawTraveler(s);
  drawPowerUpPickups(s);
  drawHazards(s);
  drawScorePopups(s);
  drawParticles(s);
  drawHeartExplosions(s);
  drawUmbrella(s);
  drawUmbrellaSlides(s);
  drawPowerUpEffects(s);
  drawHUD(s);
  drawLevelUpBanner(s);
  if (s.deathFlash > 0 && s.phase !== 'dead') {
    ctx.save(); ctx.fillStyle = COLORS.red; ctx.globalAlpha = s.deathFlash * 0.35;
    ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  drawScanlines(0.08);
}

// Clouds
const CLOUD_EMIT_BRIGHTNESS = 0.22;
const CLOUD_EMIT_SAMPLE_COLS = 18;
const CLOUD_EMIT_SAMPLE_ROWS = 8;
const CLOUD_EMIT_MAX_POINTS = 72;
const WEATHER_FONT_SCALE = 1.28;
const MAX_FIELD_CELLS = 320_000;
const EMIT_POINTS_UPDATE_INTERVAL = 1 / 12;
function brightnessToCharsetIndex(brightness: number): number {
  const adjusted = Math.sqrt(brightness);
  return Math.min(Math.max(Math.floor(adjusted * (CLOUD_CHARSET.length - 1)), 0), CLOUD_CHARSET.length - 1);
}
function wrapPatternIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}
function cloudNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
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

type ParticleType = 'rain' | 'snow' | 'hail' | 'purpleRain';
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

const SNOW_UNLOCK_LEVEL = 3;
const HAIL_UNLOCK_LEVEL = 6;

// Update particle type weights as level increases
function updateParticleTypeWeights(level: number) {
  // Level 1: rain 100, snow 0, hail 0
  if (level <= 1) {
    PARTICLE_TYPE_WEIGHTS = { rain: 1.0, snow: 0.0, hail: 0.0 };
    return;
  }
  // Each level after unlock: rain -10, snow +5, hail +5 (percentages)
  let rain = 1.0 - 0.10 * (level - 1);
  let snow = level >= SNOW_UNLOCK_LEVEL ? 0.05 * (level - 1) : 0.0;
  let hail = level >= HAIL_UNLOCK_LEVEL ? 0.05 * (level - 1) : 0.0;
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
const PARTICLE_TYPE_BY_ORDINAL: Array<ParticleType | undefined> = [];
for (let i = 0; i < PARTICLE_TYPE_KEYS.length; i++) {
  const key = PARTICLE_TYPE_KEYS[i] as ParticleType;
  PARTICLE_TYPE_BY_ORDINAL[i + 1] = key;
}

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

function initParticleSystem(s: GameState): void {
  // Size the source-field canvas to the current window width and a
  // sensible fraction of the window height so the cloud sampling region
  // grows/shrinks with the viewport. Previously this was a fixed 170px
  // which caused the cloud sampling to be clipped when the window was
  // expanded.
  CANVAS_W = s.W;
  // Target ~22% of window height, clamped to a reasonable min/max.
  CANVAS_H = Math.round(Math.max(120, Math.min(Math.round(s.H * 0.22), 420)));
  FIELD_COLS = CANVAS_W * FIELD_OVERSAMPLE;
  FIELD_ROWS = CANVAS_H * FIELD_OVERSAMPLE;
  const totalCells = FIELD_COLS * FIELD_ROWS;
  if (totalCells > MAX_FIELD_CELLS) {
    const scale = Math.sqrt(MAX_FIELD_CELLS / totalCells);
    FIELD_COLS = Math.max(1, Math.floor(FIELD_COLS * scale));
    FIELD_ROWS = Math.max(1, Math.floor(FIELD_ROWS * scale));
  }
  FIELD_SCALE_X = FIELD_COLS / CANVAS_W;
  FIELD_SCALE_Y = FIELD_ROWS / CANVAS_H;
  // assign particle types using the central weights map (easy to change/extend)
  // Update weights based on current level
  // Use difficultyLevel + 1 if defined, else 1 (difficultyLevel starts at 0 for level 1)
  const level = typeof s.difficultyLevel === 'number' ? s.difficultyLevel + 1 : 1;
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
  const cloudSize = sz(W / 75, 9, 14) * WEATHER_FONT_SCALE;
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
          const val = particleTypeField[gy * FIELD_COLS + gx]!;
          pType = PARTICLE_TYPE_BY_ORDINAL[val];
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

    const reduced: Array<{ dx: number; dy: number; pType?: ParticleType }> = [];
    const step = emitPoints.length / CLOUD_EMIT_MAX_POINTS;
    for (let i = 0; i < CLOUD_EMIT_MAX_POINTS; i++) {
      reduced.push(emitPoints[Math.floor(i * step)]!);
    }
    cloud.emitPoints = reduced;
  }
}

if (typeof window !== 'undefined') {
  (window as any).initParticleSystem = initParticleSystem;
  (window as any).updateCloudEmitPoints = updateCloudEmitPoints;
  (window as any).rebuildStars = rebuildStars;
  (window as any).buildAsciiBackground = buildAsciiBackground;
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
  const phase = elapsed * (c.type === 'rain' ? 1.2 : c.type === 'snow' ? 0.7 : c.type === 'purpleRain' ? 1.0 : 0.5) + c.id * 0.9;
  const cloudType: ParticleType = c.type === 'purpleRain'
    ? 'purpleRain'
    : (c.visualType ?? c.type);
  const charset = CLOUD_CHARSETS[cloudType] || CLOUD_CHARSET;
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
  const size  = sz(W / 75, 9, 14) * WEATHER_FONT_SCALE;
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

  const drawCloudRun = (text: string, runType: ParticleType | 'mixed' | undefined, x: number, y: number): void => {
    if (text.length === 0) return;
    const color = runType === 'snow' ? COLORS.cloudSnow : runType === 'hail' ? COLORS.cloudHail : COLORS.cloudRain;
    const glowColor = color;
    const glowFactor = runType === 'snow' ? 0.95 : runType === 'hail' ? 0.7 : 1.1;
    const haloBlur = Math.max(10, Math.round(size * 2.1 * glowFactor));
    const innerBlur = Math.max(5, Math.round(size * 0.9 * glowFactor));
    const haloAlpha = runType === 'hail' ? 0.34 : runType === 'snow' ? 0.42 : 0.5;
    const block = renderer.getBlock(text, f, lineH);

    // Traveler-style glow: a soft halo first, then the crisp glyph with a tighter inner glow.
    renderer.drawBlock(ctx, block, x, y, {
      color: glowColor,
      shadowColor: glowColor,
      shadowBlur: haloBlur,
      alpha: haloAlpha,
    });
    renderer.drawBlock(ctx, block, x, y, {
      color,
      shadowColor: glowColor,
      shadowBlur: innerBlur,
      alpha: 1,
    });
  };

  for (let r = 0; r < rows; r++) {
    let cloudLine = '';
    let hasCloud = false;
    const pTypeArr: Array<ParticleType | 'mixed' | undefined> = [];

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
          const val = particleTypeField[gy * FIELD_COLS + gx]!;
          pType = PARTICLE_TYPE_BY_ORDINAL[val];
        }
      }

      const drawType: ParticleType | 'mixed' = pType ?? 'mixed';
      const charset = (pType ? CLOUD_CHARSETS[pType] : CLOUD_CHARSET) || CLOUD_CHARSET;
      const adjusted = Math.sqrt(brightness);
      const idx = Math.min(Math.max(Math.floor(adjusted * (charset.length - 1)), 0), charset.length - 1);
      const ch = charset[idx] && charset[idx] !== ' ' ? charset[idx] : '.';
      cloudLine += ch;
      pTypeArr.push(drawType);
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
            drawCloudRun(substr, runType, x, startY + r * lineH);
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
          drawCloudRun(substr, runType, x, startY + r * lineH);
          // start new
          runStart = i;
          runType = t;
        }
      }
      // flush tail run
      if (runStart !== -1) {
        const substr = cloudLine.slice(runStart, cols);
        const x = startX + runStart * charW;
        drawCloudRun(substr, runType, x, startY + r * lineH);
      }
    }
  }

  for (const cloud of s.clouds) {
    if (cloud.type !== 'purpleRain') continue;
    const cloudBlock = renderer.getBlock(getCloudLines(cloud, s.elapsed).join('\n'), f, lineH);
    const cloudX = cloud.x - cloudBlock.width / 2;
    const cloudY = Math.max(startY, cloud.y);
    renderer.drawBlock(ctx, cloudBlock, cloudX, cloudY, {
      color: COLORS.PURPLE_RAIN,
      shadowColor: COLORS.PURPLE_GLOW,
      shadowBlur: 16,
      alpha: 0.68,
    });
    renderer.drawBlock(ctx, cloudBlock, cloudX, cloudY, {
      color: COLORS.PURPLE_RAIN,
      shadowColor: COLORS.PURPLE_GLOW,
      shadowBlur: 8,
      alpha: 0.94,
    });
  }
}

// Ground
function travelerGroundY(s: GameState): number { return Math.round(s.H * GROUND_Y_RATIO); }
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
    { pattern: '|grass|ground|', color: COLORS.brightGreen, alpha: 1.0 },
    { pattern: '|ground|grass|', color: COLORS.brightGreen, alpha: 0.82 },
    { pattern: '|grass|ground|', color: COLORS.brightGreen, alpha: 0.68 },
  ];
  const charW = renderer.measureWidth('|', f);
  if (charW <= 0) return;
  const totalRows = Math.min(5, Math.ceil((H - groundY) / lineH) + 1);
  for (let row = 0; row < totalRows; row++) {
    const base = rows[row % rows.length];
    const depth = totalRows > 1 ? row / (totalRows - 1) : 0;
    const fade = 1 - depth * 0.45;
    const pattern = base.pattern;
    const color = base.color;
    const alpha = base.alpha * fade;
    const rowY = groundY + row * lineH + 2;
    if (rowY > H) break;
    const scroll = row % 2 === 0 ? s.groundOffset : -s.groundOffset;
    const totalW = pattern.length * charW;
    if (totalW <= 0) continue;
    let x = -((scroll % totalW) + totalW) % totalW;
    const block = renderer.getBlock(pattern, f, lineH);
    while (x < W + totalW) { renderer.drawBlock(ctx, block, x, rowY, { color, alpha }); x += totalW; }
  }

  // Render snow on the ground
  for (const snow of s.groundSnow) {
    const snowAlpha = Math.max(0, snow.life / 4); // fade based on life
    renderer.drawText(ctx, '✱', f, lineH, snow.x, groundY, {
      color: COLORS.white,
      alpha: snowAlpha * 0.8,
      align: 'center',
      shadowColor: COLORS.white,
      shadowBlur: 4,
    });
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
      const lfc = speedFrac > 0.6 ? TRAVELER_LEGS_RUN.length : speedFrac > 0.15 ? TRAVELER_LEGS_WALK.length : TRAVELER_LEGS_IDLE.length;
      tLegFrame = (tLegFrame + 1) % lfc;
    }
  }
  const legFrames = speedFrac > 0.6 ? TRAVELER_LEGS_RUN : speedFrac > 0.15 ? TRAVELER_LEGS_WALK : TRAVELER_LEGS_IDLE;
  const groundLegStr = legFrames[tLegFrame % legFrames.length];
  const armsJump = s.travelerVY < 0 ? TRAVELER_ARMS_ASCENDING : TRAVELER_ARMS_DESCENDING;
  const legsJump = s.travelerVY < 0 ? TRAVELER_LEGS_ASCENDING : TRAVELER_LEGS_DESCENDING;
  const moving = s.travelerVX;
  const armsStr = moving < -10 ? TRAVELER_ARMS_LEFT : moving > 10 ? TRAVELER_ARMS_RIGHT : TRAVELER_ARMS_IDLE;
  const size = sz(W / 40, 14, 22);
  const f = fnt(size, 700);
  const lh = size + 2;
  const visible = s.hitCooldown > 0 ? (Math.floor(s.hitCooldown * 9) % 2 === 0) : true;
  if (!visible) return;
  const glow = s.hitCooldown > 0 ? COLORS.brightRed : airborne ? COLORS.brightAmber : COLORS.brightGreen;
  const wobble = !airborne && speedFrac > 0.7 ? Math.sin(Date.now() / 55) * 1.5 : 0;
  const tx = s.travelerX + wobble;

  const headStr = airborne ? TRAVELER_JUMP_HEAD : TRAVELER_HEADS[tFrame];
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
    const base = (h.type === 'hail' ? sz(W / 55, 12, 17) : sz(W / 65, 10, 14)) * WEATHER_FONT_SCALE;
    const size = Math.round(base * h.size);
    const f = fnt(size, 700);
    const color = h.type === 'rain' ? COLORS.rain : h.type === 'snow' ? COLORS.snow : h.type === 'purpleRain' ? COLORS.PURPLE_RAIN : COLORS.hail;
    const shadowColor = h.type === 'rain' ? '#1a6090' : h.type === 'snow' ? '#6090b0' : h.type === 'purpleRain' ? COLORS.PURPLE_GLOW : '#606878';
    const alpha = Math.min(1, (h.y + 30) / 30);
    const block = renderer.getBlock(h.glyph, f, size * 1.3);
    if (h.type === 'purpleRain') {
      renderer.drawBlock(ctx, block, h.x + 1, h.y, {
        color: COLORS.PURPLE_FLARE,
        shadowColor: COLORS.PURPLE_GLOW,
        shadowBlur: 15,
        align: 'center',
        verticalAlign: 'middle',
        alpha: alpha * 0.55,
      });
      renderer.drawBlock(ctx, block, h.x, h.y, {
        color,
        shadowColor,
        shadowBlur: 15,
        align: 'center',
        verticalAlign: 'middle',
        alpha,
      });
    } else {
      renderer.drawBlock(ctx, block, h.x, h.y, { color, shadowColor, shadowBlur: 6, align: 'center', verticalAlign: 'middle', alpha });
    }
  }
}

function powerUpColor(type: GameState['activePowerUp'] | NonNullable<GameState['activePowerUp']>): string {
  switch (type) {
    case 'zip': return COLORS.brightGreen;
    case 'sudo': return COLORS.brightRed;
    case 'shield': return COLORS.cyan;
    case 'doublePoints': return COLORS.comboGold;
    case 'slowMotion': return '#84b6ff';
    case 'healthBoost': return COLORS.brightRed;
    case 'hazardClear': return COLORS.white;
    case 'findBoost': return COLORS.brightAmber;
    default: return COLORS.green;
  }
}

function drawPowerUpPickups(s: GameState): void {
  if (s.powerUpPickups.length === 0) return;
  const size = sz(W / 65, 10, 15);
  const lineH = Math.round(size * 1.25);

  for (const pickup of s.powerUpPickups) {
    const pulse = 0.68 + 0.32 * Math.sin(pickup.phase * 2.2);
    const ttlT = Math.max(0, 1 - pickup.age / pickup.ttl);
    const alpha = Math.max(0.22, ttlT) * pulse;
    const label = powerUpLabel(pickup.type);
    const color = powerUpColor(pickup.type);
    const font = fnt(size + (pickup.type === 'healthBoost' ? 1 : 0), 700);
    const block = renderer.getBlock(label, font, lineH);
    renderer.drawBlock(ctx, block, pickup.x, pickup.y, {
      color,
      shadowColor: color,
      shadowBlur: 12,
      align: 'center',
      verticalAlign: 'middle',
      alpha,
    });
  }
}

function drawPowerUpEffects(s: GameState): void {
  const active = s.activePowerUp;
  const hasText = s.powerUpTextTimer > 0 && s.powerUpText.length > 0;
  if (!active && !hasText && s.powerUpFlashTimer <= 0) return;

  if (s.powerUpFlashTimer > 0) {
    const flashAlpha = Math.min(0.22, s.powerUpFlashTimer * 0.5);
    ctx.save();
    ctx.fillStyle = '#f8fbff';
    ctx.globalAlpha = flashAlpha;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (s.shieldActive || s.shieldInvulnerabilityTimer > 0) {
    const label = s.shieldInvulnerabilityTimer > 0 ? 'SHIELD BROKEN' : 'SHIELD';
    const size = sz(W / 70, 10, 14);
    const yBob = Math.sin(s.elapsed * 6) * 6;
    const shieldY = s.travelerY - size * 1.9 + yBob;
    const color = COLORS.cyan;
    renderer.drawText(ctx, label, fnt(size, 700), size * 1.3, s.travelerX, shieldY, {
      color: color,
      shadowColor: color,
      shadowBlur: 14,
      align: 'center',
      verticalAlign: 'middle',
      alpha: 0.95,
    });
  }

  if (s.findBoostActive && s.powerUpPickups.length > 0) {
    let nearest = s.powerUpPickups[0]!;
    let bestD2 = Number.POSITIVE_INFINITY;
    for (const p of s.powerUpPickups) {
      const dx = p.x - s.travelerX;
      const dy = p.y - s.travelerY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        nearest = p;
      }
    }
    const arrow = nearest.x >= s.travelerX ? '=> FIND' : 'FIND <=';
    const ay = s.travelerY - 42;
    renderer.drawText(ctx, arrow, fnt(sz(W / 80, 9, 13), 700), sz(W / 80, 9, 13) * 1.2, s.travelerX, ay, {
      color: COLORS.brightAmber,
      shadowColor: COLORS.brightAmber,
      shadowBlur: 10,
      align: 'center',
      alpha: 0.9,
    });
  }

  if (hasText) {
    const label = s.powerUpText;
    const size = sz(W / 60, 10, 16);
    const alpha = Math.max(0.35, Math.min(1, s.powerUpTextTimer));
    const color = active ? powerUpColor(active) : COLORS.green;
    const centerY = H * 0.16;
    
    // Measure text to create appropriately sized background box
    const textWidth = renderer.measureWidth(label, fnt(size, 700));
    const boxPadding = size * 0.6;
    const boxWidth = textWidth + boxPadding * 2;
    const boxHeight = size * 2;
    const boxX = W / 2 - boxWidth / 2;
    const boxY = centerY - boxHeight / 2;
    
    // Draw glowing background box with shadow/blur effect
    ctx.save();
    ctx.globalAlpha = alpha * 0.15;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 32;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Draw border glow
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    ctx.restore();
    
    renderer.drawText(ctx, label, fnt(size, 700), size * 1.25, W / 2, centerY + size * 0.1, {
      color,
      shadowColor: color,
      shadowBlur: 16,
      align: 'center',
      verticalAlign: 'middle',
      alpha,
    });
  }
}

// Particles
function drawParticles(s: GameState): void {
  for (const p of s.particles) {
    const baseSize = sz(W / 70, 8, 12) * WEATHER_FONT_SCALE;
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
    const alpha = Math.max(0, h.life);
    if (alpha < 0.03) continue;
    const block = renderer.getBlock(h.glyph, f, size * 1.5);
    renderer.drawBlock(ctx, block, h.x, h.y, { 
      color: h.color, 
      shadowColor: h.color, 
      shadowBlur: 5,
      align: 'center', 
      verticalAlign: 'middle', 
      alpha 
    });
  }
}

// ─── Umbrella ─────────────────────────────────────────────────────────────────
function drawUmbrella(s: GameState): void {
  const { umbrellaX: ux, umbrellaY: uy } = s;
  const isPortrait = H > W;
  const size  = sz(W / (isPortrait ? 118 : 100), isPortrait ? 6 : 7, 11);
  const f     = fnt(size, 700);
  const lineH = Math.round(size * 1.15);

  const comboT = Math.max(0, Math.min(1, s.combo / 10));
  const glowColor = comboT > 0.65 ? COLORS.comboGold : COLORS.amber;
  const canopyGlowBlur = Math.round(4 + comboT * 28);
  const rimGlowBlur = Math.round(2 + comboT * 14);
  const glowAlpha = comboT;

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
      color: COLORS.umbrella,
      shadowColor: glowColor,
      shadowBlur: canopyGlowBlur,
      alpha: 1,
    });
    if (glowAlpha > 0) {
      renderer.drawBlock(ctx, block, startX, startY + i * lineH, {
        color: COLORS.umbrella,
        shadowColor: glowColor,
        shadowBlur: canopyGlowBlur,
        alpha: glowAlpha * 0.22,
      });
    }
  }

  const handleStartY = startY + UMBRELLA_CANOPY.length * lineH;
  const handleBlock  = renderer.getBlock('|', f, lineH);
  for (let i = 0; i < UMBRELLA_HANDLE_LINES; i++) {
    renderer.drawBlock(ctx, handleBlock, ux, handleStartY + i * lineH, {
      color: COLORS.umbrellaRim,
      shadowColor: glowColor,
      shadowBlur: rimGlowBlur,
      align: 'center',
      alpha: 1,
    });
    if (glowAlpha > 0) {
      renderer.drawBlock(ctx, handleBlock, ux, handleStartY + i * lineH, {
        color: COLORS.umbrellaRim,
        shadowColor: glowColor,
        shadowBlur: rimGlowBlur,
        align: 'center',
        alpha: glowAlpha * 0.16,
      });
    }
  }

  const footStartY = handleStartY + UMBRELLA_HANDLE_LINES * lineH;
  for (let i = 0; i < UMBRELLA_FOOT.length; i++) {
    const isSignature = UMBRELLA_FOOT[i].includes('Yb') || UMBRELLA_FOOT[i].includes('dB') || UMBRELLA_FOOT[i].includes('mdP');
    const block = renderer.getBlock(UMBRELLA_FOOT[i], f, lineH);
    renderer.drawBlock(ctx, block, ux, footStartY + i * lineH, {
      color: isSignature ? COLORS.cyan : COLORS.umbrellaRim,
      shadowColor: isSignature ? COLORS.cyan : glowColor,
      shadowBlur: isSignature ? Math.round(4 + comboT * 10) : rimGlowBlur,
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
    const padX = Math.max(5, size * 0.45);
    const padY = Math.max(2, size * 0.2);
    const bgX = p.x - block.width / 2 - padX;
    const bgY = p.y - block.height / 2 - padY;
    const bgW = block.width + padX * 2;
    const bgH = block.height + padY * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 10, 16, 0.74)';
    ctx.globalAlpha = alpha;
    ctx.fillRect(bgX, bgY, bgW, bgH);
    ctx.restore();
    renderer.drawBlock(ctx, block, p.x, p.y, {
      color: p.color,
      shadowColor: p.color,
      shadowBlur: 14,
      strokeColor: '#060b11',
      strokeWidth: 2,
      align: 'center',
      verticalAlign: 'middle',
      alpha,
    });
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

function drawPowerUpCommandLine(s: GameState, size: number, y: number, pad: number): void {
  const entries = (Object.entries(s.powerUpTimers) as Array<[NonNullable<GameState['activePowerUp']>, number]>)
    .filter(([, timer]) => timer > 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return;

  const isPortrait = s.H > s.W;
  const prompt = '$ '; // command-line prompt marker
  const labels = entries.map(([type, timer]) => ({
    type,
    raw: `${powerUpLabel(type)} ${timer.toFixed(1)}s`,
  }));

  const maxLabelChars = Math.max(...labels.map((it) => it.raw.length));
  const tokens = labels.map((it) => ({
    type: it.type,
    text: `[${it.raw.padEnd(maxLabelChars, ' ')}]`,
  }));

  // Adjust available width based on screen orientation
  const adjustedPad = isPortrait ? Math.max(4, pad - 6) : pad;
  const availableW = Math.max(0, W - adjustedPad * 2);

  const maxFontSize = Math.max(isPortrait ? 8 : 9, size - 1);
  const minFontSize = isPortrait ? 6 : 7;
  type CmdLayout = {
    fontSize: number;
    cmdFont: string;
    cmdLineH: number;
    gap: number;
    promptW: number;
    tokenWidths: number[];
    visibleCount: number;
    usedW: number;
  };

  const buildLayout = (fontSize: number): CmdLayout => {
    const cmdFont = fnt(fontSize, 700);
    const cmdLineH = Math.max(10, Math.round(fontSize * 1.2));
    const gap = Math.max(6, Math.round(fontSize * 0.75));
    const promptW = renderer.measureWidth(prompt, cmdFont);
    const tokenWidths = tokens.map((it) => renderer.measureWidth(it.text, cmdFont));

    let visibleCount = tokens.length;
    let usedW = promptW;
    for (let i = 0; i < tokens.length; i++) {
      const nextW = tokenWidths[i]! + (i > 0 ? gap : 0);
      if (usedW + nextW > availableW) {
        visibleCount = i;
        break;
      }
      usedW += nextW;
    }

    if (visibleCount < tokens.length && visibleCount > 0) {
      const remaining = tokens.length - visibleCount;
      const moreToken = `[+${remaining}]`;
      const moreW = renderer.measureWidth(moreToken, cmdFont);
      while (visibleCount > 0 && usedW + gap + moreW > availableW) {
        visibleCount -= 1;
        usedW -= tokenWidths[visibleCount]!;
        if (visibleCount > 0) usedW -= gap;
      }
      usedW += (visibleCount > 0 ? gap : 0) + moreW;
    }

    return { fontSize, cmdFont, cmdLineH, gap, promptW, tokenWidths, visibleCount, usedW };
  };

  let bestLayout = buildLayout(maxFontSize);
  for (let fontSize = maxFontSize - 1; fontSize >= minFontSize; fontSize--) {
    const layout = buildLayout(fontSize);
    if (
      layout.visibleCount > bestLayout.visibleCount ||
      (layout.visibleCount === bestLayout.visibleCount && layout.fontSize > bestLayout.fontSize)
    ) {
      bestLayout = layout;
    }
  }

  const { cmdFont, cmdLineH, gap, promptW, tokenWidths, visibleCount, usedW } = bestLayout;

  const leftX = Math.max(adjustedPad, Math.round((W - usedW) / 2));
  const lineTop = y - 4;
  const boxPad = 6;
  ctx.save();
  ctx.fillStyle = 'rgba(5, 11, 18, 0.88)';
  ctx.fillRect(leftX - boxPad, lineTop, usedW + boxPad * 2, cmdLineH + 8);
  ctx.strokeStyle = 'rgba(108, 242, 128, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(leftX - boxPad, lineTop, usedW + boxPad * 2, cmdLineH + 8);
  ctx.restore();

  renderer.drawText(ctx, prompt, cmdFont, cmdLineH, leftX, y, {
    color: COLORS.dimGreen,
    shadowColor: COLORS.green,
    shadowBlur: 6,
  });

  let x = leftX + promptW;
  for (let i = 0; i < visibleCount; i++) {
    const token = tokens[i]!;
    if (i > 0) x += gap;
    renderer.drawText(ctx, token.text, cmdFont, cmdLineH, x, y, {
      color: powerUpColor(token.type),
      shadowColor: powerUpColor(token.type),
      shadowBlur: 9,
    });
    x += tokenWidths[i]!;
  }

  if (visibleCount < tokens.length) {
    const remaining = tokens.length - visibleCount;
    const moreToken = `[+${remaining}]`;
    if (visibleCount > 0) x += gap;
    renderer.drawText(ctx, moreToken, cmdFont, cmdLineH, x, y, {
      color: COLORS.dim,
      shadowColor: COLORS.dim,
      shadowBlur: 4,
    });
  }
}

// HUD
function drawHUD(s: GameState): void {
  const size = sz(W / 70, 10, 14);
  const fb   = fnt(size, 700);
  const f    = fnt(size);
  const pad  = 14;
  const barH = size + 42;
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

  const windStrength = Math.round(Math.abs(s.windX));
  const windArrow = windStrength < 8 ? '<>' : s.windX >= 0 ? '>>>' : '<<<';
  const windText = `WIND:${windArrow} ${windStrength}`;
  const windColor = windStrength < 12 ? COLORS.dim : windStrength < 45 ? COLORS.cyan : COLORS.brightAmber;
  const windW = renderer.measureWidth(windText, fnt(size - 1, 700));
  renderer.drawText(ctx, windText, fnt(size - 1, 700), size + 2, W - pad - windW, textY + size + 2, {
    color: windColor,
    shadowColor: windColor,
    shadowBlur: windStrength > 20 ? 8 : 0,
    alpha: 0.95,
  });

  drawPowerUpCommandLine(s, size, textY + size + 2, pad);
}

function drawScanlines(alpha: number): void {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#000000';
  for (let y = 0; y < H; y += 12) ctx.fillRect(0, y, W, 1);
  ctx.restore();
}

// Game over
function drawGameOver(s: GameState): void {
  ctx.fillStyle = '#060c14';
  ctx.globalAlpha = 0.88;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  const cx = W / 2;
  const panelMargin = Math.max(10, Math.min(28, W * 0.04));
  const boxW = Math.min(620, W - panelMargin * 2);
  const boxH = Math.min(H - panelMargin * 2, W < 480 ? 250 : 270);
  const boxX = Math.round(cx - boxW / 2);
  const boxY = Math.round(H / 2 - boxH / 2);
  const compact = boxW < 430;
  const innerPadX = compact ? 14 : 18;
  const innerW = boxW - innerPadX * 2;

  const titleSize = sz(W / 42, 14, 22);
  const bodySize = sz(W / 55, 11, 16);
  const metaSize = Math.max(10, bodySize - 1);
  const promptSize = Math.max(10, bodySize);
  const lh = Math.round(bodySize + (compact ? 7 : 8));

  const statsText = compact
    ? `SURVIVED: ${Math.floor(s.elapsed)}s\nLEVEL REACHED: ${s.difficultyLevel + 1}`
    : `SURVIVED: ${Math.floor(s.elapsed)}s   LEVEL REACHED: ${s.difficultyLevel + 1}`;
  const promptText = boxW < 380
    ? '> Press R / ENTER\n> or tap to restart'
    : compact
      ? '> Press R / ENTER\n> tap to restart'
      : '> Press R / ENTER / tap to restart';

  const titleBlock = renderer.getBlock('[ PROCESS KILLED ]', fnt(titleSize, 700), lh, innerW);
  const scoreBlock = renderer.getBlock(`FINAL SCORE: ${s.score}`, fnt(bodySize, 700), lh, innerW);
  const statsBlock = renderer.getBlock(statsText, fnt(metaSize), lh, innerW);
  const comboBlock = s.bestCombo > 1
    ? renderer.getBlock(`BEST COMBO: ×${s.bestCombo}`, fnt(metaSize, 700), lh, innerW)
    : null;
  const promptBlock = renderer.getBlock(promptText, fnt(promptSize, 700), lh, innerW);

  const contentGap = Math.max(8, Math.round(lh * 0.35));
  const ruleGap = Math.max(10, Math.round(lh * 0.55));
  let totalHeight = titleBlock.height + ruleGap + scoreBlock.height + contentGap + statsBlock.height + ruleGap + promptBlock.height;
  if (comboBlock) totalHeight += contentGap + comboBlock.height;

  ctx.fillStyle = 'rgba(6,12,20,0.92)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  renderer.drawGlyphBox(ctx, fnt(bodySize), lh, boxX, boxY, boxW, boxH, { color: COLORS.red, alpha: 0.8 });

  let y = Math.round(boxY + Math.max(16, (boxH - totalHeight) / 2));

  renderer.drawBlock(ctx, titleBlock, cx, y, {
    color: COLORS.red,
    shadowColor: COLORS.brightRed,
    shadowBlur: 22,
    align: 'center',
  });
  y += titleBlock.height + Math.max(6, Math.round(contentGap * 0.8));

  renderer.drawHRule(ctx, '\u2550', fnt(Math.max(metaSize - 1, 10)), lh, boxX + innerPadX, y, innerW, {
    color: COLORS.dimGreen,
    alpha: 0.6,
  });
  y += ruleGap;

  renderer.drawBlock(ctx, scoreBlock, cx, y, {
    color: COLORS.amber,
    shadowColor: COLORS.amber,
    shadowBlur: 10,
    align: 'center',
  });
  y += scoreBlock.height + contentGap;

  renderer.drawBlock(ctx, statsBlock, cx, y, { color: COLORS.dim, align: 'center' });
  y += statsBlock.height;

  if (comboBlock) {
    y += contentGap;
    renderer.drawBlock(ctx, comboBlock, cx, y, { color: COLORS.cyan, align: 'center' });
    y += comboBlock.height;
  }

  y += Math.max(6, Math.round(contentGap * 0.8));
  renderer.drawHRule(ctx, '\u2550', fnt(Math.max(metaSize - 1, 10)), lh, boxX + innerPadX, y, innerW, {
    color: COLORS.dimGreen,
    alpha: 0.6,
  });
  y += ruleGap;

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    renderer.drawBlock(ctx, promptBlock, cx, y, {
      color: COLORS.green,
      shadowColor: COLORS.green,
      shadowBlur: 8,
      align: 'center',
    });
  }
}

init();