import type { RainParticle } from './entities'

export function spawnRain(count: number, width: number): RainParticle[] {
  const chars = '+=vnnoo00FFYLZhP88J'.split('')
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * -400,
    vx: (Math.random() - 0.5) * 50,
    vy: 200 + Math.random() * 200,
    char: chars[Math.floor(Math.random() * chars.length)],
  }))
}

export function updateRain(particles: RainParticle[], dt: number, width: number, height: number) {
  for (const p of particles) {
    // Add some turbulence
    p.vx += (Math.random() - 0.5) * 20 * dt
    p.vy += (Math.random() - 0.5) * 10 * dt
    p.vx *= 0.99 // dampen
    p.vy *= 0.99

    p.x += p.vx * dt
    p.y += p.vy * dt

    // Wrap around or reset
    if (p.y > height + 20 || p.x < -20 || p.x > width + 20) {
      p.y = -20
      p.x = Math.random() * width
      p.vx = (Math.random() - 0.5) * 50
      p.vy = 200 + Math.random() * 200
    }
  }
}