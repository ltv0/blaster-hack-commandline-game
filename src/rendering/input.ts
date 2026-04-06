import type { GameState } from '../game.ts'
import { canvas } from './canvas.ts'
import { resumeAudio } from './audio.ts'
import { handleKeyDown, handleKeyUp, handlePointerMove, handlePointerDown, handlePointerUp } from '../game.ts'
import { setBackgroundHoverTarget, clearBackgroundHover } from './background.ts'

export function bindEvents(state: GameState, onResize: () => void): void {
  window.addEventListener('resize', () => {
    onResize()
  })

  window.addEventListener('keydown', (e) => {
    resumeAudio()
    handleKeyDown(state, e.key)
  })

  window.addEventListener('keyup', (e) => {
    handleKeyUp(state, e.key)
  })

  function canvasPos(e: MouseEvent | Touch): { x: number; y: number } {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  canvas.addEventListener('mousemove', (e) => {
    const p = canvasPos(e)
    setBackgroundHoverTarget(p.x, p.y)
    handlePointerMove(state, p.x, p.y)
  })

  canvas.addEventListener('mouseenter', (e) => {
    const p = canvasPos(e)
    setBackgroundHoverTarget(p.x, p.y)
  })

  canvas.addEventListener('mouseleave', () => {
    clearBackgroundHover()
  })

  canvas.addEventListener('mousedown', (e) => {
    resumeAudio()
    const p = canvasPos(e)
    handlePointerDown(state, p.x, p.y)
  })

  window.addEventListener('mouseup', () => handlePointerUp(state))

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault()
    const p = canvasPos(e.touches[0])
    setBackgroundHoverTarget(p.x, p.y)
    handlePointerMove(state, p.x, p.y)
  }, { passive: false })

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault()
    resumeAudio()
    const p = canvasPos(e.touches[0])
    setBackgroundHoverTarget(p.x, p.y)
    handlePointerDown(state, p.x, p.y)
  }, { passive: false })

  window.addEventListener('touchend', () => {
    clearBackgroundHover()
    handlePointerUp(state)
  })
}
