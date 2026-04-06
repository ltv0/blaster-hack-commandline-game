import type { AudioEvent } from '../game.ts'

let audioCtx: AudioContext | null = null

function getAudio(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext()
    } catch {
      return null
    }
  }
  return audioCtx
}

export function resumeAudio(): void {
  const a = getAudio()
  if (a && a.state === 'suspended') a.resume()
}

function playTone(freq: number, type: OscillatorType, gainVal: number, duration: number, startTime?: number): void {
  const a = getAudio()
  if (!a) return
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.connect(gain)
  gain.connect(a.destination)
  osc.type = type
  osc.frequency.value = freq
  const t = startTime ?? a.currentTime
  gain.gain.setValueAtTime(gainVal, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.start(t)
  osc.stop(t + duration + 0.01)
}

function playNoise(gainVal: number, duration: number, highpass = 800): void {
  const a = getAudio()
  if (!a) return
  const buf = a.createBuffer(1, a.sampleRate * duration, a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  const src = a.createBufferSource()
  src.buffer = buf
  const filter = a.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = highpass
  const gain = a.createGain()
  src.connect(filter)
  filter.connect(gain)
  gain.connect(a.destination)
  gain.gain.setValueAtTime(gainVal, a.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration)
  src.start()
  src.stop(a.currentTime + duration + 0.01)
}

export function handleAudioEvents(events: AudioEvent[]): void {
  const a = getAudio()
  if (!a) return
  for (const ev of events) {
    switch (ev.kind) {
      case 'block':
        if (ev.hazardType === 'hail') {
          playNoise(0.12, 0.08, 1200)
          playTone(220, 'square', 0.06, 0.06)
        } else if (ev.hazardType === 'snow') {
          playTone(880, 'sine', 0.04, 0.09)
        } else {
          playNoise(0.07, 0.05, 2000)
        }
        break
      case 'hit':
        playTone(110, 'sawtooth', 0.2, 0.15)
        playNoise(0.25, 0.12, 400)
        break
      case 'levelup': {
        const t = a.currentTime
        playTone(330, 'square', 0.1, 0.12, t)
        playTone(440, 'square', 0.1, 0.12, t + 0.12)
        playTone(550, 'square', 0.1, 0.18, t + 0.24)
        break
      }
      case 'death':
        playTone(220, 'sawtooth', 0.2, 0.4)
        playTone(110, 'sawtooth', 0.15, 0.6)
        playNoise(0.3, 0.5, 200)
        break
      case 'powerup': {
        const t = a.currentTime
        playTone(660, 'square', 0.08, 0.08, t)
        playTone(880, 'square', 0.08, 0.12, t + 0.09)
        playTone(990, 'triangle', 0.06, 0.18, t + 0.2)
        break
      }
    }
  }
}
