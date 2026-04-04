import type { Umbrella } from './entities'

export function setupUmbrellaDrag(canvas: HTMLCanvasElement, umbrella: Umbrella) {
  const getMouse = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  canvas.addEventListener('mousemove', (event) => {
    const mouse = getMouse(event)
    umbrella.x = mouse.x - umbrella.width / 2
    umbrella.y = mouse.y - umbrella.height / 2
  })
}