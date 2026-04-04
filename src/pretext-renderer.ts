/**
 * TextBlock represents a prepared text block ready for rendering.
 */
export interface TextBlock {
  text: string
  width: number
  height: number
  font: string
  lineHeight: number
}

/**
 * PretextRenderer - Simple text renderer for consistent text rendering.
 */
export class PretextRenderer {
  private blockCache = new Map<string, TextBlock>()

  /**
   * Get a prepared text block.
   */
  getBlock(
    text: string,
    font: string,
    lineHeight: number,
    maxWidth?: number
  ): TextBlock {
    const key = `${text}::${font}::${lineHeight}::${maxWidth || 'auto'}`
    
    if (!this.blockCache.has(key)) {
      // Simple measurement using canvas
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      ctx.font = font
      
      const lines = text.split('\n')
      const widths = lines.map(line => ctx.measureText(line).width)
      const width = maxWidth ? Math.min(maxWidth, Math.max(...widths)) : Math.max(...widths)
      const height = lines.length * lineHeight
      
      const block: TextBlock = {
        text,
        width,
        height,
        font,
        lineHeight,
      }
      
      this.blockCache.set(key, block)
    }
    
    return this.blockCache.get(key)!
  }

  /**
   * Draw a text block to canvas.
   */
  drawBlock(
    ctx: CanvasRenderingContext2D,
    block: TextBlock,
    x: number,
    y: number,
    options: {
      color?: string
      align?: 'left' | 'center' | 'right'
      verticalAlign?: 'top' | 'middle' | 'bottom'
      alpha?: number
    } = {}
  ): void {
    const {
      color = '#d1fae5',
      align = 'left',
      verticalAlign = 'top',
      alpha = 1,
    } = options

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.font = block.font
    ctx.textAlign = align
    ctx.textBaseline = verticalAlign === 'top' ? 'top' : verticalAlign === 'middle' ? 'middle' : 'bottom'

    const lines = block.text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const lineY = y + i * block.lineHeight
      ctx.fillText(lines[i], x, lineY)
    }
    ctx.restore()
  }
}

