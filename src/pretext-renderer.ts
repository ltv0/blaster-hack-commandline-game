// pretext-renderer.ts
// Canvas text rendering helpers.
// Integrates @chenglou/pretext for accurate multi-line layout measurement
// and uses canvas 2D for all drawing (text/glyph only — no sprites).

import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

// ─── Pretext-powered multi-line layout ───────────────────────────────────────
// Use prepareWithSegments + layoutWithLines for accurate HUD/overlay text wrapping.

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
    // Fallback: return text as a single line if pretext is unavailable
    return [{ text, width: maxWidth }];
  }
}

// ─── Canvas measure cache ─────────────────────────────────────────────────────
// Caches canvas measureText results by font+text key to avoid repeated DOM hits.

const _measureCache = new Map<string, TextMetrics>();

export function measureText(ctx: CanvasRenderingContext2D, text: string, font: string): TextMetrics {
  const key = `${font}|${text}`;
  let m = _measureCache.get(key);
  if (!m) {
    ctx.save();
    ctx.font = font;
    m = ctx.measureText(text);
    ctx.restore();
    // Cap cache size to avoid unbounded growth
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

/**
 * Draw a horizontal rule using repeated `char` glyphs.
 * Uses measured char width for tight packing.
 */
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

/**
 * Draw a text block laid out with pretext, centered at (cx, startY).
 * Returns total rendered height.
 */
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

/**
 * Stroke a box using text-drawn corners and lines.
 * Keeps everything glyph-based.
 */
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
  const lh = parseInt(font) || 12; // approximate line height from font size

  const cols = Math.max(2, Math.floor(w / cw));
  const rows = Math.max(2, Math.floor(h / lh));

  // Top edge
  ctx.fillText('\u250c' + '\u2500'.repeat(cols - 2) + '\u2510', x, y);
  // Bottom edge
  ctx.fillText('\u2514' + '\u2500'.repeat(cols - 2) + '\u2518', x, y + (rows - 1) * lh);
  // Sides
  for (let r = 1; r < rows - 1; r++) {
    ctx.fillText('\u2502', x, y + r * lh);
    ctx.fillText('\u2502', x + (cols - 1) * cw, y + r * lh);
  }
  ctx.restore();
}
