// pretext-renderer.ts
// Canvas text rendering helpers.
// Integrates @chenglou/pretext for accurate multi-line layout measurement
// and uses canvas 2D for all drawing (text/glyph only — no sprites).

import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

// ─── Pretext-powered multi-line layout ───────────────────────────────────────

export interface TextLayoutLine {
  text: string;
  width: number;
}

/**
 * Lay out `text` into lines constrained to `maxWidth`, using pretext for
 * accurate measurement. Returns an array of line strings.
 */
export function layoutTextLines(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number
): TextLayoutLine[] {
  try {
    const prepared = prepareWithSegments(text, font);
    const result = layoutWithLines(prepared, maxWidth, lineHeight);
    return result.lines.map((l) => ({ text: l.text, width: l.width }));
  } catch {
    return [{ text, width: maxWidth }];
  }
}

/**
 * Use pretext to layout a single-line string and return its measured width.
 * Falls back to canvas measureText if pretext unavailable.
 */
export function measureWithPretext(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string
): number {
  try {
    const prepared = prepareWithSegments(text, font);
    // Use a very wide maxWidth so it never wraps — we just want the width
    const result = layoutWithLines(prepared, 99999, 99999);
    if (result.lines.length > 0) return result.lines[0].width;
  } catch {
    // fallthrough
  }
  return measureText(ctx, text, font).width;
}

/**
 * Draw a string using pretext layout, returning the line array for callers
 * that need to know measured widths.
 */
export function drawWithPretext(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign = 'left',
  baseline: CanvasTextBaseline = 'top',
  alpha = 1
): TextLayoutLine[] {
  if (alpha <= 0) return [];
  const lines = layoutTextLines(text, font, maxWidth, lineHeight);
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (alpha < 1) ctx.globalAlpha = alpha;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i].text, x, y + i * lineHeight);
  }
  ctx.restore();
  return lines;
}

/**
 * Draw a string with shadow, using pretext for layout.
 */
export function drawWithPretextShadow(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  shadowColor: string,
  shadowBlur: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign = 'left',
  baseline: CanvasTextBaseline = 'top',
  alpha = 1
): TextLayoutLine[] {
  if (alpha <= 0) return [];
  const lines = layoutTextLines(text, font, maxWidth, lineHeight);
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  if (alpha < 1) ctx.globalAlpha = alpha;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i].text, x, y + i * lineHeight);
  }
  ctx.restore();
  return lines;
}

// ─── Canvas measure cache ─────────────────────────────────────────────────────

const _measureCache = new Map<string, TextMetrics>();

export function measureText(ctx: CanvasRenderingContext2D, text: string, font: string): TextMetrics {
  const key = `${font}|${text}`;
  let m = _measureCache.get(key);
  if (!m) {
    ctx.save();
    ctx.font = font;
    m = ctx.measureText(text);
    ctx.restore();
    if (_measureCache.size > 2000) _measureCache.clear();
    _measureCache.set(key, m);
  }
  return m;
}

export function clearMeasureCache(): void {
  _measureCache.clear();
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

export function clearCanvas(
  ctx: CanvasRenderingContext2D,
  color: string,
  w: number,
  h: number
): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = 'left',
  baseline: CanvasTextBaseline = 'alphabetic',
  alpha = 1
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawTextShadow(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  shadowColor: string,
  shadowBlur: number,
  align: CanvasTextAlign = 'left',
  baseline: CanvasTextBaseline = 'alphabetic',
  alpha = 1
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawHRule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  font: string,
  color: string,
  char = '\u2500',
  alpha = 1
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.font = font;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  if (alpha < 1) ctx.globalAlpha = alpha;
  const charW = ctx.measureText(char).width || 8;
  const count = Math.max(1, Math.floor(width / charW));
  ctx.fillText(char.repeat(count), x, y);
  ctx.restore();
}

export function drawLayoutBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  startY: number,
  font: string,
  color: string,
  lineHeight: number,
  maxWidth: number,
  align: CanvasTextAlign = 'center'
): number {
  const lines = layoutTextLines(text, font, maxWidth, lineHeight);
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i].text, cx, startY + i * lineHeight);
  }
  ctx.restore();
  return lines.length * lineHeight;
}

export function drawGlyphBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  font: string,
  color: string,
  alpha = 1
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  if (alpha < 1) ctx.globalAlpha = alpha;

  const cw = ctx.measureText('\u2500').width || 8;
  const lh = parseInt(font) || 12;

  const cols = Math.max(2, Math.floor(w / cw));
  const rows = Math.max(2, Math.floor(h / lh));

  ctx.fillText('\u250c' + '\u2500'.repeat(cols - 2) + '\u2510', x, y);
  ctx.fillText('\u2514' + '\u2500'.repeat(cols - 2) + '\u2518', x, y + (rows - 1) * lh);
  for (let r = 1; r < rows - 1; r++) {
    ctx.fillText('\u2502', x, y + r * lh);
    ctx.fillText('\u2502', x + (cols - 1) * cw, y + r * lh);
  }
  ctx.restore();
}

