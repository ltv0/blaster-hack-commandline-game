import { ctx, renderer, W, H, fnt, sz } from './canvas.ts'

interface Star { x: number; y: number; size: number; speed: number; brightness: number }
export interface BgCell { charIndex: number; phase: number; speed: number; changeTimer: number; changeInterval: number }
export interface BgRepulsor { x: number; y: number; radius: number; strength: number }
export interface BgOccluder { x: number; y: number; w: number; h: number }
export interface BgInterval { left: number; right: number }
export interface BgCircleObstacle { cx: number; cy: number; rx: number; ry: number; hPad: number; vPad: number }

const GROUND_Y_RATIO = 0.91
const SKY_GRID_COL_DRIFT_THRESHOLD = 2
const SKY_GRID_ROW_DRIFT_THRESHOLD = 1
const BG_CHARS = [
  '\u2500','\u2502','\u250c','\u2510','\u2514','\u2518','\u251c','\u2524',
  '\u2550','\u2551','\u2591','\u2592',
  '+','-','=','~','^','|','/','\\',
  '\u00b7','\u2022','\u25a1','\u2219',
  '[',']','{','}','<','>',
  'x','o','#','@','%',
]

const SKY_TEXT_FILES = import.meta.glob('../txtrotation/*.txt', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>

let stars: Star[] = []
let bgCells: BgCell[] = []
let bgCols = 0
let bgRows = 0
let bgCellW = 0
let bgCellH = 0
let bgFont = ''
let bgHoverActive = false
let bgHoverPulse = 0
let bgHoverX = 0
let bgHoverY = 0
let bgHoverTargetX = 0
let bgHoverTargetY = 0
let skyTextNormalized = ''
let skyTextStream = ''
let skyTextStreamTargetLen = 0
let SKY_TEXT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '

export function buildStars(w: number, h: number, count = 130): void {
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h * 0.82,
    size: 2 + Math.floor(Math.random() * 9),
    speed: 0.3 + Math.random() * 0.7,
    brightness: 0.4 + Math.random() * 0.6,
  }))
}

export function rebuildStars(w: number, h: number): void {
  buildStars(w, h)
}

export function drawStars(s: { elapsed: number }): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let activeSize = -1
  for (const star of stars) {
    const twinkle = 0.7 + 0.3 * Math.sin(s.elapsed * (1.2 + star.speed) + star.x * 0.05)
    ctx.globalAlpha = star.brightness * twinkle
    ctx.fillStyle = star.size > 1 ? '#8899aa' : '#4a6070'
    if (star.size !== activeSize) {
      activeSize = star.size
      ctx.font = fnt(activeSize)
    }
    ctx.fillText('★', Math.round(star.x), Math.round(star.y))
  }
  ctx.restore()
}

export function getBackgroundCellWidth(): number {
  return bgCellW
}

export function isBackgroundHoverActive(): boolean {
  return bgHoverActive
}

export async function loadSkyText(): Promise<void> {
  const entries = Object.entries(SKY_TEXT_FILES).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) {
    rebuildSkyTextStream(bgCells.length)
    return
  }

  const randomIndex = Math.floor(Math.random() * entries.length)
  const [, loader] = entries[randomIndex]

  try {
    const text = await loader()
    if (typeof text === 'string' && text.length > 0) {
      SKY_TEXT = text
    }
  } catch {
    // ignore and keep fallback
  }

  rebuildSkyTextStream(bgCells.length)
}

function rebuildSkyTextStream(minLen: number): void {
  skyTextNormalized = SKY_TEXT ? `${SKY_TEXT.replace(/\s+/g, ' ').trim()} ` : ''
  if (skyTextNormalized.length === 0) {
    skyTextStream = ''
    skyTextStreamTargetLen = 0
    return
  }
  const targetLen = Math.max(1, minLen)
  const repetitions = Math.ceil(targetLen / skyTextNormalized.length) + 1
  skyTextStream = skyTextNormalized.repeat(repetitions)
  skyTextStreamTargetLen = targetLen
}

export function buildAsciiBackground(): void {
  const size = sz(W / 95, 15, 15)
  bgFont = fnt(size)
  bgCellW = renderer.measureWidth('M', bgFont) || 8
  bgCellH = size * 1.3
  bgCols = Math.ceil(W / bgCellW) + 1
  bgRows = Math.ceil(H / bgCellH) + 1
  const needed = bgCols * bgRows
  if (bgCells.length !== needed) {
    bgCells = Array.from({ length: needed }, () => ({
      charIndex: Math.floor(Math.random() * BG_CHARS.length),
      phase: Math.random() * Math.PI * 2,
      speed: 0.12 + Math.random() * 0.4,
      changeTimer: Math.random() * 6,
      changeInterval: 2.5 + Math.random() * 9,
    }))
  }
  if (needed !== skyTextStreamTargetLen) rebuildSkyTextStream(needed)
  bgHoverX = W * 0.5
  bgHoverY = H * 0.45
  bgHoverTargetX = bgHoverX
  bgHoverTargetY = bgHoverY
}

