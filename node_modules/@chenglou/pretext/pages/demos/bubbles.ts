import { prepareWithSegments, walkLineRanges, type PreparedTextWithSegments } from '../../src/layout.ts'

function layoutShrinkwrap(prepared: PreparedTextWithSegments, maxWidth: number, lineHeight: number): { lineCount: number, height: number, maxLineWidth: number } {
  let maxLineWidth = 0
  const lineCount = walkLineRanges(prepared, maxWidth, line => {
    if (line.width > maxLineWidth) maxLineWidth = line.width
  })
  return { lineCount, height: lineCount * lineHeight, maxLineWidth }
}

const FONT = '15px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
const LINE_HEIGHT = 20
const PADDING_H = 12
const BUBBLE_MAX_RATIO = 0.8

const messages: { text: string, sent: boolean }[] = [
  { text: "The performance improvements are greaaaaaaaaaaaaaaaaaaaatttttttt.", sent: false },
  { text: "성능 최적화가 रिव्यू करते ह정말 많이되었더라고요. byyyyyyyeeeeeeeeeeeeeeeeeeee 🎉 👍", sent: true },

]

type BubbleState = {
  prepared: PreparedTextWithSegments
  shrinkDiv: HTMLDivElement
  cssDiv: HTMLDivElement
}

const chatShrink = document.getElementById('chat-shrink')!
const chatCss = document.getElementById('chat-css')!
const slider = document.getElementById('slider') as HTMLInputElement
const valLabel = document.getElementById('val')!

const bubbles: BubbleState[] = []

for (let i = 0; i < messages.length; i++) {
  const m = messages[i]!
  const prepared = prepareWithSegments(m.text, FONT)

  const shrinkDiv = document.createElement('div')
  shrinkDiv.className = `msg ${m.sent ? 'sent' : 'recv'}`
  shrinkDiv.style.font = FONT
  shrinkDiv.style.lineHeight = `${LINE_HEIGHT}px`
  shrinkDiv.textContent = m.text
  chatShrink.appendChild(shrinkDiv)

  const cssDiv = document.createElement('div')
  cssDiv.className = `msg ${m.sent ? 'sent' : 'recv'}`
  cssDiv.style.font = FONT
  cssDiv.style.lineHeight = `${LINE_HEIGHT}px`
  cssDiv.textContent = m.text
  chatCss.appendChild(cssDiv)

  bubbles.push({ prepared, shrinkDiv, cssDiv })
}

function updateBubbles(chatWidth: number) {
  chatShrink.style.width = `${chatWidth}px`
  chatCss.style.width = `${chatWidth}px`

  const bubbleMaxWidth = Math.floor(chatWidth * BUBBLE_MAX_RATIO)
  const contentMaxWidth = bubbleMaxWidth - PADDING_H * 2

  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i]!

    // Shrinkwrap: compute tightest width
    const result = layoutShrinkwrap(b.prepared, contentMaxWidth, LINE_HEIGHT)
    const shrinkWidth = Math.ceil(result.maxLineWidth) + PADDING_H * 2
    b.shrinkDiv.style.maxWidth = `${bubbleMaxWidth}px`
    b.shrinkDiv.style.width = `${shrinkWidth}px`

    // CSS: just max-width + fit-content (best CSS can do)
    b.cssDiv.style.maxWidth = `${bubbleMaxWidth}px`
  }
}

function setWidth(w: number) {
  slider.value = String(w)
  valLabel.textContent = `${w}px`
  updateBubbles(w)
}

slider.addEventListener('input', () => {
  animating = false
  setWidth(parseInt(slider.value))
})

const controlsEl = document.querySelector<HTMLDivElement>('.controls')!
controlsEl.addEventListener('mousemove', (e) => {
  animating = false
  const sliderRect = slider.getBoundingClientRect()
  const ratio = (e.clientX - sliderRect.left) / sliderRect.width
  const min = parseInt(slider.min)
  const max = parseInt(slider.max)
  const w = Math.round(min + (max - min) * Math.max(0, Math.min(1, ratio)))
  setWidth(w)
})

let animating = true

function animate(t: number) {
  if (animating) {
    const min = parseInt(slider.min)
    const max = parseInt(slider.max)
    const range = max - min
    const w = Math.round(min + range * (0.5 + 0.5 * Math.sin(t / 2000)))
    setWidth(w)
  }
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)

controlsEl.addEventListener('mouseleave', () => { animating = true })

setWidth(400)
