import type { GameState } from '../game.ts'

let overlay: HTMLDivElement | null = null
let rangeEl: HTMLInputElement | null = null
let valueEl: HTMLElement | null = null
let stateRef: GameState | null = null
const SETTINGS_KEY = 'bgTextOpacity'

export function initSettings(state: GameState): void {
  stateRef = state
  overlay = document.getElementById('settings-overlay') as HTMLDivElement | null
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'settings-overlay'
    overlay.style.display = 'none'
    overlay.innerHTML = `
      <div class="settings-panel">
        <div class="settings-title">Settings</div>
        <label class="settings-label">Background text opacity: <span id="bg-opacity-value"></span></label>
        <input id="bg-opacity-range" type="range" min="0" max="100" step="1" />
        <div class="settings-note">Use the Settings button below the terminal to open this panel.</div>
      </div>
    `
    document.body.appendChild(overlay)
  }

  rangeEl = overlay.querySelector('#bg-opacity-range') as HTMLInputElement | null
  valueEl = overlay.querySelector('#bg-opacity-value') as HTMLElement | null

  const stored = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem(SETTINGS_KEY) : null
  const initial = stored ? Number(stored) : (stateRef?.backgroundTextOpacity ?? 1.0)
  if (stateRef) stateRef.backgroundTextOpacity = isFinite(initial) ? initial : 1.0

  if (rangeEl && stateRef) {
    const state = stateRef
    rangeEl.value = String(Math.round(state.backgroundTextOpacity * 100))
    rangeEl.addEventListener('input', (ev) => {
      const v = Number((ev.target as HTMLInputElement).value) / 100
      state.backgroundTextOpacity = isFinite(v) ? v : 1.0
      if (valueEl) valueEl.textContent = `${Math.round(state.backgroundTextOpacity * 100)}%`
      try { window.localStorage.setItem(SETTINGS_KEY, String(state.backgroundTextOpacity)) } catch {}
    })
  }
  if (valueEl && stateRef) {
    const state = stateRef
    valueEl.textContent = `${Math.round(state.backgroundTextOpacity * 100)}%`
  }

  // Toggle with S
  window.addEventListener('keydown', (e) => {
    if (e.key === 's' || e.key === 'S') toggleSettingsAt()
  })

  // Close when clicking/tapping outside the overlay
  document.addEventListener('pointerdown', (ev) => {
    try {
      if (!overlay || overlay.style.display !== 'block') return
      const target = ev.target as Node
      if (overlay.contains(target)) return
      // clicked outside -> close
      closeSettings()
    } catch {}
  }, { passive: true })
}

export function openSettingsAt(pageTop?: number): void {
  if (!overlay) return
  overlay.style.display = 'block'
  if (typeof pageTop === 'number') overlay.style.top = `${pageTop}px`
  else overlay.style.top = ''
  const r = overlay.querySelector('#bg-opacity-range') as HTMLInputElement | null
  if (r) r.focus()
}

export function toggleSettingsAt(pageTop?: number): void {
  if (!overlay) return
  const isOpen = overlay.style.display === 'block'
  if (isOpen) closeSettings()
  else openSettingsAt(pageTop)
}

export function closeSettings(): void {
  if (!overlay) return
  overlay.style.display = 'none'
}

export function isSettingsOpen(): boolean {
  return !!(overlay && overlay.style.display === 'block')
}

export default {
  initSettings,
  openSettingsAt,
  toggleSettingsAt,
  closeSettings,
  isSettingsOpen,
}
