import type { Drop, Player, Umbrella } from './entities'
import { setupUmbrellaDrag } from './input'
import { spawnRain, updateRain } from './weather'

export function startGameApp(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!

  // Game state
  let started = false
  let score = 0
  let lastTime = 0
  let drop = 0.5

  const player: Player = {
    x: canvas.width / 2 - 8,
    y: canvas.height - 100,
    width: 28,
    height: 30,
    health: 100,
  }

  const umbrella: Umbrella = {
    x: canvas.width / 2 - 40,
    y: canvas.height / 2 - 40,
    width: 80,
    height: 60,
    dragging: false,
  }

  let raindrops: Drop[] = spawnRain(20, canvas.width)

  // Set up input
  setupUmbrellaDrag(canvas, umbrella)

  // Keyboard start
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !started) {
      started = true
      player.health = 100
      score = 0
    }
    if (event.key === 'r' && player.health <= 0) {
      started = true
      player.health = 100
      score = 0
      raindrops = spawnRain(20, canvas.width)
    }
  })

  function drawClouds() {
    ctx.fillStyle = '#4b5563'
    ctx.beginPath()
    ctx.arc(100, 60, 40, 0, Math.PI * 2)
    ctx.arc(150, 40, 50, 0, Math.PI * 2)
    ctx.arc(200, 60, 40, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.arc(canvas.width - 150, 80, 40, 0, Math.PI * 2)
    ctx.arc(canvas.width - 100, 60, 50, 0, Math.PI * 2)
    ctx.arc(canvas.width - 50, 80, 40, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawRain() {
    ctx.fillStyle = '#60a5fa'
    for (const drop of raindrops) {
      ctx.fillRect(drop.x, drop.y, drop.size / 4, drop.size)
    }
  }

  function update(dt: number) {
    if (!started) return

    // Update rain
    updateRain(raindrops, dt, canvas.width, canvas.height)

    // Score increases
    score += dt * 10

    // Increase difficulty
    drop = Math.min(0.5 + score / 500, 2)

    // Spawn new rain drops
    if (Math.random() < drop * dt) {
      raindrops.push({
        x: Math.random() * canvas.width,
        y: -20,
        speed: 180 + Math.random() * 180,
        size: 8 + Math.random() * 8,
      })
    }

    // Check collisions with umbrella
    for (let i = raindrops.length - 1; i >= 0; i--) {
      const drop = raindrops[i]
      const hitUmbrella =
        drop.x >= umbrella.x &&
        drop.x <= umbrella.x + umbrella.width &&
        drop.y >= umbrella.y &&
        drop.y <= umbrella.y + umbrella.height

      if (hitUmbrella) {
        raindrops.splice(i, 1)
        continue
      }

      // Check collision with player
      const hitPlayer =
        drop.x >= player.x &&
        drop.x <= player.x + player.width &&
        drop.y >= player.y &&
        drop.y <= player.y + player.height

      if (hitPlayer) {
        player.health -= 10 * dt
        raindrops.splice(i, 1)
      }
    }
  }

  function drawGround() {
    ctx.fillStyle = '#1f3b2d'
    ctx.fillRect(0, 450, canvas.width, 90)

    ctx.fillStyle = '#2f855a'
    for (let i = 0; i < canvas.width; i += 80) {
      ctx.fillRect((i - (score * 4) % 80), 430, 40, 20)
    }
  }

  function drawPlayer() {
    ctx.fillStyle = '#f5d08a'
    ctx.fillRect(player.x + 8, player.y, 12, 12)

    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(player.x + 8, player.y + 12, 12, 18)

    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(player.x + 12, player.y + 30)
    ctx.lineTo(player.x + 6, player.y + 42)
    ctx.moveTo(player.x + 16, player.y + 30)
    ctx.lineTo(player.x + 22, player.y + 42)
    ctx.stroke()
  }

  function drawUmbrella() {
    ctx.fillStyle = '#f87171'
    ctx.beginPath()
    ctx.moveTo(umbrella.x, umbrella.y + umbrella.height)
    ctx.quadraticCurveTo(
      umbrella.x + umbrella.width / 2,
      umbrella.y - 28,
      umbrella.x + umbrella.width,
      umbrella.y + umbrella.height,
    )
    ctx.fill()

    ctx.strokeStyle = '#f3f4f6'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(umbrella.x + umbrella.width / 2, umbrella.y)
    ctx.lineTo(umbrella.x + umbrella.width / 2, umbrella.y + 60)
    ctx.stroke()
  }

  function drawHud() {
    ctx.fillStyle = '#00ff9c'
    ctx.font = '16px monospace'
    ctx.fillText(`score: ${Math.floor(score)}`, 20, 24)
    ctx.fillText(`health: ${Math.max(0, Math.floor(player.health))}`, 20, 46)

    if (!started) {
      ctx.fillText('press ENTER to start', 360, 260)
    }

    if (player.health <= 0) {
      ctx.fillText('game over', 430, 260)
    }
  }

  function draw() {
    ctx.fillStyle = '#0a0f0d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    drawClouds()
    drawRain()
    drawGround()
    drawPlayer()
    drawUmbrella()
    drawHud()
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