export function updateAsciiBackground(dt: number): void {
  const follow = Math.min(1, dt * (bgHoverActive ? 14 : 6))
  bgHoverX += (bgHoverTargetX - bgHoverX) * follow
  bgHoverY += (bgHoverTargetY - bgHoverY) * follow
  bgHoverPulse += dt * (bgHoverActive ? 7 : 3)
  if (bgHoverPulse > Math.PI * 2) bgHoverPulse -= Math.PI * 2

  for (let i = 0; i < bgCells.length; i++) {
    const c = bgCells[i]
    c.phase += c.speed * dt
    if (c.phase > Math.PI * 2) c.phase -= Math.PI * 2
    c.changeTimer -= dt
    if (c.changeTimer <= 0) {
      c.charIndex = Math.floor(Math.random() * BG_CHARS.length)
      c.changeInterval = 2.5 + Math.random() * 9
      c.changeTimer = c.changeInterval
      c.speed = Math.random() < 0.1 ? 1.0 + Math.random() * 2.0 : 0.12 + Math.random() * 0.4
    }
  }
}

export function setBackgroundHoverTarget(x: number, y: number): void {
  bgHoverActive = true
  bgHoverTargetX = x
  bgHoverTargetY = y
}

export function clearBackgroundHover(): void {
  bgHoverActive = false
  bgHoverTargetX = W * 0.5
  bgHoverTargetY = H * 0.45
}

export function getBackgroundHoverPosition(): { x: number; y: number } {
  return { x: bgHoverX, y: bgHoverY }
}

function ellipseIntervalForBand(
  cx: number, cy: number,
  rx: number, ry: number,
  bandTop: number, bandBottom: number,
  hPad: number, vPad: number,
): BgInterval | null {
  const top = bandTop - vPad
  const bottom = bandBottom + vPad
  if (top >= cy + ry || bottom <= cy - ry) return null
  const minDy = cy >= top && cy <= bottom ? 0 : cy < top ? top - cy : cy - bottom
  if (minDy >= ry) return null
  const maxDx = rx * Math.sqrt(1 - (minDy / ry) ** 2)
  return { left: cx - maxDx - hPad, right: cx + maxDx + hPad }
}

function carveTextLineSlots(base: BgInterval, blocked: BgInterval[]): BgInterval[] {
  let slots: BgInterval[] = [{ left: base.left, right: base.right }]
  for (let bi = 0; bi < blocked.length; bi++) {
    const interval = blocked[bi]!
    const next: BgInterval[] = []
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]!
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot)
        continue
      }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left })
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right })
    }
    slots = next
  }
  return slots
}

function mergeBlockedIntervals(intervals: BgInterval[], minX: number, maxX: number): BgInterval[] {
  if (intervals.length === 0) return []
  const clamped = intervals
    .map((it) => ({ left: Math.max(minX, it.left), right: Math.min(maxX, it.right) }))
    .filter((it) => it.right > it.left)
    .sort((a, b) => a.left - b.left)
  if (clamped.length === 0) return []

  const merged: BgInterval[] = [clamped[0]!]
  for (let i = 1; i < clamped.length; i++) {
    const cur = clamped[i]!
    const last = merged[merged.length - 1]!
    if (cur.left <= last.right) {
      last.right = Math.max(last.right, cur.right)
    } else {
      merged.push({ left: cur.left, right: cur.right })
    }
  }
  return merged
}

