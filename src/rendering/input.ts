import type { GameState } from '../game.ts'
import { canvas, sz } from './canvas.ts'
import { openSettingsAt } from '../ui/settings.ts'
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
    // If on boot screen, check for Settings button click (drawn in drawBoot)
    if (state.phase === 'boot') {
      const cx = state.W / 2;
      const lh = sz(state.H / 24, 20, 28);
      const size = sz(state.W / 60, 11, 15);
      const startY = state.H * 0.18;
      const panelW = Math.min(640, state.W - 48);
      const panelX = Math.round(cx - panelW / 2);
      const panelY = startY - lh * 2.8;
      const headerH = lh * 1.4;
      const maxVisibleLines = 5;
      const visibleLineCount = Math.max(1, Math.min(state.bootLines.length, maxVisibleLines));
      const panelH = headerH + lh * (visibleLineCount + 0.8);

      const btnH = Math.max(28, Math.round(lh * 1.2));
      const btnW = Math.min(220, Math.round(panelW * 0.42));
      const gap = 12;
      const totalW = btnW * 2 + gap;
      const leftX = Math.round(cx - totalW / 2);
      const cosmeticsX = leftX;
      const settingsX = leftX + btnW + gap;
      const btnY = Math.round(panelY + panelH + 14);

      // Cosmetics button
      if (p.x >= cosmeticsX && p.x <= cosmeticsX + btnW && p.y >= btnY && p.y <= btnY + btnH) {
        // Use existing keyboard path for cosmetics to keep behavior consistent
        handleKeyDown(state, 'c');
        // prevent document-level outside-click handler from immediately closing overlay
        e.stopPropagation();
        return;
      }

      // Settings button
      if (p.x >= settingsX && p.x <= settingsX + btnW && p.y >= btnY && p.y <= btnY + btnH) {
        const rect = canvas.getBoundingClientRect();
        const pageTop = Math.round(rect.top + btnY + btnH + 8);
        openSettingsAt(pageTop);
        e.stopPropagation();
        return;
      }
    }

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
