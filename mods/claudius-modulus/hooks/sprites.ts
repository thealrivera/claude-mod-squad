import type { ForecastState } from './logic'

// How well the session is pacing toward using every token, in five levels. The symbol is
// a five-bar meter, like signal strength: one bar lit is the lowest level, five the top.

export const LEVEL_NAMES = ['Napping', 'Warming up', 'Cruising', 'Maxxing', 'Inferno'] as const

const COLORS = ['#7f869e', '#bd7a55', '#d97757', '#f58f5f', '#ff5a36']
const UNLIT = '#343950'
const BARS = ['▂', '▃', '▅', '▇', '█']

export type PixelCell = { ch: string; color: string }

// 1 to 5. Idle is asleep, an unread pace is warming up, a pace that will not last to
// the reset is the top level, and in between it follows where the pace ends the window.
export function pacingLevel(state: ForecastState, projected: number): 1 | 2 | 3 | 4 | 5 {
  if (state === 'danger' || state === 'limit') return 5
  if (state === 'idle') return 1
  if (state === 'none' || state === 'calibrating') return 2
  if (projected < 25) return 1
  if (projected < 50) return 2
  if (projected < 80) return 3
  return 4
}

export const levelColor = (level: 1 | 2 | 3 | 4 | 5) => COLORS[level - 1]!

// Five bars, rising; the first `level` are lit in the level's colour, the rest are dark.
export function levelMeter(level: 1 | 2 | 3 | 4 | 5): PixelCell[] {
  return BARS.map((ch, i) => ({ ch, color: i < level ? COLORS[level - 1]! : UNLIT }))
}

// The collapsed band's tiny symbol: one bar, as tall as the level.
export function levelGlyph(level: 1 | 2 | 3 | 4 | 5): PixelCell {
  return { ch: BARS[level - 1]!, color: COLORS[level - 1]! }
}

// The breathing block before the brand: a bar that swells and falls like a cursor that
// has had too much coffee, sweeping from the first colour to the second and back.
export const CRITTER = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂'] as const
export const CRITTER_MS = 300

export function critterFrame(now: number): { ch: string; t: number } {
  const i = Math.floor(now / CRITTER_MS) % CRITTER.length
  const half = CRITTER.length / 2
  return { ch: CRITTER[i]!, t: i <= half ? i / half : (CRITTER.length - i) / half }
}