export function drawAsciiBackground(
  scrollY: number,
  baseAlpha: number,
  tintColor: string,
  repulsors: BgRepulsor[] = [],
  occluders: BgOccluder[] = [],
  circleObstacles: BgCircleObstacle[] = [],
  carveCloudField = false,
  clipToGround = true,
  getCloudFieldBlockedIntervalsForBand?: (bandTop: number, bandBottom: number) => BgInterval[],
  sampleCloudFieldWarpPush?: (screenX: number, screenY: number) => { dx: number; dy: number; boost: number },
): void {
  if (bgCells.length === 0 || bgCols === 0) return
  ctx.save()
  ctx.font = bgFont
  ctx.textBaseline = 'top'
  ctx.fillStyle = tintColor
  const scrolledY = scrollY % bgCellH
  const maxY = clipToGround ? H * GROUND_Y_RATIO : H
  const hoverRadius = Math.max(95, Math.min(230, W * 0.2))
  const hoverPush = 8.5
  const hoverBoost = 0.42 + 0.14 * Math.sin(bgHoverPulse)
  const glowWidth = bgCellW * 1.0
  const textChars = skyTextStream

  const repulsorsByRow: BgRepulsor[][] = Array.from({ length: bgRows }, () => [])
  for (let i = 0; i < repulsors.length; i++) {
    const rep = repulsors[i]!
    const minRow = Math.max(0, Math.floor((rep.y - rep.radius + scrolledY) / bgCellH) - 1)
    const maxRow = Math.min(bgRows - 1, Math.ceil((rep.y + rep.radius + scrolledY) / bgCellH) + 1)
    for (let row = minRow; row <= maxRow; row++) {
      repulsorsByRow[row]!.push(rep)
    }
  }

  for (let row = 0; row < bgRows; row++) {
    const y = row * bgCellH - scrolledY
    if (y > maxY + bgCellH) continue
    const rowRepulsors = repulsorsByRow[row]!
    const bandTop = y
    const bandBottom = y + bgCellH
    const blocked: BgInterval[] = []

    for (let oi = 0; oi < occluders.length; oi++) {
      const o = occluders[oi]!
      if (bandBottom <= o.y || bandTop >= o.y + o.h) continue
      blocked.push({ left: o.x, right: o.x + o.w })
    }

    for (let ci = 0; ci < circleObstacles.length; ci++) {
      const co = circleObstacles[ci]!
      const interval = ellipseIntervalForBand(co.cx, co.cy, co.rx, co.ry, bandTop, bandBottom, co.hPad, co.vPad)
      if (interval !== null) blocked.push(interval)
    }

    if (carveCloudField && getCloudFieldBlockedIntervalsForBand) {
      const fieldBlocked = getCloudFieldBlockedIntervalsForBand(bandTop, bandBottom)
      for (let fi = 0; fi < fieldBlocked.length; fi++) blocked.push(fieldBlocked[fi]!)
    }

    const mergedBlocked = blocked.length > 1 ? mergeBlockedIntervals(blocked, 0, W) : blocked
    const slots = carveTextLineSlots({ left: 0, right: W }, mergedBlocked)
    if (slots.length === 0) continue

    let slotIndex = 0
    for (let col = 0; col < bgCols; col++) {
      const x = col * bgCellW
      const idx = row * bgCols + col
      if (idx >= bgCells.length) continue
      while (slotIndex < slots.length && x > slots[slotIndex]!.right) slotIndex++
      const slot = slots[slotIndex]
      if (!slot || x < slot.left || x > slot.right) continue

      const distLeft = x - slot.left
      const distRight = slot.right - x
      const edgeDist = Math.min(distLeft, distRight)
      const wrapT = Math.max(0, 1 - edgeDist / glowWidth)
      const cell = bgCells[idx]!
      const pulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(cell.phase))

      const dx = x - bgHoverX
      const dy = y - bgHoverY
      const dist = Math.hypot(dx, dy)
      const hoverT = Math.max(0, 1 - dist / hoverRadius)
      const push = hoverT * hoverPush
      const dirX = dist > 0.0001 ? dx / dist : 0
      const dirY = dist > 0.0001 ? dy / dist : -1
      const warp = bgHoverActive ? 1 : 0.42

      let objectPushX = 0
      let objectPushY = 0
      let objectBoost = 0
      for (let ri = 0; ri < rowRepulsors.length; ri++) {
        const rep = rowRepulsors[ri]!
        const odx = x - rep.x
        const ody = y - rep.y
        const od = Math.hypot(odx, ody)
        if (od >= rep.radius) continue
        const t = 1 - od / rep.radius
        const mag = t * t * rep.strength
        const oux = od > 0.0001 ? odx / od : (col % 2 === 0 ? 1 : -1)
        const ouy = od > 0.0001 ? ody / od : -1
        objectPushX += oux * mag
        objectPushY += ouy * mag
        objectBoost += t
      }

      if (carveCloudField && sampleCloudFieldWarpPush) {
        const cloudWarp = sampleCloudFieldWarpPush(x, y)
        objectPushX += cloudWarp.dx
        objectPushY += cloudWarp.dy
        objectBoost += cloudWarp.boost
      }

      const drawX = x + dirX * push * warp + objectPushX
      const drawY = y + dirY * push * warp + objectPushY
      const alpha = baseAlpha * pulse
        * (1.2 + hoverT * hoverBoost)
        * (1 + Math.min(0.35, objectBoost * 0.12))
        * (1 + wrapT * 0.55)
      if (alpha < 0.004) continue

      const charToUse = textChars.length > 0 ? textChars[idx % textChars.length]! : BG_CHARS[cell.charIndex!]
      ctx.globalAlpha = alpha
      ctx.fillText(charToUse, drawX, drawY)
    }
  }
  ctx.restore()
}
