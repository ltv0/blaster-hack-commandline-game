export type Player = {
  x: number
  y: number
  width: number
  height: number
  health: number
}

export type Umbrella = {
  x: number
  y: number
  width: number
  height: number
  dragging: boolean
}

export type Drop = {
  x: number
  y: number
  speed: number
  size: number
}