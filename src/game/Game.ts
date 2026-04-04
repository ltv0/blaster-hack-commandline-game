import { PretextRenderer } from '../pretext-renderer'
import { setupUmbrellaDrag } from './input'
import { spawnRain, updateRain } from './weather'
import type { Player, Umbrella, RainParticle } from './entities'
import { TerminalInput } from '../ui/terminal'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  char: string
}

export function startGameApp() {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const ctx = canvas.getContext('2d')!
  const terminalRoot = document.querySelector<HTMLDivElement>('#terminal')!

  // ===== PREPARE PHASE =====
  // Use PretextRenderer like Pretext Breaker for consistent text rendering
  const renderer = new PretextRenderer()

  const FONT_GAME = '16px monospace'
  const FONT_HUD = '14px monospace'

  // Prepare all game text blocks once at startup (like Pretext Breaker)
  const cloudBlock = renderer.getBlock('☁ cloud ☁', FONT_GAME, 18, 200)
  const runnerBlock = renderer.getBlock(`  O
 /|\\
 / \\`, FONT_GAME, 18)
  const umbrellaBlock = renderer.getBlock(`  _
 / \\
|   |
 \\ /
  |`, FONT_GAME, 18)
  const groundBlock = renderer.getBlock('________________________________________________________________________________', FONT_GAME, 18)
  const titleBlock = renderer.getBlock('━ UMBRELLA RUN ━', FONT_GAME, 18)

  // Prepare rain char blocks (not used anymore, but keep for now)
  const rainChars = '+=vnnoo00FFYLZhP88JabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()'

  // ===== GAME STATE =====
  let started = false
  let score = 0
  let lastTime = 0
  const particles: Particle[] = []

  const player: Player = {
    x: 760,
    y: 400,
    width: runnerBlock.width,
    height: runnerBlock.height,
    health: 100,
  }

  const umbrella: Umbrella = {
    x: 700,
    y: 340,
    width: umbrellaBlock.width,
    height: umbrellaBlock.height,
    dragging: false,
  }

  setupUmbrellaDrag(canvas, umbrella)

  const terminal = new TerminalInput(terminalRoot, (command: string) => {
    if (command === 'run' || command === 'start') {
      started = true
      player.health = 100
      score = 0
      particles.length = 0
      terminal.print('> run started')
      terminal.print('> protect the runner from rain')
      return
    }

    if (command === 'help') {
      terminal.print('> commands: run, start, help, clear')
      return
    }

    if (command === 'clear') {
      terminal.clear()
      terminal.print('> terminal cleared')
      return
    }

    if (command.length > 0) {
      terminal.print(`> unknown command: ${command}`)
    }
  })

  terminal.attach()

  // ===== COLLISION & UPDATE =====

  function spawnParticles(x: number, y: number, char: string, count: number) {
    const chars = char.split('')
    for (let i = 0; i < count; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() - 0.5) * 200 - 50,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 0.5 + Math.random() * 0.5,
        char: chars[Math.floor(Math.random() * chars.length)],
      })
    }
  }

  function updateParticles(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 150 * dt
      p.life -= dt

      if (p.life <= 0) {
        particles.splice(i, 1)
      }
    }
  }

  function update(dt: number) {
    if (!started || player.health <= 0) return

    score += dt * 10
    player.x -= 12 * dt
    if (player.x < 120) player.x = 760

    updateParticles(dt)
  }

  // ===== RENDER PHASE =====
  // Use PretextRenderer.drawBlock() like Pretext Breaker

  function draw() {
    // Clear
    ctx.fillStyle = '#2f3542'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Title
    renderer.drawBlock(ctx, titleBlock, 300, 15, {
      color: '#86efac',
    })

    // Clouds (animated)
    const cloudOffset = Math.sin(Date.now() * 0.001) * 10
    renderer.drawBlock(ctx, cloudBlock, 80 + cloudOffset, 40, {
      color: '#9ca3af',
    })
    renderer.drawBlock(ctx, cloudBlock, 300 - cloudOffset * 0.7, 60, {
      color: '#9ca3af',
    })
    renderer.drawBlock(ctx, cloudBlock, 550 + cloudOffset * 0.5, 45, {
      color: '#9ca3af',
    })

    // Rain ASCII grid
    const time = Date.now() * 0.001
    const rainFonts = ['16px Georgia', 'bold 16px Georgia', 'italic 16px Georgia', 'bold italic 16px Georgia']
    for (let y = 0; y < canvas.height; y += 36) {
      for (let x = 0; x < canvas.width; x += 32) {
        const noise = (Math.sin(time + x * 0.01) + Math.cos(time * 0.7 + y * 0.02) + Math.sin(time * 0.3 + x * 0.005 + y * 0.01)) * 0.33 + 0.5
        const charIndex = Math.floor(Math.max(0, Math.min(rainChars.length - 1, noise * rainChars.length)))
        const char = rainChars[charIndex]
        const fontIndex = (x * 31 + y * 37 + Math.floor(time * 10)) % rainFonts.length
        const font = rainFonts[fontIndex]
        ctx.font = font
        ctx.fillStyle = '#ff4757'
        ctx.fillText(char, x, y)
      }
    }

    // Ground
    renderer.drawBlock(ctx, groundBlock, 0, canvas.height - groundBlock.height, {
      color: '#4a5568',
    })

    // Player
    if (player.health > 0) {
      const healthPercent = Math.max(0, player.health / 100)
      const playerColor = healthPercent > 0.5 ? '#facc15' : healthPercent > 0.2 ? '#f59e0b' : '#f87171'

      renderer.drawBlock(ctx, runnerBlock, player.x, player.y, {
        color: playerColor,
      })

      // Health bar
      const barLength = 10
      const filledLength = Math.ceil(barLength * healthPercent)
      const healthBar = '[' + '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength) + ']'
      const healthBarBlock = renderer.getBlock(healthBar, '11px monospace', 12)
      renderer.drawBlock(ctx, healthBarBlock, player.x, player.y - 25, {
        color: playerColor,
      })
    }

    // Umbrella
    const umbrellaColor = umbrella.dragging ? '#fbbf24' : '#f87171'
    renderer.drawBlock(ctx, umbrellaBlock, umbrella.x, umbrella.y, {
      color: umbrellaColor,
    })

    // Particles
    for (const p of particles) {
      const alpha = p.life / p.maxLife
      ctx.globalAlpha = alpha
      const particleBlock = renderer.getBlock(p.char, '12px monospace', 12)
      renderer.drawBlock(ctx, particleBlock, p.x, p.y, {
        color: '#7dd3fc',
      })
      ctx.globalAlpha = 1
    }

    // HUD
    const scoreText = `SCORE: ${Math.floor(score).toString().padEnd(7, ' ')}`
    const healthText = `HEALTH: ${Math.max(0, Math.floor(player.health)).toString().padEnd(3, ' ')}%`

    const scoreDisplayBlock = renderer.getBlock(scoreText, FONT_HUD, 16)
    const healthDisplayBlock = renderer.getBlock(healthText, FONT_HUD, 16)

    renderer.drawBlock(ctx, scoreDisplayBlock, canvas.width - 250, 20, {
      color: '#00ff9c',
    })

    renderer.drawBlock(ctx, healthDisplayBlock, canvas.width - 250, 45, {
      color: player.health > 50 ? '#00ff9c' : player.health > 20 ? '#f59e0b' : '#f87171',
    })

    // Game Over
    if (player.health <= 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const gameOverText = `GAME OVER - Final Score: ${Math.floor(score)}`
      const gameOverDisplayBlock = renderer.getBlock(gameOverText, FONT_GAME, 18)

      renderer.drawBlock(ctx, gameOverDisplayBlock, canvas.width / 2 - gameOverDisplayBlock.width / 2, canvas.height / 2 - 20, {
        color: '#f87171',
      })

      const restartBlock = renderer.getBlock('[Type "run" to restart]', '12px monospace', 14)
      renderer.drawBlock(ctx, restartBlock, canvas.width / 2 - restartBlock.width / 2, canvas.height / 2 + 40, {
        color: '#d1fae5',
      })
    }
  }

  function loop(timestamp: number) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.033)
    lastTime = timestamp

    update(dt)
    draw()
    requestAnimationFrame(loop)
  }

  requestAnimationFrame(loop)
}