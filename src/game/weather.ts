import type { Drop } from './entities'

export function spawnRain(count: number, width: number): Drop[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * -400,
    speed: 180 + Math.random() * 180,
    size: 8 + Math.random() * 8,
  }))
}

export function updateRain(drops: Drop[], dt: number, width: number, height: number) {
  for (const drop of drops) {
    drop.y += drop.speed * dt

    if (drop.y > height + 20) {
      drop.y = -20
      drop.x = Math.random() * width
    }
  }
}