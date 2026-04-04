import {
  layout,
  layoutWithLines,
  prepare,
  prepareWithSegments,
  walkLineRanges,
  type PreparedText,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'

const UNBOUNDED_WIDTH = 100_000

export type WhiteSpaceMode = 'normal' | 'pre-wrap'

export type TextBlock = {
  text: string
  font: string
  lineHeight: number
  maxWidth: number
  lineCount: number
  width: number
  height: number
  prepared: PreparedTextWithSegments
  lines: Array<{
    text: string
    width: number
  }>
}

type DrawOptions = {
  alpha?: number
  align?: 'left' | 'center' | 'right'
  color?: string
  shadowBlur?: number
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  strokeColor?: string
  strokeWidth?: number
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

export class PretextRenderer {
  private readonly preparedCache = new Map<string, PreparedText>()
  private readonly preparedSegmentCache = new Map<string, PreparedTextWithSegments>()
  private readonly blockCache = new Map<string, TextBlock>()
  private readonly heightCache = new Map<string, number>()

  measureParagraphHeight(
    text: string,
    font: string,
    lineHeight: number,
    maxWidth: number,
    whiteSpace: WhiteSpaceMode = 'normal',
  ): number {
    const key = `h::${font}::${lineHeight}::${maxWidth}::${whiteSpace}::${text}`
    const cached = this.heightCache.get(key)
    if (cached !== undefined) return cached

    const prepared = this.getPrepared(text, font, whiteSpace)
    const measured = layout(prepared, maxWidth, lineHeight).height
    this.heightCache.set(key, measured)
    return measured
  }

  measureMaxLineWidth(
    text: string,
    font: string,
    maxWidth = UNBOUNDED_WIDTH,
    whiteSpace: WhiteSpaceMode = 'pre-wrap',
  ): number {
    const prepared = this.getPreparedSegments(text, font, whiteSpace)
    let maxLineWidth = 0
    walkLineRanges(prepared, maxWidth, line => {
      if (line.width > maxLineWidth) maxLineWidth = line.width
    })
    return maxLineWidth
  }

  getBlock(
    text: string,
    font: string,
    lineHeight: number,
    maxWidth = UNBOUNDED_WIDTH,
    whiteSpace: WhiteSpaceMode = 'pre-wrap',
  ): TextBlock {
    const key = `b::${font}::${lineHeight}::${maxWidth}::${whiteSpace}::${text}`
    const cached = this.blockCache.get(key)
    if (cached !== undefined) return cached

    const prepared = this.getPreparedSegments(text, font, whiteSpace)
    const laidOut = layoutWithLines(prepared, maxWidth, lineHeight)
    const width = laidOut.lines.reduce((largest, line) => Math.max(largest, line.width), 0)
    const block: TextBlock = {
      text,
      font,
      lineHeight,
      maxWidth,
      lineCount: laidOut.lineCount,
      width,
      height: laidOut.height,
      prepared,
      lines: laidOut.lines.map(line => ({
        text: line.text,
        width: line.width,
      })),
    }

    this.blockCache.set(key, block)
    return block
  }

  drawBlock(
    context: CanvasRenderingContext2D,
    block: TextBlock,
    x: number,
    y: number,
    options: DrawOptions = {},
  ): void {
    const align = options.align ?? 'left'
    const verticalAlign = options.verticalAlign ?? 'top'
    const originY =
      verticalAlign === 'middle'
        ? y - block.height / 2
        : verticalAlign === 'bottom'
          ? y - block.height
          : y

    context.save()
    context.font = block.font
    context.textBaseline = 'top'
    context.globalAlpha = options.alpha ?? 1
    context.fillStyle = options.color ?? '#f6f2df'
    context.shadowColor = options.shadowColor ?? 'transparent'
    context.shadowBlur = options.shadowBlur ?? 0
    context.shadowOffsetX = options.shadowOffsetX ?? 0
    context.shadowOffsetY = options.shadowOffsetY ?? 0
    if (options.strokeColor !== undefined) {
      context.strokeStyle = options.strokeColor
      context.lineWidth = options.strokeWidth ?? 1
      context.lineJoin = 'round'
    }

    for (let index = 0; index < block.lines.length; index++) {
      const line = block.lines[index]!
      const drawX =
        align === 'center'
          ? x - line.width / 2
          : align === 'right'
            ? x - line.width
            : x
      const drawY = originY + index * block.lineHeight
      if (options.strokeColor !== undefined) context.strokeText(line.text, drawX, drawY)
      context.fillText(line.text, drawX, drawY)
    }

    context.restore()
  }

  /**
   * Draw a one-off text string without caching a block.
   * Use getBlock/drawBlock for anything drawn frequently.
   */
  drawText(
    context: CanvasRenderingContext2D,
    text: string,
    font: string,
    lineHeight: number,
    x: number,
    y: number,
    options: DrawOptions = {},
    maxWidth = UNBOUNDED_WIDTH,
    whiteSpace: WhiteSpaceMode = 'pre-wrap',
  ): TextBlock {
    const block = this.getBlock(text, font, lineHeight, maxWidth, whiteSpace)
    this.drawBlock(context, block, x, y, options)
    return block
  }

  /**
   * Measure just the pixel width of a single-line string.
   */
  measureWidth(text: string, font: string): number {
    return this.measureMaxLineWidth(text, font, UNBOUNDED_WIDTH, 'pre-wrap')
  }

  /**
   * Fill a horizontal rule across `width` pixels using a repeated character,
   * measured accurately with pretext so it tiles perfectly.
   */
  drawHRule(
    context: CanvasRenderingContext2D,
    char: string,
    font: string,
    lineHeight: number,
    x: number,
    y: number,
    width: number,
    options: DrawOptions = {},
  ): void {
    const charWidth = this.measureWidth(char, font)
    if (charWidth <= 0) return
    const count = Math.max(1, Math.floor(width / charWidth))
    const repeated = char.repeat(count)
    const block = this.getBlock(repeated, font, lineHeight, UNBOUNDED_WIDTH, 'pre-wrap')
    this.drawBlock(context, block, x, y, options)
  }

  /**
   * Draw a Unicode box-drawing border around a rect.
   */
  drawGlyphBox(
    context: CanvasRenderingContext2D,
    font: string,
    lineHeight: number,
    x: number,
    y: number,
    w: number,
    h: number,
    options: DrawOptions = {},
  ): void {
    const charW = this.measureWidth('\u2500', font)
    if (charW <= 0) return
    const cols = Math.max(2, Math.floor(w / charW))
    const rows = Math.max(2, Math.floor(h / lineHeight))

    const top    = '\u250c' + '\u2500'.repeat(cols - 2) + '\u2510'
    const bottom = '\u2514' + '\u2500'.repeat(cols - 2) + '\u2518'
    const side   = '\u2502'

    const topBlock    = this.getBlock(top, font, lineHeight)
    const bottomBlock = this.getBlock(bottom, font, lineHeight)
    const sideBlock   = this.getBlock(side, font, lineHeight)

    this.drawBlock(context, topBlock, x, y, options)
    this.drawBlock(context, bottomBlock, x, y + (rows - 1) * lineHeight, options)

    for (let r = 1; r < rows - 1; r++) {
      this.drawBlock(context, sideBlock, x, y + r * lineHeight, options)
      this.drawBlock(context, sideBlock, x + (cols - 1) * charW, y + r * lineHeight, options)
    }
  }

  private getPrepared(text: string, font: string, whiteSpace: WhiteSpaceMode): PreparedText {
    const key = `p::${font}::${whiteSpace}::${text}`
    const cached = this.preparedCache.get(key)
    if (cached !== undefined) return cached

    const prepared = prepare(text, font, { whiteSpace })
    this.preparedCache.set(key, prepared)
    return prepared
  }

  private getPreparedSegments(
    text: string,
    font: string,
    whiteSpace: WhiteSpaceMode,
  ): PreparedTextWithSegments {
    const key = `s::${font}::${whiteSpace}::${text}`
    const cached = this.preparedSegmentCache.get(key)
    if (cached !== undefined) return cached

    const prepared = prepareWithSegments(text, font, { whiteSpace })
    this.preparedSegmentCache.set(key, prepared)
    return prepared
  }
}