// ─── ASCII Background Field ───────────────────────────────────────────────────
// A grid of randomized ASCII characters that slowly shift and pulse.
// Each cell has an independent phase, speed, and character set.

const BG_CHARS = [
  // Box-drawing and block elements
  '\u2500', '\u2502', '\u250c', '\u2510', '\u2514', '\u2518',
  '\u251c', '\u2524', '\u252c', '\u2534', '\u253c',
  '\u2550', '\u2551', '\u2554', '\u2557', '\u255a', '\u255d',
  '\u2591', '\u2592', '\u2593',
  // Math / symbols
  '+', '-', '=', '~', '^', '|', '/', '\\', '_',
  // Dots and misc
  '\u00b7', '\u2022', '\u25aa', '\u25ab', '\u25a1', '\u25a0',
  '\u2219', '\u2218', '\u00b0',
  // Brackets
  '[', ']', '{', '}', '(', ')', '<', '>',
  // Letters for noise
  'x', 'o', '#', '@', '%', '$', '&', '*', '!',
];

interface BgCell {
  charIndex: number;
  phase: number;       // 0..2π, controls alpha pulse
  speed: number;       // phase advance per second
  changeTimer: number; // countdown to next char swap
  changeInterval: number;
}

let _bgCells: BgCell[] = [];
let _bgCols = 0;
let _bgRows = 0;
let _bgCellW = 0;
let _bgCellH = 0;
let _bgFont = '';

/**
 * Build or rebuild the background cell grid.
 * Call this when the canvas size changes.
 */
export function buildAsciiBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  font: string
): void {
  _bgFont = font;
  ctx.font = font;
  _bgCellW = ctx.measureText('M').width;
  _bgCellH = parseInt(font) * 1.25 || 14;

  _bgCols = Math.ceil(w / _bgCellW) + 1;
  _bgRows = Math.ceil(h / _bgCellH) + 1;

  const needed = _bgCols * _bgRows;
  // Keep existing cells if just resizing — rebuild only if totally different
  if (_bgCells.length !== needed) {
    _bgCells = Array.from({ length: needed }, () => ({
      charIndex: Math.floor(Math.random() * BG_CHARS.length),
      phase: Math.random() * Math.PI * 2,
      speed: 0.15 + Math.random() * 0.5,
      changeTimer: Math.random() * 6,
      changeInterval: 2 + Math.random() * 8,
    }));
  }
}

/**
 * Advance the background cell simulation by `dt` seconds.
 */
export function updateAsciiBackground(dt: number): void {
  for (let i = 0; i < _bgCells.length; i++) {
    const c = _bgCells[i];
    c.phase += c.speed * dt;
    if (c.phase > Math.PI * 2) c.phase -= Math.PI * 2;
    c.changeTimer -= dt;
    if (c.changeTimer <= 0) {
      c.charIndex = Math.floor(Math.random() * BG_CHARS.length);
      c.changeInterval = 2 + Math.random() * 8;
      c.changeTimer = c.changeInterval;
      // Occasionally spike the speed for a brief glitch flash
      if (Math.random() < 0.12) c.speed = 1.2 + Math.random() * 2.5;
      else c.speed = 0.15 + Math.random() * 0.5;
    }
  }
}

/**
 * Draw the animated ASCII background field onto `ctx`.
 * `scrollY` offsets rows for parallax.
 * `baseAlpha` is the maximum alpha (e.g. 0.07 for very faded).
 * `tintColor` is the hex color for all characters.
 */
export function drawAsciiBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scrollY: number,
  baseAlpha: number,
  tintColor: string
): void {
  if (_bgCells.length === 0 || _bgCols === 0) return;

  ctx.save();
  ctx.font = _bgFont;
  ctx.fillStyle = tintColor;
  ctx.textBaseline = 'top';

  const scrolledY = scrollY % _bgCellH;

  for (let row = 0; row < _bgRows; row++) {
    const y = row * _bgCellH - scrolledY;
    if (y > h + _bgCellH) continue;

    for (let col = 0; col < _bgCols; col++) {
      const x = col * _bgCellW;
      if (x > w + _bgCellW) continue;

      const idx = row * _bgCols + col;
      if (idx >= _bgCells.length) continue;

      const cell = _bgCells[idx];
      // Sine-wave pulsed alpha — each cell independently breathes
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(cell.phase));
      const alpha = baseAlpha * pulse;
      if (alpha < 0.005) continue;

      ctx.globalAlpha = alpha;
      ctx.fillText(BG_CHARS[cell.charIndex], x, y);
    }
  }

  ctx.restore();
}
