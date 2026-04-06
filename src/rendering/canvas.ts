import { PretextRenderer } from '../pretext-renderer.ts'

export const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
export const ctx = canvas.getContext('2d')!
export const renderer = new PretextRenderer()

export let dpr = window.devicePixelRatio || 1
export let W = 0
export let H = 0

const FONT_FAMILY = '"IBM Plex Mono", monospace'

export function fnt(size: number, weight: number = 400): string {
  return `${weight} ${size}px ${FONT_FAMILY}`
}

export function sz(base: number, minV: number, maxV: number): number {
  return Math.max(minV, Math.min(maxV, base))
}

export function setViewportSize(width: number, height: number): void {
  W = width
  H = height
}
